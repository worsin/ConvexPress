import { v } from "convex/values";

import { authorizedMutation } from "./rbac/functions";

const manageAccess = authorizedMutation({
  selector: { type: "capability", code: "rbac.manage" },
  target: {},
});

const accessLevel = v.union(v.literal("use"), v.literal("manage"));

async function requireSubjectUser(ctx: { db: any }, subjectId: string) {
  const userId = ctx.db.normalizeId("overseer_users", subjectId);
  const user = userId ? await ctx.db.get(userId) : null;
  if (!user || user.isActive === false) {
    throw new Error("Access subject must be an active outer operator");
  }
  return String(user._id);
}

export const grantOrganization = manageAccess({
  args: {
    subjectId: v.string(),
    organizationId: v.id("overseer_organizations"),
    level: accessLevel,
  },
  returns: v.id("overseer_organizationAccess"),
  handler: async (ctx, args) => {
    const subjectId = await requireSubjectUser(ctx, args.subjectId);
    const organization = await ctx.db.get(args.organizationId);
    if (!organization?.isActive) throw new Error("Organization is not active");
    const matches = await ctx.db
      .query("overseer_organizationAccess")
      .withIndex("by_subject_organization", (q) =>
        q
          .eq("subjectType", "user")
          .eq("subjectId", subjectId)
          .eq("organizationId", args.organizationId),
      )
      .take(2);
    if (matches.length > 1) throw new Error("Duplicate organization access grant");
    if (matches[0]) {
      await ctx.db.patch(matches[0]._id, {
        level: args.level,
        grantedBy: String(ctx.operator._id),
        grantedAt: Date.now(),
      });
      return matches[0]._id;
    }
    return await ctx.db.insert("overseer_organizationAccess", {
      subjectType: "user",
      subjectId,
      organizationId: args.organizationId,
      level: args.level,
      grantedBy: String(ctx.operator._id),
      grantedAt: Date.now(),
    });
  },
});

export const grantBusiness = manageAccess({
  args: {
    subjectId: v.string(),
    businessId: v.id("overseer_businesses"),
    level: accessLevel,
  },
  returns: v.id("overseer_businessAccess"),
  handler: async (ctx, args) => {
    const subjectId = await requireSubjectUser(ctx, args.subjectId);
    const business = await ctx.db.get(args.businessId);
    if (!business?.isActive) throw new Error("Business is not active");
    const matches = await ctx.db
      .query("overseer_businessAccess")
      .withIndex("by_subject_business", (q) =>
        q
          .eq("subjectType", "user")
          .eq("subjectId", subjectId)
          .eq("businessId", args.businessId),
      )
      .take(2);
    if (matches.length > 1) throw new Error("Duplicate business access grant");
    if (matches[0]) {
      await ctx.db.patch(matches[0]._id, {
        level: args.level,
        grantedBy: String(ctx.operator._id),
        grantedAt: Date.now(),
      });
      return matches[0]._id;
    }
    return await ctx.db.insert("overseer_businessAccess", {
      subjectType: "user",
      subjectId,
      businessId: args.businessId,
      level: args.level,
      grantedBy: String(ctx.operator._id),
      grantedAt: Date.now(),
    });
  },
});

export const grantWebsite = manageAccess({
  args: {
    subjectId: v.string(),
    websiteId: v.id("overseer_websites"),
    level: accessLevel,
    includeEnvironments: v.boolean(),
  },
  returns: v.id("overseer_websiteAccess"),
  handler: async (ctx, args) => {
    const subjectId = await requireSubjectUser(ctx, args.subjectId);
    const website = await ctx.db.get(args.websiteId);
    if (!website || website.status !== "active") throw new Error("Website is not active");
    const matches = await ctx.db
      .query("overseer_websiteAccess")
      .withIndex("by_subject_website", (q) =>
        q
          .eq("subjectType", "user")
          .eq("subjectId", subjectId)
          .eq("websiteId", args.websiteId),
      )
      .take(2);
    if (matches.length > 1) throw new Error("Duplicate website access grant");
    if (matches[0]) {
      await ctx.db.patch(matches[0]._id, {
        level: args.level,
        includeEnvironments: args.includeEnvironments,
        grantedBy: String(ctx.operator._id),
        grantedAt: Date.now(),
      });
      return matches[0]._id;
    }
    return await ctx.db.insert("overseer_websiteAccess", {
      subjectType: "user",
      subjectId,
      websiteId: args.websiteId,
      level: args.level,
      includeEnvironments: args.includeEnvironments,
      grantedBy: String(ctx.operator._id),
      grantedAt: Date.now(),
    });
  },
});

export const revokeOrganization = manageAccess({
  args: {
    subjectId: v.string(),
    organizationId: v.id("overseer_organizations"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const subjectId = await requireSubjectUser(ctx, args.subjectId);
    const matches = await ctx.db
      .query("overseer_organizationAccess")
      .withIndex("by_subject_organization", (q) =>
        q
          .eq("subjectType", "user")
          .eq("subjectId", subjectId)
          .eq("organizationId", args.organizationId),
      )
      .take(2);
    if (matches.length > 1) throw new Error("Duplicate organization access grant");
    if (!matches[0]) return false;
    await ctx.db.delete(matches[0]._id);
    return true;
  },
});

export const revokeBusiness = manageAccess({
  args: {
    subjectId: v.string(),
    businessId: v.id("overseer_businesses"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const subjectId = await requireSubjectUser(ctx, args.subjectId);
    const matches = await ctx.db
      .query("overseer_businessAccess")
      .withIndex("by_subject_business", (q) =>
        q
          .eq("subjectType", "user")
          .eq("subjectId", subjectId)
          .eq("businessId", args.businessId),
      )
      .take(2);
    if (matches.length > 1) throw new Error("Duplicate business access grant");
    if (!matches[0]) return false;
    await ctx.db.delete(matches[0]._id);
    return true;
  },
});

export const revokeWebsite = manageAccess({
  args: {
    subjectId: v.string(),
    websiteId: v.id("overseer_websites"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const subjectId = await requireSubjectUser(ctx, args.subjectId);
    const matches = await ctx.db
      .query("overseer_websiteAccess")
      .withIndex("by_subject_website", (q) =>
        q
          .eq("subjectType", "user")
          .eq("subjectId", subjectId)
          .eq("websiteId", args.websiteId),
      )
      .take(2);
    if (matches.length > 1) throw new Error("Duplicate website access grant");
    if (!matches[0]) return false;
    await ctx.db.delete(matches[0]._id);
    return true;
  },
});
