import { v } from "convex/values";

import { authorizedMutation, authorizedQuery } from "./rbac/functions";
import { authenticatedQuery } from "./rbac/functions";

const manageOperatorsRequest = {
  selector: { type: "capability" as const, code: "rbac.manage" },
  target: {},
};

const operatorRole = v.union(
  v.literal("admin"),
  v.literal("manager"),
  v.literal("member"),
  v.literal("viewer"),
);

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (
    email.length < 3 ||
    email.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)
  ) {
    throw new Error("Invalid operator email");
  }
  return email;
}

function cleanOptionalName(value: string | undefined) {
  const name = value?.trim();
  if (!name) return undefined;
  if (name.length > 160 || /[\u0000-\u001f\u007f]/u.test(name)) {
    throw new Error("Invalid operator name");
  }
  return name;
}

export const provision = authorizedMutation(manageOperatorsRequest)({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    role: operatorRole,
  },
  returns: v.object({
    userId: v.id("overseer_users"),
    created: v.boolean(),
    claimable: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const name = cleanOptionalName(args.name);
    const matches = await ctx.db
      .query("overseer_users")
      .withIndex("email", (q) => q.eq("email", email))
      .take(2);
    if (matches.length > 1) {
      throw new Error("Duplicate operator email must be repaired before provisioning");
    }
    if (matches[0]) {
      if (matches[0].authUserId) {
        throw new Error("This operator already has a login");
      }
      await ctx.db.patch(matches[0]._id, {
        name: name ?? matches[0].name,
        role: args.role,
        isActive: true,
        updatedAt: Date.now(),
      });
      return { userId: matches[0]._id, created: false, claimable: true };
    }

    const userId = await ctx.db.insert("overseer_users", {
      email,
      name,
      role: args.role,
      isActive: true,
      createdAt: Date.now(),
      createdBy: ctx.operator._id,
    });
    return { userId, created: true, claimable: true };
  },
});

export const setActive = authorizedMutation(manageOperatorsRequest)({
  args: {
    userId: v.id("overseer_users"),
    isActive: v.boolean(),
  },
  returns: v.id("overseer_users"),
  handler: async (ctx, args) => {
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("Operator not found");
    if (target._id === ctx.operator._id && !args.isActive) {
      throw new Error("An operator cannot deactivate their own account");
    }
    await ctx.db.patch(args.userId, {
      isActive: args.isActive,
      updatedAt: Date.now(),
    });
    return args.userId;
  },
});

export const list = authorizedQuery(manageOperatorsRequest)({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      userId: v.id("overseer_users"),
      email: v.union(v.string(), v.null()),
      name: v.union(v.string(), v.null()),
      role: v.union(
        v.literal("owner"),
        v.literal("admin"),
        v.literal("manager"),
        v.literal("member"),
        v.literal("viewer"),
      ),
      isActive: v.boolean(),
      hasLogin: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const requestedLimit = args.limit ?? 100;
    if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 200) {
      throw new Error("Operator list limit must be between 1 and 200");
    }
    const users = await ctx.db.query("overseer_users").order("desc").take(requestedLimit);
    return users.map((user) => ({
      userId: user._id,
      email: user.email ?? null,
      name: user.name ?? null,
      role: user.role,
      isActive: user.isActive !== false,
      hasLogin: Boolean(user.authUserId),
    }));
  },
});

export const current = authenticatedQuery({
  args: {},
  returns: v.object({
    userId: v.id("overseer_users"),
    email: v.union(v.string(), v.null()),
    name: v.union(v.string(), v.null()),
    role: v.union(
      v.literal("owner"),
      v.literal("admin"),
      v.literal("manager"),
      v.literal("member"),
      v.literal("viewer"),
    ),
  }),
  handler: async (ctx) => ({
    userId: ctx.operator._id,
    email: ctx.operator.email ?? null,
    name: ctx.operator.name ?? null,
    role: ctx.operator.role,
  }),
});
