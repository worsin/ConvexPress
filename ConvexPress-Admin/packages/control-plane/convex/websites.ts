import { portableKeySchema } from "@convexpress/site-contract";
import { v } from "convex/values";

import { normalizeDomain, normalizeEntityName, requireActiveParent } from "./hierarchyPolicy";
import {
  assertStoredAccess,
  authenticatedMutation,
  authenticatedQuery,
} from "./rbac/functions";

const websiteResult = v.object({
  websiteId: v.id("overseer_websites"),
  websiteKey: v.string(),
  organizationId: v.id("overseer_organizations"),
  businessId: v.id("overseer_businesses"),
  title: v.string(),
  description: v.union(v.string(), v.null()),
  primaryDomain: v.string(),
  status: v.union(
    v.literal("active"),
    v.literal("inactive"),
    v.literal("archived"),
  ),
  isDefault: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

function summarize(website: {
  _id: any;
  websiteKey: string;
  organization_id?: any;
  business_id?: any;
  title: string;
  description?: string;
  primaryDomain: string;
  status: "active" | "inactive" | "archived";
  isDefault?: boolean;
  createdAt: number;
  updatedAt: number;
}) {
  if (!website.organization_id || !website.business_id) {
    throw new Error("Website is missing its organization or business");
  }
  return {
    websiteId: website._id,
    websiteKey: website.websiteKey,
    organizationId: website.organization_id,
    businessId: website.business_id,
    title: website.title,
    description: website.description ?? null,
    primaryDomain: website.primaryDomain,
    status: website.status,
    isDefault: website.isDefault === true,
    createdAt: website.createdAt,
    updatedAt: website.updatedAt,
  };
}

function cleanWebsiteKey(value: string) {
  const parsed = portableKeySchema.safeParse(value);
  if (!parsed.success) throw new Error("Invalid portable website key");
  return parsed.data;
}

async function assertUniqueWebsiteKey(
  ctx: { db: any },
  websiteKey: string,
  exceptId?: string,
) {
  const matches = await ctx.db
    .query("overseer_websites")
    .withIndex("by_website_key", (q: any) => q.eq("websiteKey", websiteKey))
    .take(2);
  if (matches.some((row: any) => String(row._id) !== exceptId)) {
    throw new Error("Portable website key already exists");
  }
}

async function assertUniqueBusinessDomain(
  ctx: { db: any },
  businessId: any,
  domain: string,
  exceptId?: string,
) {
  const matches = await ctx.db
    .query("overseer_websites")
    .withIndex("by_domain", (q: any) => q.eq("primaryDomain", domain))
    .take(100);
  if (
    matches.some(
      (row: any) =>
        String(row._id) !== exceptId &&
        String(row.business_id ?? "") === String(businessId) &&
        row.status !== "archived",
    )
  ) {
    throw new Error("A website with this domain already exists in the business");
  }
}

async function clearBusinessDefault(ctx: { db: any }, businessId: any, exceptId?: string) {
  const websites = await ctx.db
    .query("overseer_websites")
    .withIndex("by_business", (q: any) => q.eq("business_id", businessId))
    .take(200);
  const now = Date.now();
  for (const website of websites) {
    if (String(website._id) !== exceptId && website.isDefault) {
      await ctx.db.patch(website._id, { isDefault: false, updatedAt: now });
    }
  }
}

export const create = authenticatedMutation({
  args: {
    organizationId: v.id("overseer_organizations"),
    businessId: v.id("overseer_businesses"),
    websiteKey: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    primaryDomain: v.string(),
    makeDefault: v.optional(v.boolean()),
  },
  returns: websiteResult,
  handler: async (ctx, args) => {
    const organization = requireActiveParent(
      await ctx.db.get(args.organizationId),
      "Organization",
    );
    const business = requireActiveParent(await ctx.db.get(args.businessId), "Business");
    if (business.organizationId !== organization._id) {
      throw new Error("Business does not belong to the selected organization");
    }
    await assertStoredAccess(ctx, ctx.operator, {
      selector: { type: "capability", code: "business.update" },
      target: {
        organizationId: String(organization._id),
        businessId: String(business._id),
      },
    });

    const websiteKey = cleanWebsiteKey(args.websiteKey);
    const domain = normalizeDomain(args.primaryDomain);
    await assertUniqueWebsiteKey(ctx, websiteKey);
    await assertUniqueBusinessDomain(ctx, business._id, domain);
    const existing = await ctx.db
      .query("overseer_websites")
      .withIndex("by_business", (q) => q.eq("business_id", business._id))
      .take(1);
    const makeDefault = args.makeDefault ?? existing.length === 0;
    if (makeDefault) await clearBusinessDefault(ctx, business._id);
    const now = Date.now();
    const websiteId = await ctx.db.insert("overseer_websites", {
      owner_id: String(ctx.operator._id),
      organization_id: organization._id,
      business_id: business._id,
      websiteKey,
      engine: "convexpress",
      title: normalizeEntityName(args.title),
      description: args.description?.trim() || undefined,
      primaryDomain: domain,
      status: "active",
      isDefault: makeDefault,
      createdAt: now,
      updatedAt: now,
    });
    return summarize((await ctx.db.get(websiteId))!);
  },
});

export const update = authenticatedMutation({
  args: {
    websiteId: v.id("overseer_websites"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    primaryDomain: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal("active"), v.literal("inactive"), v.literal("archived")),
    ),
    makeDefault: v.optional(v.boolean()),
  },
  returns: websiteResult,
  handler: async (ctx, args) => {
    const website = await ctx.db.get(args.websiteId);
    if (!website?.organization_id || !website.business_id) {
      throw new Error("Website not found");
    }
    await assertStoredAccess(ctx, ctx.operator, {
      selector: { type: "capability", code: "website.update" },
      target: {
        organizationId: String(website.organization_id),
        businessId: String(website.business_id),
        websiteId: String(website._id),
      },
    });
    const domain =
      args.primaryDomain === undefined
        ? website.primaryDomain
        : normalizeDomain(args.primaryDomain);
    if (domain !== website.primaryDomain) {
      await assertUniqueBusinessDomain(
        ctx,
        website.business_id,
        domain,
        String(website._id),
      );
    }
    if (args.makeDefault) {
      await clearBusinessDefault(ctx, website.business_id, String(website._id));
    }
    const status = args.status ?? website.status;
    await ctx.db.patch(website._id, {
      title: args.title === undefined ? website.title : normalizeEntityName(args.title),
      description:
        args.description === undefined
          ? website.description
          : args.description.trim() || undefined,
      primaryDomain: domain,
      status,
      isDefault:
        status === "active" ? args.makeDefault ?? website.isDefault : false,
      updatedAt: Date.now(),
    });
    return summarize((await ctx.db.get(website._id))!);
  },
});

export const list = authenticatedQuery({
  args: {
    businessId: v.optional(v.id("overseer_businesses")),
    includeArchived: v.optional(v.boolean()),
  },
  returns: v.array(websiteResult),
  handler: async (ctx, args) => {
    const isAdmin = ctx.operator.role === "owner" || ctx.operator.role === "admin";
    if (args.includeArchived && !isAdmin) {
      throw new Error("Only an owner or admin may list archived websites");
    }
    let websites;
    if (isAdmin) {
      websites = args.businessId
        ? await ctx.db
            .query("overseer_websites")
            .withIndex("by_business", (q) => q.eq("business_id", args.businessId))
            .take(200)
        : await ctx.db.query("overseer_websites").take(500);
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
      const [businessWebsites, directWebsites] = await Promise.all([
        Promise.all(
          businessAccess.map((grant) =>
            ctx.db
              .query("overseer_websites")
              .withIndex("by_business", (q) => q.eq("business_id", grant.businessId))
              .take(200),
          ),
        ),
        Promise.all(websiteAccess.map((grant) => ctx.db.get(grant.websiteId))),
      ]);
      websites = [
        ...new Map(
          [...businessWebsites.flat(), ...directWebsites]
            .filter((website): website is NonNullable<typeof website> => website !== null)
            .map((website) => [String(website._id), website]),
        ).values(),
      ];
    }
    return websites
      .filter(
        (website) =>
          (args.includeArchived || website.status !== "archived") &&
          (!args.businessId || website.business_id === args.businessId),
      )
      .sort((left, right) =>
        left.isDefault !== right.isDefault
          ? left.isDefault
            ? -1
            : 1
          : left.title.localeCompare(right.title),
      )
      .map(summarize);
  },
});
