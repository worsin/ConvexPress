/** Stable browser entry points dispatch only through the current saved block's
 * table-owned provider. Callers never supply table names or function paths. */
import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { action, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { RequestReadLedger } from "./helpers/requestReadLedger";
import { readPublicBlockSource } from "./canonicalDocuments/publicBlockSource";
import { findRsvpSource, type RsvpSourceSnapshot } from "./canonicalDocuments/rsvpSources";
import { targetArgs, writeArgs, type Write } from "./extensions/events/rsvp";
import { refuse, type RsvpTarget } from "./extensions/events/rsvpAuthority";
import { rsvpReceiptValidator, createRsvpSnapshotValidator } from "./extensions/events/rsvpValidators";
const rsvpSnapshotValidator = createRsvpSnapshotValidator(v.string());
import type { RsvpReceipt } from "./canonicalDocuments/foundation/rsvpContracts";

async function select(ctx: QueryCtx, target: RsvpTarget, budget = new RequestReadLedger()) {
  const source = await readPublicBlockSource(ctx, { ...target, plugin: "forms", blockName: "core/event-rsvp" }, budget);
  const raw = (source?.node.attrs as { event?: unknown } | undefined)?.event;
  return typeof raw === "string" ? findRsvpSource(ctx, raw) : null;
}
export const get = query({
  args: { ...targetArgs, refreshKey: v.optional(v.string()) }, returns: v.union(v.null(), rsvpSnapshotValidator),
  handler: async (ctx, args): Promise<RsvpSourceSnapshot | null> => {
    if (args.refreshKey !== undefined && args.refreshKey.length > 128) return null;
    const budget = new RequestReadLedger(), source = await select(ctx, args, budget);
    return source ? source.readSnapshot(ctx, args, budget) : null;
  },
});
export const submit = mutation({
  args: writeArgs, returns: rsvpReceiptValidator,
  handler: async (ctx, args): Promise<RsvpReceipt> => {
    const source = await select(ctx, args);
    if (!source) return refuse();
    return source.write(ctx, args);
  },
});
export const verificationTarget = internalQuery({
  args: targetArgs, returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => (await select(ctx, args))?.verifiedAction ?? null,
});
export const submitWithVerification = action({
  args: { ...writeArgs, captchaToken: v.optional(v.string()) }, returns: rsvpReceiptValidator,
  handler: async (ctx, args): Promise<RsvpReceipt> => {
    const { postId, blockId, instanceKey, password, visitorToken } = args;
    const path = await ctx.runQuery(makeFunctionReference<"query", RsvpTarget, string | null>("canonicalRsvp:verificationTarget"), { postId, blockId, instanceKey, password, visitorToken });
    if (!path) return refuse();
    // The chosen handler rechecks saved authority and verification policy at
    // every subsequent read/write, including after a concurrent block edit.
    return ctx.runAction(makeFunctionReference<"action", Write & { captchaToken?: string }, RsvpReceipt>(path), args);
  },
});
