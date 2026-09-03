import { defineTable } from "convex/server";
import { v } from "convex/values";

const principalType = v.union(v.literal("user"), v.literal("agent"));

const desktopWallpaperConfig = v.object({
  type: v.union(
    v.literal("solid"),
    v.literal("gradient"),
    v.literal("image"),
    v.literal("dynamic"),
  ),
  value: v.string(),
  fit: v.optional(
    v.union(
      v.literal("cover"),
      v.literal("contain"),
      v.literal("fill"),
      v.literal("center"),
    ),
  ),
  label: v.optional(v.string()),
  mediaAssetId: v.optional(v.id("mediacenter_mediaAssets")),
});

const websiteStamps = {
  owner_id: v.optional(v.string()),
  app_id: v.optional(v.string()),
  organization_id: v.optional(v.id("overseer_organizations")),
  business_id: v.optional(v.id("overseer_businesses")),
  team_id: v.optional(v.id("overseer_teams")),
  vo_project_id: v.optional(v.id("genericprojects_projects")),
  tags: v.optional(v.array(v.string())),
};

export const hierarchyTables = {
  overseer_organizations: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    legalName: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    linkedInUrl: v.optional(v.string()),
    youtubeUrl: v.optional(v.string()),
    facebookUrl: v.optional(v.string()),
    xUrl: v.optional(v.string()),
    primaryContactName: v.optional(v.string()),
    primaryContactEmail: v.optional(v.string()),
    defaultBusinessId: v.optional(v.id("overseer_businesses")),
    ownerUserId: v.optional(v.id("overseer_users")),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_owner", ["ownerUserId"])
    .index("by_active", ["isActive"]),

  overseer_businesses: defineTable({
    organizationId: v.optional(v.id("overseer_organizations")),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    legalName: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    email: v.optional(v.string()),
    linkedInUrl: v.optional(v.string()),
    youtubeUrl: v.optional(v.string()),
    facebookUrl: v.optional(v.string()),
    xUrl: v.optional(v.string()),
    primaryContactName: v.optional(v.string()),
    primaryContactEmail: v.optional(v.string()),
    accentColor: v.optional(v.string()),
    desktopWallpaper: v.optional(desktopWallpaperConfig),
    wallpaperMediaAssetId: v.optional(v.id("mediacenter_mediaAssets")),
    wallpaperMediaUsageRefId: v.optional(v.id("mediacenter_mediaUsageRefs")),
    wallpaperUrl: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    logoMediaAssetId: v.optional(v.id("mediacenter_mediaAssets")),
    logoMediaUsageRefId: v.optional(v.id("mediacenter_mediaUsageRefs")),
    iconUrl: v.optional(v.string()),
    iconMediaAssetId: v.optional(v.id("mediacenter_mediaAssets")),
    iconMediaUsageRefId: v.optional(v.id("mediacenter_mediaUsageRefs")),
    domains: v.optional(v.array(v.string())),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    isActive: v.boolean(),
    order: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_active", ["isActive", "order"])
    .index("by_organization", ["organizationId", "order"]),

  overseer_organizationAccess: defineTable({
    subjectType: principalType,
    subjectId: v.string(),
    organizationId: v.id("overseer_organizations"),
    level: v.union(v.literal("use"), v.literal("manage")),
    grantedBy: v.optional(v.string()),
    grantedAt: v.number(),
  })
    .index("by_subject", ["subjectType", "subjectId"])
    .index("by_subject_organization", [
      "subjectType",
      "subjectId",
      "organizationId",
    ])
    .index("by_organization", ["organizationId"]),

  overseer_businessAccess: defineTable({
    subjectType: principalType,
    subjectId: v.string(),
    businessId: v.id("overseer_businesses"),
    level: v.union(v.literal("use"), v.literal("manage")),
    grantedBy: v.optional(v.string()),
    grantedAt: v.number(),
  })
    .index("by_subject", ["subjectType", "subjectId"])
    .index("by_subject_business", ["subjectType", "subjectId", "businessId"])
    .index("by_business", ["businessId"]),

  overseer_websites: defineTable({
    ...websiteStamps,
    websiteKey: v.string(),
    engine: v.union(
      v.literal("convexpress"),
      v.literal("wordpress"),
      v.literal("shopify"),
    ),
    title: v.string(),
    description: v.optional(v.string()),
    primaryDomain: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("archived"),
    ),
    isDefault: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_website_key", ["websiteKey"])
    .index("by_business", ["business_id"])
    .index("by_business_key", ["business_id", "websiteKey"])
    .index("by_domain", ["primaryDomain"])
    .index("by_status", ["status"]),

  overseer_websiteAccess: defineTable({
    subjectType: principalType,
    subjectId: v.string(),
    websiteId: v.id("overseer_websites"),
    level: v.union(v.literal("use"), v.literal("manage")),
    includeEnvironments: v.optional(v.boolean()),
    grantedBy: v.optional(v.string()),
    grantedAt: v.number(),
  })
    .index("by_subject", ["subjectType", "subjectId"])
    .index("by_subject_website", ["subjectType", "subjectId", "websiteId"])
    .index("by_website", ["websiteId"]),

  overseer_websiteInstances: defineTable({
    ...websiteStamps,
    website_id: v.id("overseer_websites"),
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
    label: v.optional(v.string()),
    deploymentOrigin: v.string(),
    managementOrigin: v.string(),
    siteOrigin: v.string(),
    deploymentName: v.optional(v.string()),
    projectRef: v.optional(v.string()),
    connection_id: v.optional(v.id("overseer_connections")),
    hostingTarget: v.optional(
      v.union(
        v.literal("none"),
        v.literal("vercel"),
        v.literal("cloudflare"),
        v.literal("self"),
      ),
    ),
    domain: v.optional(v.string()),
    siteContractVersion: v.optional(v.string()),
    schemaVersion: v.optional(v.string()),
    engineVersion: v.optional(v.string()),
    compatibility: v.union(
      v.literal("unknown"),
      v.literal("compatible"),
      v.literal("incompatible"),
    ),
    lastCompatibilityAt: v.optional(v.number()),
    lastCompatibilityError: v.optional(v.string()),
    provisioning: v.union(
      v.literal("unprovisioned"),
      v.literal("provisioning"),
      v.literal("ready"),
      v.literal("error"),
    ),
    provisioningError: v.optional(v.string()),
    health: v.union(
      v.literal("unknown"),
      v.literal("ok"),
      v.literal("unreachable"),
      v.literal("degraded"),
    ),
    lastHealthAt: v.optional(v.number()),
    lastHealthError: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
    status: v.union(v.literal("active"), v.literal("archived")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_instance_key", ["instanceKey"])
    .index("by_website", ["website_id"])
    .index("by_website_kind", ["website_id", "kind"])
    .index("by_deployment_origin", ["deploymentOrigin"])
    .index("by_management_origin", ["managementOrigin"])
    .index("by_site_origin", ["siteOrigin"])
    .index("by_status", ["status"])
    .index("by_business", ["business_id"]),
};
