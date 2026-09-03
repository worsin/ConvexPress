import { v } from "convex/values";

import {
  chooseDefaultId,
  normalizeEntityName,
  normalizeSlug,
  requireActiveParent,
} from "./hierarchyPolicy";
import {
  assertStoredAccess,
  authenticatedMutation,
  authenticatedQuery,
  authorizedMutation,
} from "./rbac/functions";

const createBusiness = authorizedMutation({
  selector: { type: "capability", code: "hierarchy.manage" },
  target: {},
});

const businessResult = v.object({
  businessId: v.id("overseer_businesses"),
  organizationId: v.id("overseer_organizations"),
  name: v.string(),
  slug: v.string(),
  description: v.union(v.string(), v.null()),
  accentColor: v.union(v.string(), v.null()),
  isActive: v.boolean(),
  order: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

function summarize(business: {
  _id: any;
  organizationId?: any;
  name: string;
  slug: string;
  description?: string;
  accentColor?: string;
  isActive: boolean;
  order: number;
  createdAt: number;
  updatedAt: number;
}) {
  if (!business.organizationId) {
    throw new Error("Business is missing its organization");
  }
  return {
    businessId: business._id,
    organizationId: business.organizationId,
    name: business.name,
    slug: business.slug,
    description: business.description ?? null,
    accentColor: business.accentColor ?? null,
    isActive: business.isActive,
    order: business.order,
    createdAt: business.createdAt,
    updatedAt: business.updatedAt,
  };
}

async function assertUniqueSlug(ctx: { db: any }, slug: string, exceptId?: string) {
  const matches = await ctx.db
    .query("overseer_businesses")
    .withIndex("by_slug", (q: any) => q.eq("slug", slug))
    .take(2);
  if (matches.some((row: any) => String(row._id) !== exceptId)) {
    throw new Error(`A business with slug ${slug} already exists`);
  }
}

async function repairOrganizationDefault(ctx: { db: any }, organizationId: any) {
  const organization = await ctx.db.get(organizationId);
  if (!organization) return;
  const businesses = await ctx.db
    .query("overseer_businesses")
    .withIndex("by_organization", (q: any) => q.eq("organizationId", organizationId))
    .take(200);
  const defaultId = chooseDefaultId({
    currentDefaultId: organization.defaultBusinessId
      ? String(organization.defaultBusinessId)
      : undefined,
    children: businesses.map((business: any) => ({
      id: String(business._id),
      isActive: business.isActive,
      order: business.order,
    })),
  });
  const normalized = defaultId
    ? ctx.db.normalizeId("overseer_businesses", defaultId)
    : undefined;
  if (String(organization.defaultBusinessId ?? "") !== String(normalized ?? "")) {
    await ctx.db.patch(organization._id, {
      defaultBusinessId: normalized,
      updatedAt: Date.now(),
    });
  }
}

export const create = createBusiness({
  args: {
    organizationId: v.id("overseer_organizations"),
    name: v.string(),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    accentColor: v.optional(v.string()),
  },
  returns: businessResult,
  handler: async (ctx, args) => {
    requireActiveParent(await ctx.db.get(args.organizationId), "Organization");
    const name = normalizeEntityName(args.name);
    const slug = normalizeSlug(args.slug ?? name);
    await assertUniqueSlug(ctx, slug);
    const existing = await ctx.db
      .query("overseer_businesses")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .order("desc")
      .take(1);
    const now = Date.now();
    const businessId = await ctx.db.insert("overseer_businesses", {
      organizationId: args.organizationId,
      name,
      slug,
      description: args.description?.trim() || undefined,
      accentColor: args.accentColor?.trim() || undefined,
      isActive: true,
      order: (existing[0]?.order ?? -1) + 1,
      createdAt: now,
      updatedAt: now,
    });
    await repairOrganizationDefault(ctx, args.organizationId);
    return summarize((await ctx.db.get(businessId))!);
  },
});

export const update = authenticatedMutation({
  args: {
    businessId: v.id("overseer_businesses"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    accentColor: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  returns: businessResult,
  handler: async (ctx, args) => {
    const business = await ctx.db.get(args.businessId);
    if (!business?.organizationId) throw new Error("Business not found");
    await assertStoredAccess(ctx, ctx.operator, {
      selector: { type: "capability", code: "business.update" },
      target: {
        organizationId: String(business.organizationId),
        businessId: String(business._id),
      },
    });
    const slug = args.slug === undefined ? business.slug : normalizeSlug(args.slug);
    if (slug !== business.slug) {
      await assertUniqueSlug(ctx, slug, String(business._id));
    }
    await ctx.db.patch(business._id, {
      name: args.name === undefined ? business.name : normalizeEntityName(args.name),
      slug,
      description:
        args.description === undefined
          ? business.description
          : args.description.trim() || undefined,
      accentColor:
        args.accentColor === undefined
          ? business.accentColor
          : args.accentColor.trim() || undefined,
      isActive: args.isActive ?? business.isActive,
      updatedAt: Date.now(),
    });
    await repairOrganizationDefault(ctx, business.organizationId);
    return summarize((await ctx.db.get(business._id))!);
  },
});

export const list = authenticatedQuery({
  args: {
    organizationId: v.optional(v.id("overseer_organizations")),
    includeInactive: v.optional(v.boolean()),
  },
  returns: v.array(businessResult),
  handler: async (ctx, args) => {
    const isAdmin = ctx.operator.role === "owner" || ctx.operator.role === "admin";
    if (args.includeInactive && !isAdmin) {
      throw new Error("Only an owner or admin may list inactive businesses");
    }

    let businesses;
    if (isAdmin) {
      businesses = args.organizationId
        ? await ctx.db
            .query("overseer_businesses")
            .withIndex("by_organization", (q) =>
              q.eq("organizationId", args.organizationId),
            )
            .take(200)
        : args.includeInactive
          ? await ctx.db.query("overseer_businesses").take(200)
          : await ctx.db
              .query("overseer_businesses")
              .withIndex("by_active", (q) => q.eq("isActive", true))
              .take(200);
    } else {
      const subjectId = String(ctx.operator._id);
      const [businessAccess, websiteAccess] = await Promise.all([
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
      const websites = await Promise.all(
        websiteAccess.map((grant) => ctx.db.get(grant.websiteId)),
      );
      const ids = new Set([
        ...businessAccess.map((grant) => String(grant.businessId)),
        ...websites.flatMap((website) =>
          website?.business_id ? [String(website.business_id)] : [],
        ),
      ]);
      businesses = (
        await Promise.all(
          [...ids].map((id) => {
            const businessId = ctx.db.normalizeId("overseer_businesses", id);
            return businessId ? ctx.db.get(businessId) : null;
          }),
        )
      ).filter((business) => business?.isActive);
    }

    return businesses
      .filter(
        (business) =>
          business &&
          (args.includeInactive || business.isActive) &&
          (!args.organizationId || business.organizationId === args.organizationId),
      )
      .sort((left, right) => left!.order - right!.order || left!.name.localeCompare(right!.name))
      .map((business) => summarize(business!));
  },
});
