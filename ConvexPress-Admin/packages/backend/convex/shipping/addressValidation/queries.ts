import { internalQuery, query } from "../../_generated/server";
import { requireCan } from "../../helpers/permissions";
import { getValidationArgs } from "./validators";

import { v } from "convex/values";
import { shippingDocs } from "../../schema/shipping.docs.generated";
/**
 * Internal — look up a cached validation by fingerprint. Returns null if absent
 * or expired. Callers should short-circuit on hit.
 */
export const getValidationByFingerprintInternal = internalQuery({
  args: getValidationArgs,
  returns: v.union(v.null(), shippingDocs.commerce_address_validations),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("commerce_address_validations")
      .withIndex("by_fingerprint", (q) => q.eq("fingerprint", args.fingerprint))
      .unique();
    if (!row) return null;
    if (row.expiresAt < Date.now()) return null;
    return row;
  },
});

/**
 * Public admin query — inspect validation cache stats.
 */
export const stats = query({
  args: {},
  returns: v.object({
    totalCached: v.number(),
    totalActive: v.number(),
    totalExpired: v.number(),
    byStatus: v.record(v.string(), v.number()),
    byProvider: v.record(v.string(), v.number()),
  }),
  handler: async (ctx) => {
    await requireCan(ctx, "shipping.address_validation.read");
    const all = await ctx.db.query("commerce_address_validations").collect();
    const now = Date.now();
    const active = all.filter((r) => r.expiresAt >= now);
    const byStatus = active.reduce((acc: Record<string, number>, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});
    const byProvider = active.reduce((acc: Record<string, number>, r) => {
      acc[r.provider] = (acc[r.provider] ?? 0) + 1;
      return acc;
    }, {});
    return {
      totalCached: all.length,
      totalActive: active.length,
      totalExpired: all.length - active.length,
      byStatus,
      byProvider,
    };
  },
});
