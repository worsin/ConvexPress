import type { Doc } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { getCurrentUser } from "../helpers/permissions";
import { RequestReadLedger } from "../helpers/requestReadLedger";

type DownloadFailure = { success: false; code: "DOWNLOAD_UNAVAILABLE"; error: string };
type AuthorizedDownload = {
  success: true;
  token: Doc<"commerce_download_tokens">;
  file: Doc<"commerce_digital_files">;
  order: Doc<"commerce_orders">;
  product: Doc<"commerce_products">;
  remainingDownloads: number | null;
  storageSize: number;
  storageSha256: string;
};
const unavailable = (): DownloadFailure => ({ success: false, code: "DOWNLOAD_UNAVAILABLE", error: "This download is unavailable. Sign in to the purchasing account or contact support." });

export function isOrderPaidForDigitalAccess(order: { status: string; paymentStatus: string } | null | undefined): boolean {
  return Boolean(order && !["cancelled", "refunded", "failed"].includes(order.status) && ["paid", "partially_refunded"].includes(order.paymentStatus));
}

/** Read authorization immediately before delivery. Only callers inside this module
 * receive storage identity and purchase records; public validation projects metadata. */
export async function readDownloadEntitlement(
  ctx: Pick<QueryCtx, "db" | "auth" | "runQuery">,
  tokenValue: string,
  now = Date.now(),
  ledger = new RequestReadLedger(),
): Promise<AuthorizedDownload | DownloadFailure> {
  if (!tokenValue || tokenValue.length > 256 || !Number.isFinite(now)) return unavailable();
  ledger.beforeRead();
  const token = ledger.record(await ctx.db.query("commerce_download_tokens").withIndex("by_token", q => q.eq("token", tokenValue)).unique());
  return readDownloadRecord(ctx, token, now, ledger);
}

/** Internal delivery code calls this only after verifying the lease capability.
 * Public query/mutation arguments never accept a lease or an owner override. */
export async function readLeaseEntitlement(ctx: Pick<QueryCtx, "db" | "auth" | "runQuery">, lease: Doc<"commerce_download_leases">, now: number, ledger = new RequestReadLedger()): Promise<AuthorizedDownload | DownloadFailure> {
  ledger.beforeRead();
  const token = ledger.record(await ctx.db.get(lease.downloadTokenId));
  return readDownloadRecord(ctx, token, now, ledger, lease);
}

async function readDownloadRecord(ctx: Pick<QueryCtx, "db" | "auth" | "runQuery">, token: Doc<"commerce_download_tokens"> | null, now: number, ledger: RequestReadLedger, lease?: Doc<"commerce_download_leases">): Promise<AuthorizedDownload | DownloadFailure> {
  if (!token || !token.isActive || !Number.isSafeInteger(token.downloadCount) || token.downloadCount < 0) return unavailable();
  if (token.expiresAt !== undefined && (!Number.isFinite(token.expiresAt) || token.expiresAt <= now)) return unavailable();
  if (lease?.allowanceOrdinal !== undefined) {
    if (!Number.isSafeInteger(lease.allowanceOrdinal) || lease.allowanceOrdinal < 1 || lease.allowanceOrdinal > token.downloadCount) return unavailable();
    if (token.maxDownloads !== undefined && (!Number.isSafeInteger(token.maxDownloads) || token.maxDownloads < lease.allowanceOrdinal)) return unavailable();
  } else if (token.maxDownloads !== undefined && (!Number.isSafeInteger(token.maxDownloads) || token.maxDownloads <= token.downloadCount)) return unavailable();
  ledger.noteAuthorizationBoundary(token.expiresAt, now);

  ledger.beforeRead();
  const order = ledger.record(await ctx.db.get(token.orderId));
  if (!order || !isOrderPaidForDigitalAccess(order)) return unavailable();
  // A fulfillment status cannot substitute for settled payment. Partial refunds
  // retain the remaining purchase; line-specific return revocation is separate.
  if (token.userId !== undefined && token.userId !== order.userId) return unavailable();
  if (order.userId) {
    let user;
    if (lease) {
      ledger.beforeRead();
      user = ledger.record(await ctx.db.get(order.userId));
    } else user = await getCurrentUser(ctx, ledger);
    if (!user || user.status !== "active" || user._id !== order.userId) return unavailable();
  }
  if (lease && (lease.downloadTokenId !== token._id || lease.orderId !== order._id || lease.userId !== order.userId || lease.digitalFileId !== token.digitalFileId)) return unavailable();
  // Orders without an owner intentionally retain the random-token guest delivery
  // capability. Once an order acquires an owner, the branch above requires login.
  ledger.beforeRead();
  const item = ledger.record(await ctx.db.get(token.orderItemId));
  if (!item || item.orderId !== order._id || !Number.isSafeInteger(item.quantity) || item.quantity < 1) return unavailable();
  ledger.beforeRead();
  const file = ledger.record(await ctx.db.get(token.digitalFileId));
  if (!file || file.productId !== item.productId || (file.variantId !== undefined && file.variantId !== item.variantId)) return unavailable();
  ledger.beforeRead();
  const product = ledger.record(await ctx.db.get(file.productId));
  if (!product) return unavailable();
  if (item.variantId) {
    ledger.beforeRead();
    const variant = ledger.record(await ctx.db.get(item.variantId));
    if (!variant || variant.productId !== product._id) return unavailable();
  }
  ledger.beforeRead();
  const storage = ledger.record(await ctx.db.system.get("_storage", file.storageId));
  if (!storage || !Number.isSafeInteger(storage.size) || storage.size < 0) return unavailable();
  return { success: true, token, file, order, product, storageSize: storage.size, storageSha256: storage.sha256, remainingDownloads: token.maxDownloads === undefined ? null : token.maxDownloads - token.downloadCount };
}

export type DownloadAttempt = { token: string; ipAddress?: string; userAgent?: string };
export type RecordedDownload = DownloadFailure | { success: true; storageId: Doc<"commerce_digital_files">["storageId"]; fileName: string; mimeType: string };

/** Atomic allowance consumption. Missing files and failed authorization never
 * write a success log or spend an allowance. This does not assert byte delivery. */
export async function recordAuthorizedDownload(ctx: MutationCtx, args: DownloadAttempt): Promise<RecordedDownload> {
  const now = Date.now();
  const access = await readDownloadEntitlement(ctx, args.token, now);
  if (!access.success) return access;
  const { token, file, order } = access;
  if (token.downloadCount >= Number.MAX_SAFE_INTEGER) return unavailable();
  // These optional client-reported fields are untrusted diagnostics, not authority.
  const ipAddress = args.ipAddress?.slice(0, 64);
  const userAgent = args.userAgent?.slice(0, 512);
  const ipAddresses = [...new Set([...(token.ipAddresses ?? []).slice(-31), ...(ipAddress ? [ipAddress] : [])])].slice(-32);
  await ctx.db.patch("commerce_download_tokens", token._id, {
    downloadCount: token.downloadCount + 1,
    lastDownloadedAt: now,
    lastIpAddress: ipAddress,
    ipAddresses,
  });
  await ctx.db.insert("commerce_download_log", { downloadTokenId: token._id, digitalFileId: file._id, userId: order.userId, downloadedAt: now, ipAddress, userAgent, success: true });
  return { success: true, storageId: file.storageId, fileName: file.fileName, mimeType: file.mimeType };
}
