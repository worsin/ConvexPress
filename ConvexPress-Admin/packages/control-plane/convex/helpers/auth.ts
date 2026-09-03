import type { MutationCtx, QueryCtx } from "../_generated/server";
import { authComponent } from "../auth";

export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const authUser = await authComponent.safeGetAuthUser(ctx);
  if (!authUser) return null;

  if (authUser.userId) {
    const linkedUserId = ctx.db.normalizeId("overseer_users", authUser.userId);
    if (linkedUserId) {
      const linked = await ctx.db.get(linkedUserId);
      if (linked?.authUserId === authUser._id) {
        return linked.isActive === false ? null : linked;
      }
    }
  }

  const matches = await ctx.db
    .query("overseer_users")
    .withIndex("by_auth_user", (q) => q.eq("authUserId", authUser._id))
    .take(2);
  if (matches.length !== 1 || matches[0].isActive === false) return null;
  return matches[0];
}

export async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUser(ctx);
  if (!user) throw new Error("Authentication required");
  return user;
}
