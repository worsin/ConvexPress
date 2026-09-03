import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authenticatedMutation, authenticatedQuery } from "./rbac/functions";
import { resolveStoredAccess } from "./rbac/runtime";

type ReadCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

const contextResult = v.object({
  organizations: v.array(
    v.object({
      organizationId: v.id("overseer_organizations"),
      name: v.string(),
      slug: v.string(),
    }),
  ),
  businesses: v.array(
    v.object({
      businessId: v.id("overseer_businesses"),
      organizationId: v.id("overseer_organizations"),
      name: v.string(),
      slug: v.string(),
    }),
  ),
  websites: v.array(
    v.object({
      websiteId: v.id("overseer_websites"),
      businessId: v.id("overseer_businesses"),
      organizationId: v.id("overseer_organizations"),
      websiteKey: v.string(),
      title: v.string(),
      primaryDomain: v.string(),
      isDefault: v.boolean(),
    }),
  ),
  environments: v.array(
    v.object({
      instanceId: v.id("overseer_websiteInstances"),
      websiteId: v.id("overseer_websites"),
      instanceKey: v.string(),
      kind: v.union(
        v.literal("live"),
        v.literal("staging"),
        v.literal("beta"),
        v.literal("preview"),
        v.literal("development"),
        v.literal("local"),
        v.literal("custom"),
      ),
      label: v.union(v.string(), v.null()),
      deploymentOrigin: v.string(),
      managementOrigin: v.string(),
      siteOrigin: v.string(),
      health: v.union(
        v.literal("unknown"),
        v.literal("ok"),
        v.literal("unreachable"),
        v.literal("degraded"),
      ),
      compatibility: v.union(
        v.literal("unknown"),
        v.literal("compatible"),
        v.literal("incompatible"),
      ),
      isDefault: v.boolean(),
    }),
  ),
  active: v.object({
    organizationId: v.union(v.id("overseer_organizations"), v.null()),
    businessId: v.union(v.id("overseer_businesses"), v.null()),
    websiteId: v.union(v.id("overseer_websites"), v.null()),
    instanceId: v.union(v.id("overseer_websiteInstances"), v.null()),
  }),
});

function uniqueDocs<T extends { _id: unknown }>(rows: readonly (T | null)[]): T[] {
  return [
    ...new Map(
      rows.filter((row): row is T => row !== null).map((row) => [String(row._id), row]),
    ).values(),
  ];
}

