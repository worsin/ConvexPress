import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { hashPassword } from "./helpers";

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const createFirstAdmin = action({
  args: {
    email: v.string(),
    username: v.string(),
    password: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    displayName: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const existingAdmins = await ctx.runQuery(internal.auth.internals.checkExistingAdmins);
    if (existingAdmins) {
      throw new Error("An administrator account already exists");
    }

    const passwordHash = await hashPassword(args.password);

    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    const userId = await ctx.runMutation(internal.auth.internals.createAdminUser, {
      email: args.email,
      username: args.username,
      passwordHash,
      displayName: args.displayName ?? args.username,
    });

    return { userId, message: "Administrator account created" };
  },
});
