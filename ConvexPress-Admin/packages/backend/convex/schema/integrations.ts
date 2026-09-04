/**
 * Integration verification results.
 *
 * One row per provider, overwritten on every check. Holds only safe,
 * displayable data: never a credential, never a raw provider response.
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

export const integrationCheckStatusValidator = v.union(
  v.literal("verified"),
  v.literal("failed"),
  v.literal("skipped"),
);

export const integrationCheckDetailValidator = v.object({
  label: v.string(),
  ok: v.boolean(),
  note: v.optional(v.string()),
});

export const integrationsTables = {
  integration_checks: defineTable({
    providerId: v.string(),
    status: integrationCheckStatusValidator,
    checkedAt: v.number(),
    checkedBy: v.optional(v.id("users")),
    latencyMs: v.optional(v.number()),
    /** One sentence for the card ("Connected as acct_…, USD"). */
    summary: v.string(),
    details: v.array(integrationCheckDetailValidator),
    /** SHA-256 of the configuration that was verified; stale when it changes. */
    configFingerprint: v.string(),
  }).index("by_provider", ["providerId"]),
};
