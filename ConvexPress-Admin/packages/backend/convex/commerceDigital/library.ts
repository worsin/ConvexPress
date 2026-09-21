import { paginationOptsValidator, type PaginationOptions, type RegisteredQuery } from "convex/server";
import { ConvexError, v } from "convex/values";
import { query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getCurrentUser } from "../helpers/permissions";
import { isPluginEnabled } from "../helpers/plugins";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { readDownloadEntitlement } from "./downloadEntitlement";

export type LibraryItem = {
  id: Id<"commerce_download_tokens">;
  title: string; fileName: string; label: string; version: string;
  orderNumber: string; purchasedAt: number; fileSize: number | null;
  remainingDownloads: number | null; expiresAt: number | null;
  status: "available" | "expired" | "exhausted" | "unavailable";
  token: string | null;
};
export type LibraryPage = { page: LibraryItem[]; isDone: boolean; continueCursor: string; expiresAt: number };
export type LibraryArgs = { instanceKey: string; refreshKey: string; paginationOpts: PaginationOptions };
const itemValidator = v.object({
  id: v.id("commerce_download_tokens"), title: v.string(), fileName: v.string(), label: v.string(), version: v.string(),
  orderNumber: v.string(), purchasedAt: v.number(), fileSize: v.union(v.number(), v.null()),
  remainingDownloads: v.union(v.number(), v.null()), expiresAt: v.union(v.number(), v.null()),
  status: v.union(v.literal("available"), v.literal("expired"), v.literal("exhausted"), v.literal("unavailable")),
  token: v.union(v.string(), v.null()),
});

/** Viewer-only projection. Neither raw purchase records, addresses, storage IDs,
 * license keys nor URLs enter the block's canonical/public document data. */
export const page: RegisteredQuery<"public", LibraryArgs, LibraryPage | null> = query({
  args: { instanceKey: v.string(), refreshKey: v.string(), paginationOpts: paginationOptsValidator },
  returns: v.union(v.null(), v.object({ page: v.array(itemValidator), isDone: v.boolean(), continueCursor: v.string(), expiresAt: v.number() })),
  handler: async (ctx, args) => {
    const { numItems, cursor } = args.paginationOpts;
    if (!Number.isSafeInteger(numItems) || numItems < 1 || numItems > 12 || (cursor?.length ?? 0) > 8192 || args.refreshKey.length > 128) {
      throw new ConvexError({ code: "INVALID_DOWNLOAD_PAGE", message: "Invalid downloads page." });
    }
    if (!args.instanceKey || args.instanceKey.length > 256) return null;
    const ledger = new RequestReadLedger(), now = Date.now();
    ledger.beforeRead();
    const site = ledger.record(await ctx.db.query("convexpress_siteIdentity").withIndex("by_identity_key", q => q.eq("identityKey", "site-identity")).unique());
    if (site?.instanceKey !== args.instanceKey || !(await isPluginEnabled(ctx, "commerce")) || !(await isPluginEnabled(ctx, "commerceDigital"))) return null;
    const user = await getCurrentUser(ctx, ledger);
    if (!user || user.status !== "active") return null;
    ledger.beforeRead();
    const result = await ctx.db.query("commerce_download_tokens").withIndex("by_user", q => q.eq("userId", user._id)).order("desc").paginate({ numItems, cursor, maximumRowsRead: 12, maximumBytesRead: 128 * 1024 });
    const page: LibraryItem[] = [];
    for (const raw of result.page) {
      const token = ledger.record(raw);
      if (token.userId !== user._id) continue;
      ledger.beforeRead();
      const order = ledger.record(await ctx.db.get(token.orderId));
      if (!order || order.userId !== user._id) continue;
      ledger.beforeRead();
      const item = ledger.record(await ctx.db.get(token.orderItemId));
      if (!item || item.orderId !== order._id) continue;
      ledger.beforeRead();
      const file = ledger.record(await ctx.db.get(token.digitalFileId));
      if (!file || file.productId !== item.productId || (file.variantId !== undefined && file.variantId !== item.variantId)) {
        page.push({ id: token._id, title: item.productTitle.slice(0, 300), fileName: "File no longer available", label: "Purchased file", version: "", orderNumber: order.orderNumber.slice(0, 100), purchasedAt: order.createdAt, fileSize: null, remainingDownloads: null, expiresAt: null, status: "unavailable", token: null });
        continue;
      }
      // Shared delivery checks remain authoritative for the action, including on
      // clicks made after this short-lived display snapshot expires.
      const access = await readDownloadEntitlement(ctx, token.token, now, ledger);
      const status = access.success ? "available" : !token.isActive ? "unavailable" : token.expiresAt !== undefined && token.expiresAt <= now ? "expired" : token.maxDownloads !== undefined && token.downloadCount >= token.maxDownloads ? "exhausted" : "unavailable";
      ledger.noteAuthorizationBoundary(token.expiresAt, now);
      page.push({ id: token._id, title: item.productTitle.slice(0, 300), fileName: file.fileName.slice(0, 500), label: file.name.slice(0, 200), version: file.version.slice(0, 80), orderNumber: order.orderNumber.slice(0, 100), purchasedAt: order.createdAt, fileSize: access.success ? access.storageSize : null, remainingDownloads: access.success ? access.remainingDownloads : null, expiresAt: token.expiresAt !== undefined && Number.isFinite(token.expiresAt) ? token.expiresAt : null, status, token: access.success ? token.token : null });
    }
    return { page, isDone: result.isDone, continueCursor: result.continueCursor, expiresAt: Math.min(now + 15000, ledger.authorizationRecheckAt ?? Infinity) };
  },
});
