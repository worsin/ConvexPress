import { internalMutation } from "../../_generated/server";
import { emitEvent } from "../../helpers/events";
import { SHIPPING_EVENTS } from "../../events/constants";
import { recordValidationArgs } from "./validators";

const VALID_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const INVALID_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Internal — writes a validation result to the cache. Called by the validateAddress
 * action (which runs in Node and talks to external APIs).
 */
export const recordValidation = internalMutation({
  args: recordValidationArgs,
  handler: async (ctx, args) => {
    const ttl =
      args.ttlMs ??
      (args.status === "valid" || args.status === "corrected"
        ? VALID_TTL_MS
        : INVALID_TTL_MS);

    const existing = await ctx.db
      .query("commerce_address_validations")
      .withIndex("by_fingerprint", (q: any) => q.eq("fingerprint", args.fingerprint))
      .unique();

    const now = Date.now();
    const payload = {
      fingerprint: args.fingerprint,
      provider: args.provider,
      status: args.status,
      inputAddress: args.inputAddress,
      normalizedAddress: args.normalizedAddress,
      isResidential: args.isResidential,
      deliveryPoint: args.deliveryPoint,
      warnings: args.warnings,
      geocode: args.geocode,
      rawResponse: args.rawResponse,
      validatedAt: now,
      expiresAt: now + ttl,
    };

    let id: any;
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      id = existing._id;
    } else {
      id = await ctx.db.insert("commerce_address_validations", payload);
    }
    await emitEvent(ctx, SHIPPING_EVENTS.ADDRESS_VALIDATED, "shipping", {
      validationId: id,
      provider: args.provider,
      status: args.status,
      fingerprint: args.fingerprint,
    });
    return id;
  },
});

export const purgeExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("commerce_address_validations")
      .withIndex("by_expires", (q: any) => q.lt("expiresAt", now))
      .collect();
    for (const row of expired) {
      await ctx.db.delete(row._id);
    }
    return { purged: expired.length };
  },
});