async function profileForUser(ctx: ReadCtx, userId: Doc<"overseer_users">["_id"]) {
  const profiles = await ctx.db
    .query("overseer_userProfiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(2);
  if (profiles.length > 1) throw new Error("Duplicate outer user profiles detected");
  return profiles[0] ?? null;
}

async function reachableDocs(
  ctx: ReadCtx,
  operator: Doc<"overseer_users">,
) {
  const isAdmin = operator.role === "owner" || operator.role === "admin";
  let organizations: Doc<"overseer_organizations">[];
  let businesses: Doc<"overseer_businesses">[];
  let websites: Doc<"overseer_websites">[];
  let environments: Doc<"overseer_websiteInstances">[];

  if (isAdmin) {
    [organizations, businesses, websites, environments] = await Promise.all([
      ctx.db
        .query("overseer_organizations")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .take(200),
      ctx.db
        .query("overseer_businesses")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .take(500),
      ctx.db
        .query("overseer_websites")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .take(1000),
      ctx.db
        .query("overseer_websiteInstances")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .take(2000),
    ]);
  } else {
    const subjectId = String(operator._id);
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
        .take(500),
      ctx.db
        .query("overseer_websiteAccess")
        .withIndex("by_subject", (q) =>
          q.eq("subjectType", "user").eq("subjectId", subjectId),
        )
        .take(1000),
    ]);
    const directBusinesses = await Promise.all(
      businessAccess.map((grant) => ctx.db.get(grant.businessId)),
    );
    const directWebsites = await Promise.all(
      websiteAccess.map((grant) => ctx.db.get(grant.websiteId)),
    );
    const businessWebsites = await Promise.all(
      directBusinesses
        .filter((business): business is Doc<"overseer_businesses"> => business !== null)
        .map((business) =>
          ctx.db
            .query("overseer_websites")
            .withIndex("by_business", (q) => q.eq("business_id", business._id))
            .take(200),
        ),
    );
    websites = uniqueDocs([...directWebsites, ...businessWebsites.flat()]).filter(
      (website) => website.status === "active",
    );
    businesses = uniqueDocs([
      ...directBusinesses,
      ...(await Promise.all(
        websites.map((website) =>
          website.business_id ? ctx.db.get(website.business_id) : null,
        ),
      )),
    ]).filter((business) => business.isActive);
    organizations = uniqueDocs([
      ...(await Promise.all(
        organizationAccess.map((grant) => ctx.db.get(grant.organizationId)),
      )),
      ...(await Promise.all(
        businesses.map((business) =>
          business.organizationId ? ctx.db.get(business.organizationId) : null,
        ),
      )),
    ]).filter((organization) => organization.isActive);

    const environmentWebsiteIds = new Set([
      ...directBusinesses.flatMap((business) =>
        business
          ? websites
              .filter((website) => website.business_id === business._id)
              .map((website) => String(website._id))
          : [],
      ),
      ...websiteAccess
        .filter((grant) => grant.includeEnvironments)
        .map((grant) => String(grant.websiteId)),
    ]);
    const environmentGroups = await Promise.all(
      websites
        .filter((website) => environmentWebsiteIds.has(String(website._id)))
        .map((website) =>
          ctx.db
            .query("overseer_websiteInstances")
            .withIndex("by_website", (q) => q.eq("website_id", website._id))
            .take(100),
        ),
    );
    environments = uniqueDocs(environmentGroups.flat()).filter(
      (instance) => instance.status === "active",
    );
  }

  const activeOrganizationIds = new Set(organizations.map((row) => String(row._id)));
  businesses = businesses.filter(
    (row) =>
      row.organizationId && activeOrganizationIds.has(String(row.organizationId)),
  );
  const activeBusinessIds = new Set(businesses.map((row) => String(row._id)));
  websites = websites.filter(
    (row) =>
      row.organization_id &&
      row.business_id &&
      activeOrganizationIds.has(String(row.organization_id)) &&
      activeBusinessIds.has(String(row.business_id)),
  );
  const visibleWebsites = [];
  for (const website of websites) {
    const decision = await resolveStoredAccess(ctx, operator, {
      selector: { type: "capability", code: "website.read" },
      target: {
        organizationId: String(website.organization_id),
        businessId: String(website.business_id),
        websiteId: String(website._id),
      },
    });
    if (decision.allowed) visibleWebsites.push(website);
  }
  websites = visibleWebsites;
  const activeWebsiteIds = new Set(websites.map((row) => String(row._id)));
  const visibleEnvironments = [];
  for (const instance of environments) {
    if (!activeWebsiteIds.has(String(instance.website_id))) continue;
    const website = websites.find((row) => row._id === instance.website_id)!;
    const decision = await resolveStoredAccess(ctx, operator, {
      selector: { type: "capability", code: "environment.read" },
      target: {
        organizationId: String(website.organization_id),
        businessId: String(website.business_id),
        websiteId: String(website._id),
        instanceId: String(instance._id),
      },
    });
    if (decision.allowed) visibleEnvironments.push(instance);
  }

  return {
    organizations: organizations.sort((a, b) => a.name.localeCompare(b.name)),
    businesses: businesses.sort(
      (a, b) => a.order - b.order || a.name.localeCompare(b.name),
    ),
    websites: websites.sort((a, b) =>
      a.isDefault !== b.isDefault
        ? a.isDefault
          ? -1
          : 1
        : a.title.localeCompare(b.title),
    ),
    environments: visibleEnvironments.sort((a, b) =>
      a.isDefault !== b.isDefault
        ? a.isDefault
          ? -1
          : 1
        : a.kind.localeCompare(b.kind),
    ),
  };
}

