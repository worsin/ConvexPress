import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalMutation } from "../_generated/server";

const expireRef = makeFunctionReference<"mutation">("management/sessionExpiry:expire");
const sweepRef = makeFunctionReference<"mutation">("management/sessionExpiry:sweep");

/** Persist the deadline transition so cached queries and subscriptions lose
 * their authorization dependency even when no other site data changes. */
export const expire = internalMutation({
  args: { sessionId: v.id("convexpress_managementSessions"), expectedExpiresAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get("convexpress_managementSessions", args.sessionId);
    if (!session || session.status !== "active" || session.expiresAt !== args.expectedExpiresAt) return null;
    if (session.expiresAt > Date.now()) {
      await ctx.scheduler.runAt(session.expiresAt, expireRef, args);
      return null;
    }
    await ctx.db.patch("convexpress_managementSessions", session._id, {
      status: "revoked", revokedAt: Date.now(),
    });
    return null;
  },
});

/** Repair sessions issued before deadline scheduling, or an interrupted
 * scheduler. The active/deadline index keeps historical sessions out of scans. */
export const sweep = internalMutation({
  args: {}, returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db.query("convexpress_managementSessions")
      .withIndex("by_status_expiry", q => q.eq("status", "active").lte("expiresAt", now))
      .take(100);
    for (const session of expired) {
      await ctx.db.patch("convexpress_managementSessions", session._id, {
        status: "revoked", revokedAt: now,
      });
    }
    if (expired.length === 100) await ctx.scheduler.runAfter(0, sweepRef, {});
    return null;
  },
});
