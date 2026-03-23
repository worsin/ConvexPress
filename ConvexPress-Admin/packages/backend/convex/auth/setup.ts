import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { hashPassword } from "./helpers";

export const createFirstAdmin = action({
  args: {
    email: v.string(),
    username: v.string(),
    password: v.string(),
    displayName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existingAdmins = await ctx.runQuery(internal.auth.internals.checkExistingAdmins);
    if (existingAdmins) {
      throw new Error("An administrator account already exists");
    }

    const passwordHash = await hashPassword(args.password);

    const userId = await ctx.runMutation(internal.auth.internals.createAdminUser, {
      email: args.email,
      username: args.username,
      passwordHash,
      displayName: args.displayName ?? args.username,
    });

    return { userId, message: "Administrator account created" };
  },
});
