import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { hashPassword } from "./helpers";

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const resetAdminPasswordDev = action({
  args: {
    email: v.string(),
    newPassword: v.string(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.auth.internals.findLocalUser, {
      email: args.email,
    });
    if (!user) throw new Error(`No user with email ${args.email}`);
    const passwordHash = await hashPassword(args.newPassword);
    await ctx.runMutation(internal.auth.internals.setPasswordHash, {
      userId: user._id,
      passwordHash,
    });
    return { ok: true, userId: user._id };
  },
});
