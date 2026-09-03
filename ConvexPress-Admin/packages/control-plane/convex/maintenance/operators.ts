import { v } from "convex/values";

import { internalMutation } from "../_generated/server";

const operatorRole = v.union(
  v.literal("admin"),
  v.literal("manager"),
  v.literal("member"),
  v.literal("viewer"),
);

export const provisionForImport = internalMutation({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    role: operatorRole,
  },
  returns: v.object({
    userId: v.id("overseer_users"),
    created: v.boolean(),
    hasLogin: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const name = args.name?.trim() || undefined;
    if (
      email.length < 3 ||
      email.length > 320 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) ||
      (name !== undefined &&
        (name.length > 160 || /[\u0000-\u001f\u007f]/u.test(name)))
    ) {
      throw new Error("Imported operator identity is invalid");
    }
    const matches = await ctx.db
      .query("overseer_users")
      .withIndex("email", (q) => q.eq("email", email))
      .take(2);
    if (matches.length > 1) throw new Error("Duplicate imported operator email");
    if (matches[0]) {
      if (matches[0].role !== args.role) {
        throw new Error("Imported operator already exists with another role");
      }
      if (matches[0].isActive === false) {
        throw new Error("Imported operator is inactive");
      }
      return {
        userId: matches[0]._id,
        created: false,
        hasLogin: Boolean(matches[0].authUserId),
      };
    }
    const userId = await ctx.db.insert("overseer_users", {
      email,
      name,
      role: args.role,
      isActive: true,
      createdAt: Date.now(),
    });
    return { userId, created: true, hasLogin: false };
  },
});
