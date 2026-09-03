import { v } from "convex/values";

import { normalizeEntityName, normalizeSlug } from "./hierarchyPolicy";
import { authenticatedQuery, authorizedMutation } from "./rbac/functions";

const manageHierarchy = authorizedMutation({
  selector: { type: "capability", code: "hierarchy.manage" },
  target: {},
});

const organizationResult = v.object({
  organizationId: v.id("overseer_organizations"),
  name: v.string(),
  slug: v.string(),
  description: v.union(v.string(), v.null()),
  isActive: v.boolean(),
  defaultBusinessId: v.union(v.id("overseer_businesses"), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

function summarize(
  organization: {
    _id: any;
    name: string;
    slug: string;
    description?: string;
    isActive: boolean;
    defaultBusinessId?: any;
    createdAt: number;
    updatedAt: number;
  },
) {
  return {
    organizationId: organization._id,
    name: organization.name,
    slug: organization.slug,
    description: organization.description ?? null,
    isActive: organization.isActive,
    defaultBusinessId: organization.defaultBusinessId ?? null,
    createdAt: organization.createdAt,
    updatedAt: organization.updatedAt,
  };
}

async function assertUniqueSlug(
  ctx: { db: any },
  slug: string,
  exceptId?: string,
) {
  const matches = await ctx.db
    .query("overseer_organizations")
    .withIndex("by_slug", (q: any) => q.eq("slug", slug))
    .take(2);
  if (matches.some((row: any) => String(row._id) !== exceptId)) {
    throw new Error(`An organization with slug ${slug} already exists`);
  }
}

export const create = manageHierarchy({
  args: {
    name: v.string(),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  returns: organizationResult,
  handler: async (ctx, args) => {
    const name = normalizeEntityName(args.name);
    const slug = normalizeSlug(args.slug ?? name);
    await assertUniqueSlug(ctx, slug);
    const now = Date.now();
    const organizationId = await ctx.db.insert("overseer_organizations", {
      name,
      slug,
      description: args.description?.trim() || undefined,
      ownerUserId: ctx.operator._id,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    return summarize((await ctx.db.get(organizationId))!);
  },
});

export const update = manageHierarchy({
  args: {
    organizationId: v.id("overseer_organizations"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  returns: organizationResult,
  handler: async (ctx, args) => {
    const organization = await ctx.db.get(args.organizationId);
    if (!organization) throw new Error("Organization not found");
    const slug =
      args.slug === undefined ? organization.slug : normalizeSlug(args.slug);
    if (slug !== organization.slug) {
      await assertUniqueSlug(ctx, slug, String(organization._id));
    }
    await ctx.db.patch(organization._id, {
      name:
        args.name === undefined
          ? organization.name
          : normalizeEntityName(args.name),
      slug,
      description:
        args.description === undefined
          ? organization.description
          : args.description.trim() || undefined,
      isActive: args.isActive ?? organization.isActive,
      updatedAt: Date.now(),
    });
    return summarize((await ctx.db.get(organization._id))!);
  },
});

export const list = authenticatedQuery({
  args: { includeInactive: v.optional(v.boolean()) },
  returns: v.array(organizationResult),
  handler: async (ctx, args) => {
    const isAdmin = ctx.operator.role === "owner" || ctx.operator.role === "admin";
    if (args.includeInactive && !isAdmin) {
      throw new Error("Only an owner or admin may list inactive organizations");
    }

    let organizations;
    if (isAdmin) {
      organizations = args.includeInactive
        ? await ctx.db.query("overseer_organizations").order("asc").take(200)
        : await ctx.db
            .query("overseer_organizations")
            .withIndex("by_active", (q) => q.eq("isActive", true))
            .take(200);
    } else {
      const subjectId = String(ctx.operator._id);
      const [organizationAccess, businessAccess, websiteAccess] = await Promise.all([
        ctx.db
          .query("overseer_organizationAccess")
          .withIndex("by_subject", (q) =>
            q.eq("subjectType", "user").eq("subjectId", subjectId),
          )
          .take(200),
        ctx.db
          .query("overseer_businessAccess")
          .withIndex("by_subject", (q) =>
            q.eq("subjectType", "user").eq("subjectId", subjectId),
          )
          .take(200),
        ctx.db
          .query("overseer_websiteAccess")
          .withIndex("by_subject", (q) =>
            q.eq("subjectType", "user").eq("subjectId", subjectId),
          )
          .take(500),
      ]);
      const [businesses, websites] = await Promise.all([
        Promise.all(businessAccess.map((grant) => ctx.db.get(grant.businessId))),
        Promise.all(websiteAccess.map((grant) => ctx.db.get(grant.websiteId))),
      ]);
      const ids = new Set([
        ...organizationAccess.map((grant) => String(grant.organizationId)),
        ...businesses.flatMap((business) =>
          business?.organizationId ? [String(business.organizationId)] : [],
        ),
        ...websites.flatMap((website) =>
          website?.organization_id ? [String(website.organization_id)] : [],
        ),
      ]);
      organizations = (
        await Promise.all(
          [...ids].map((id) => {
            const organizationId = ctx.db.normalizeId("overseer_organizations", id);
            return organizationId ? ctx.db.get(organizationId) : null;
          }),
        )
      ).filter((organization) => organization?.isActive);
    }

    return organizations
      .filter((organization): organization is NonNullable<typeof organization> => Boolean(organization))
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(summarize);
  },
});