async function buildContext(ctx: ReadCtx, operator: Doc<"overseer_users">) {
  const docs = await reachableDocs(ctx, operator);
  const profile = await profileForUser(ctx, operator._id);
  const organization =
    docs.organizations.find((row) => row._id === profile?.activeOrganizationId) ??
    docs.organizations[0] ??
    null;
  const candidateBusinesses = organization
    ? docs.businesses.filter((row) => row.organizationId === organization._id)
    : [];
  const business =
    candidateBusinesses.find((row) => row._id === profile?.activeBusinessId) ??
    candidateBusinesses.find((row) => row._id === organization?.defaultBusinessId) ??
    candidateBusinesses[0] ??
    null;
  const candidateWebsites = business
    ? docs.websites.filter((row) => row.business_id === business._id)
    : [];
  const website =
    candidateWebsites.find((row) => row._id === profile?.activeWebsiteId) ??
    candidateWebsites.find((row) => row.isDefault) ??
    candidateWebsites[0] ??
    null;
  const candidateEnvironments = website
    ? docs.environments.filter((row) => row.website_id === website._id)
    : [];
  const instance =
    candidateEnvironments.find(
      (row) => row._id === profile?.activeWebsiteInstanceId,
    ) ??
    candidateEnvironments.find((row) => row.isDefault) ??
    candidateEnvironments[0] ??
    null;

  return {
    organizations: docs.organizations.map((row) => ({
      organizationId: row._id,
      name: row.name,
      slug: row.slug,
    })),
    businesses: docs.businesses.map((row) => ({
      businessId: row._id,
      organizationId: row.organizationId!,
      name: row.name,
      slug: row.slug,
    })),
    websites: docs.websites.map((row) => ({
      websiteId: row._id,
      businessId: row.business_id!,
      organizationId: row.organization_id!,
      websiteKey: row.websiteKey,
      title: row.title,
      primaryDomain: row.primaryDomain,
      isDefault: row.isDefault === true,
    })),
    environments: docs.environments.map((row) => ({
      instanceId: row._id,
      websiteId: row.website_id,
      instanceKey: row.instanceKey,
      kind: row.kind,
      label: row.label ?? null,
      deploymentOrigin: row.deploymentOrigin,
      managementOrigin: row.managementOrigin,
      siteOrigin: row.siteOrigin,
      health: row.health,
      compatibility: row.compatibility,
      isDefault: row.isDefault === true,
    })),
    active: {
      organizationId: organization?._id ?? null,
      businessId: business?._id ?? null,
      websiteId: website?._id ?? null,
      instanceId: instance?._id ?? null,
    },
  };
}

export const get = authenticatedQuery({
  args: {},
  returns: contextResult,
  handler: async (ctx) => await buildContext(ctx, ctx.operator),
});

export const setActive = authenticatedMutation({
  args: {
    organizationId: v.union(v.id("overseer_organizations"), v.null()),
    businessId: v.union(v.id("overseer_businesses"), v.null()),
    websiteId: v.union(v.id("overseer_websites"), v.null()),
    instanceId: v.union(v.id("overseer_websiteInstances"), v.null()),
  },
  returns: contextResult,
  handler: async (ctx, args) => {
    if (!args.organizationId && (args.businessId || args.websiteId || args.instanceId)) {
      throw new Error("Organization is required for every child selection");
    }
    if (!args.businessId && (args.websiteId || args.instanceId)) {
      throw new Error("Business is required for every site selection");
    }
    if (!args.websiteId && args.instanceId) {
      throw new Error("Website is required for an environment selection");
    }
    const docs = await reachableDocs(ctx, ctx.operator);
    const organization = args.organizationId
      ? docs.organizations.find((row) => row._id === args.organizationId)
      : null;
    const business = args.businessId
      ? docs.businesses.find((row) => row._id === args.businessId)
      : null;
    const website = args.websiteId
      ? docs.websites.find((row) => row._id === args.websiteId)
      : null;
    const instance = args.instanceId
      ? docs.environments.find((row) => row._id === args.instanceId)
      : null;
    if (args.organizationId && !organization) throw new Error("Organization is not reachable");
    if (args.businessId && (!business || business.organizationId !== organization?._id)) {
      throw new Error("Business is not reachable in the selected organization");
    }
    if (args.websiteId && (!website || website.business_id !== business?._id)) {
      throw new Error("Website is not reachable in the selected business");
    }
    if (args.instanceId && (!instance || instance.website_id !== website?._id)) {
      throw new Error("Environment is not reachable in the selected website");
    }

    const profile = await profileForUser(ctx, ctx.operator._id);
    const now = Date.now();
    if (profile) {
      await ctx.db.patch(profile._id, {
        activeOrganizationId: args.organizationId ?? undefined,
        activeBusinessId: args.businessId ?? undefined,
        activeWebsiteId: args.websiteId ?? undefined,
        activeWebsiteInstanceId: args.instanceId ?? undefined,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("overseer_userProfiles", {
        userId: ctx.operator._id,
        activeOrganizationId: args.organizationId ?? undefined,
        activeBusinessId: args.businessId ?? undefined,
        activeWebsiteId: args.websiteId ?? undefined,
        activeWebsiteInstanceId: args.instanceId ?? undefined,
        createdAt: now,
        updatedAt: now,
      });
    }
    return await buildContext(ctx, ctx.operator);
  },
});
