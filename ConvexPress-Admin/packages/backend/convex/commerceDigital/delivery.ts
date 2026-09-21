import { ConvexError, v } from "convex/values";
import { makeFunctionReference, type RegisteredMutation, type RegisteredQuery } from "convex/server";
import { mutation, internalMutation, internalQuery, type QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getCurrentUser } from "../helpers/permissions";
import { requirePluginEnabled } from "../helpers/plugins";
import { readDownloadEntitlement, readLeaseEntitlement } from "./downloadEntitlement";
import { sha256Hex } from "../canonicalDocuments/foundation/shared/fingerprints";

const LEASE_LIFETIME_MS = 60 * 60 * 1000;
const MAX_PENDING_LEASES = 8;
export type LeaseProof = { leaseId: string; secret: string };
type LeaseResult = { leaseId: Id<"commerce_download_leases">; expiresAt: number; fileName: string; fileSize: number };
export type LeaseRead = { fileName: string; mimeType: string; fileSize: number; etag: string; expiresAt: number; url: string };
const deny = (): never => { throw new ConvexError({ code: "DOWNLOAD_UNAVAILABLE", message: "This download session is unavailable. Start a new download from your purchases." }); };
const validSecret = (value: string) => /^[a-f0-9]{64}$/.test(value);
function sameHash(left: string, right: string): boolean {
  if (left.length !== 64 || right.length !== 64) return false;
  let difference = 0;
  for (let i = 0; i < 64; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}
async function identity(ctx: Pick<QueryCtx, "db">) {
  const result = await ctx.db.query("convexpress_siteIdentity").withIndex("by_identity_key", q => q.eq("identityKey", "site-identity")).unique();
  if (!result) return deny();
  return result;
}
type Access = Extract<Awaited<ReturnType<typeof readDownloadEntitlement>>, { success: true }>;
function fingerprint(access: Access): string {
  return sha256Hex(JSON.stringify([access.file._id, access.file.storageId, access.file.updatedAt, access.storageSize, access.storageSha256]));
}
async function authorizedLease(ctx: QueryCtx, proof: LeaseProof) {
  await requirePluginEnabled(ctx, "commerceDigital");
  if (!validSecret(proof.secret)) return deny();
  const leaseId = ctx.db.normalizeId("commerce_download_leases", proof.leaseId);
  if (!leaseId) return deny();
  const lease = await ctx.db.get(leaseId);
  const now = Date.now();
  if (!lease || !Number.isSafeInteger(lease.expiresAt) || !Number.isSafeInteger(lease.createdAt) || lease.createdAt > now || lease.expiresAt - lease.createdAt > LEASE_LIFETIME_MS || lease.expiresAt <= now || lease.started !== (lease.allowanceOrdinal !== undefined) || !sameHash(lease.secretHash, sha256Hex(proof.secret))) return deny();
  const site = await identity(ctx);
  if (lease.websiteKey !== site.websiteKey || lease.instanceKey !== site.instanceKey || lease.deploymentOrigin !== site.deploymentOrigin) return deny();
  const access = await readLeaseEntitlement(ctx, lease, now);
  if (!access.success || fingerprint(access) !== lease.fileFingerprint) return deny();
  return { lease, access };
}

/** The caller keeps the random secret; only its digest is stored. A retry must
 * supply the same request ID and secret, and never extends the original lease. */
export const beginLease: RegisteredMutation<"public", { token: string; requestId: string; secret: string }, LeaseResult> = mutation({
  args: { token: v.string(), requestId: v.string(), secret: v.string() },
  returns: v.object({ leaseId: v.id("commerce_download_leases"), expiresAt: v.number(), fileName: v.string(), fileSize: v.number() }),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceDigital");
    if (!args.token || args.token.length > 256 || !validSecret(args.secret) || !/^[a-zA-Z0-9_-]{16,80}$/.test(args.requestId)) return deny();
    // Resolve the token identity first so a completed allowance can recover an
    // existing request. Reusing that request still requires the purchasing user.
    const token = await ctx.db.query("commerce_download_tokens").withIndex("by_token", q => q.eq("token", args.token)).unique();
    if (!token) return deny();
    const existing = await ctx.db.query("commerce_download_leases").withIndex("by_token_request", q => q.eq("downloadTokenId", token._id).eq("requestId", args.requestId)).unique();
    if (existing) {
      const result = await authorizedLease(ctx, { leaseId: existing._id, secret: args.secret });
      // The delivery capability can resume a transfer, but public begin/retry
      // must separately retain purchaser authentication, even after consumption.
      if (result.access.order.userId) {
        const user = await getCurrentUser(ctx);
        if (!user || user.status !== "active" || user._id !== result.access.order.userId) return deny();
      }
      return { leaseId: existing._id, expiresAt: existing.expiresAt, fileName: result.access.file.fileName, fileSize: result.access.storageSize };
    }
    const now = Date.now();
    const access = await readDownloadEntitlement(ctx, args.token, now);
    if (!access.success) return deny();
    const site = await identity(ctx);
    const live = await ctx.db.query("commerce_download_leases").withIndex("by_token_pending_expires", q => q.eq("downloadTokenId", token._id).eq("started", false).gt("expiresAt", now)).take(MAX_PENDING_LEASES);
    if (live.length >= MAX_PENDING_LEASES) throw new ConvexError({ code: "DOWNLOAD_SESSION_LIMIT", message: "Too many pending download requests. Resume an existing request or try again later." });
    const expiresAt = Math.min(now + LEASE_LIFETIME_MS, token.expiresAt ?? Number.MAX_SAFE_INTEGER);
    const leaseId = await ctx.db.insert("commerce_download_leases", { downloadTokenId: token._id, digitalFileId: access.file._id, orderId: access.order._id, userId: access.order.userId, requestId: args.requestId, secretHash: sha256Hex(args.secret), websiteKey: site.websiteKey, instanceKey: site.instanceKey, deploymentOrigin: site.deploymentOrigin, fileFingerprint: fingerprint(access), createdAt: now, expiresAt, started: false });
    await ctx.scheduler.runAfter(expiresAt - now, makeFunctionReference<"mutation", { leaseId: Id<"commerce_download_leases"> }, null>("commerceDigital/delivery:expireLease"), { leaseId });
    return { leaseId, expiresAt, fileName: access.file.fileName, fileSize: access.storageSize };
  },
});

/** Internal-only response. The HTTP byte transport must never serialize this
 * object, especially url, to its caller. requestTime prevents stale query cache. */
export const readLease: RegisteredQuery<"internal", LeaseProof & { requestTime: number }, LeaseRead> = internalQuery({
  args: { leaseId: v.string(), secret: v.string(), requestTime: v.number() },
  returns: v.object({ fileName: v.string(), mimeType: v.string(), fileSize: v.number(), etag: v.string(), expiresAt: v.number(), url: v.string() }),
  handler: async (ctx, args) => {
    const { lease, access } = await authorizedLease(ctx, args);
    const url = await ctx.storage.getUrl(access.file.storageId);
    if (!url) return deny();
    return { fileName: access.file.fileName, mimeType: access.file.mimeType, fileSize: access.storageSize, etag: `"${lease.fileFingerprint}"`, expiresAt: lease.expiresAt, url };
  },
});

/** Called only after the transport has validated an upstream byte response.
 * Starting the same lease twice does not spend a second allowance. */
export const startLease: RegisteredMutation<"internal", LeaseProof, null> = internalMutation({
  args: { leaseId: v.string(), secret: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { lease, access } = await authorizedLease(ctx, args);
    if (lease.allowanceOrdinal !== undefined) return null;
    const ordinal = access.token.downloadCount + 1;
    if (!Number.isSafeInteger(ordinal)) return deny();
    const now = Date.now();
    await ctx.db.patch("commerce_download_tokens", access.token._id, { downloadCount: ordinal, lastDownloadedAt: now });
    await ctx.db.patch("commerce_download_leases", lease._id, { allowanceOrdinal: ordinal, startedAt: now, started: true });
    await ctx.db.insert("commerce_download_log", { downloadTokenId: access.token._id, digitalFileId: access.file._id, userId: access.order.userId, downloadedAt: now, success: true });
    return null;
  },
});

export const expireLease: RegisteredMutation<"internal", { leaseId: Id<"commerce_download_leases"> }, null> = internalMutation({
  args: { leaseId: v.id("commerce_download_leases") },
  returns: v.null(),
  handler: async (ctx, { leaseId }) => {
    const lease = await ctx.db.get(leaseId);
    if (lease && lease.expiresAt <= Date.now()) await ctx.db.delete("commerce_download_leases", leaseId);
    return null;
  },
});
