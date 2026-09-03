import {
  assessRuntimeCompatibility,
  deploymentOriginSchema,
  environmentKindSchema,
  portableKeySchema,
} from "@convexpress/site-contract";
import { v } from "convex/values";

import { requireActiveParent } from "./hierarchyPolicy";
import {
  assertStoredAccess,
  authenticatedMutation,
  authenticatedQuery,
} from "./rbac/functions";
import { resolveStoredAccess } from "./rbac/runtime";
import { buildWebsiteInstancePatch } from "./websiteInstancePolicy";

const environmentKind = v.union(
  v.literal("live"),
  v.literal("staging"),
  v.literal("beta"),
  v.literal("preview"),
  v.literal("development"),
  v.literal("local"),
  v.literal("custom"),
);

const instanceResult = v.object({
  instanceId: v.id("overseer_websiteInstances"),
  instanceKey: v.string(),
  websiteId: v.id("overseer_websites"),
  kind: environmentKind,
  label: v.union(v.string(), v.null()),
  deploymentOrigin: v.string(),
  managementOrigin: v.string(),
  siteOrigin: v.string(),
  siteContractVersion: v.union(v.string(), v.null()),
  schemaVersion: v.union(v.string(), v.null()),
  engineVersion: v.union(v.string(), v.null()),
  compatibility: v.union(
    v.literal("unknown"),
    v.literal("compatible"),
    v.literal("incompatible"),
  ),
  provisioning: v.union(
    v.literal("unprovisioned"),
    v.literal("provisioning"),
    v.literal("ready"),
    v.literal("error"),
  ),
  health: v.union(
    v.literal("unknown"),
    v.literal("ok"),
    v.literal("unreachable"),
    v.literal("degraded"),
  ),
  isDefault: v.boolean(),
  status: v.union(v.literal("active"), v.literal("archived")),
  createdAt: v.number(),
  updatedAt: v.number(),
});

function summarize(instance: {
  _id: any;
  instanceKey: string;
  website_id: any;
  kind: any;
  label?: string;
  deploymentOrigin: string;
  managementOrigin: string;
  siteOrigin: string;
  siteContractVersion?: string;
  schemaVersion?: string;
  engineVersion?: string;
  compatibility: any;
  provisioning: any;
  health: any;
  isDefault?: boolean;
  status: any;
  createdAt: number;
  updatedAt: number;
}) {
  return {
    instanceId: instance._id,
    instanceKey: instance.instanceKey,
    websiteId: instance.website_id,
    kind: instance.kind,
    label: instance.label ?? null,
    deploymentOrigin: instance.deploymentOrigin,
    managementOrigin: instance.managementOrigin,
    siteOrigin: instance.siteOrigin,
    siteContractVersion: instance.siteContractVersion ?? null,
    schemaVersion: instance.schemaVersion ?? null,
    engineVersion: instance.engineVersion ?? null,
    compatibility: instance.compatibility,
    provisioning: instance.provisioning,
    health: instance.health,
    isDefault: instance.isDefault === true,
    status: instance.status,
    createdAt: instance.createdAt,
    updatedAt: instance.updatedAt,
  };
}

function parsePortableKey(value: string, label: string) {
  const parsed = portableKeySchema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid portable ${label} key`);
  return parsed.data;
}

function parseOrigin(value: string, label: string) {
  const parsed = deploymentOriginSchema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid ${label} origin`);
  return parsed.data;
}

async function clearWebsiteDefault(ctx: { db: any }, websiteId: any, exceptId?: string) {
  const instances = await ctx.db
    .query("overseer_websiteInstances")
    .withIndex("by_website", (q: any) => q.eq("website_id", websiteId))
    .take(100);
  const now = Date.now();
  for (const instance of instances) {
    if (String(instance._id) !== exceptId && instance.isDefault) {
      await ctx.db.patch(instance._id, { isDefault: false, updatedAt: now });
    }
  }
}

export const attach = authenticatedMutation({
  args: {
    websiteId: v.id("overseer_websites"),
    instanceKey: v.string(),
    kind: environmentKind,
    label: v.optional(v.string()),
    deploymentOrigin: v.string(),
    managementOrigin: v.string(),
    siteOrigin: v.string(),
    deploymentName: v.optional(v.string()),
    projectRef: v.optional(v.string()),
    siteContractVersion: v.optional(v.string()),
    schemaVersion: v.optional(v.string()),
    engineVersion: v.optional(v.string()),
    makeDefault: v.optional(v.boolean()),
  },
  returns: instanceResult,
  handler: async (ctx, args) => {
    const website = await ctx.db.get(args.websiteId);
    if (!website?.organization_id || !website.business_id || website.status !== "active") {
      throw new Error("Website is not active");
    }
    const organization = requireActiveParent(
      await ctx.db.get(website.organization_id),
      "Organization",
    );
    const business = requireActiveParent(
      await ctx.db.get(website.business_id),
      "Business",
    );
    const target = {
      organizationId: String(organization._id),
      businessId: String(business._id),
      websiteId: String(website._id),
    };
    await assertStoredAccess(ctx, ctx.operator, {
      selector: { type: "capability", code: "website.update" },
      target,
    });
    const kind = environmentKindSchema.parse(args.kind);
    if (kind === "live") {
      await assertStoredAccess(ctx, ctx.operator, {
        selector: { type: "capability", code: "environment.live.operate" },
        target,
      });
    }

    const instanceKey = parsePortableKey(args.instanceKey, "instance");
    const deploymentOrigin = parseOrigin(args.deploymentOrigin, "deployment");
    const managementOrigin = parseOrigin(args.managementOrigin, "management");
    const siteOrigin = parseOrigin(args.siteOrigin, "site");
    const [keyMatches, deploymentMatches, managementMatches, siteMatches] = await Promise.all([
      ctx.db
        .query("overseer_websiteInstances")
        .withIndex("by_instance_key", (q) => q.eq("instanceKey", instanceKey))
        .take(2),
      ctx.db
        .query("overseer_websiteInstances")
        .withIndex("by_deployment_origin", (q) =>
          q.eq("deploymentOrigin", deploymentOrigin),
        )
        .take(2),
      ctx.db
        .query("overseer_websiteInstances")
        .withIndex("by_management_origin", (q) =>
          q.eq("managementOrigin", managementOrigin),
        )
        .take(2),
      ctx.db
        .query("overseer_websiteInstances")
        .withIndex("by_site_origin", (q) => q.eq("siteOrigin", siteOrigin))
        .take(2),
    ]);
    if (keyMatches.length > 0) throw new Error("Portable instance key already exists");
    if (deploymentMatches.length > 0) {
      throw new Error("Deployment origin is already attached to another environment");
    }
    if (managementMatches.length > 0) {
      throw new Error("Management origin is already attached to another environment");
    }
    if (siteMatches.length > 0) {
      throw new Error("Site origin is already attached to another environment");
    }

    const existing = await ctx.db
      .query("overseer_websiteInstances")
      .withIndex("by_website", (q) => q.eq("website_id", website._id))
      .take(1);
    const makeDefault = args.makeDefault ?? existing.length === 0;
    if (makeDefault) await clearWebsiteDefault(ctx, website._id);
    const hasVersions =
      args.siteContractVersion && args.schemaVersion && args.engineVersion;
    const compatibility = hasVersions
      ? assessRuntimeCompatibility({
          siteContractVersion: args.siteContractVersion!,
          schemaVersion: args.schemaVersion!,
          engineVersion: args.engineVersion!,
        }).compatible
        ? "compatible"
        : "incompatible"
      : "unknown";
    const now = Date.now();
    const instanceId = await ctx.db.insert("overseer_websiteInstances", {
      owner_id: String(ctx.operator._id),
      organization_id: organization._id,
      business_id: business._id,
      website_id: website._id,
      instanceKey,
      kind,
      label: args.label?.trim() || undefined,
      deploymentOrigin,
      managementOrigin,
      siteOrigin,
      deploymentName: args.deploymentName?.trim() || undefined,
      projectRef: args.projectRef?.trim() || undefined,
      domain: new URL(siteOrigin).hostname,
      siteContractVersion: args.siteContractVersion,
      schemaVersion: args.schemaVersion,
      engineVersion: args.engineVersion,
      compatibility,
      provisioning: "unprovisioned",
      health: "unknown",
      isDefault: makeDefault,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    return summarize((await ctx.db.get(instanceId))!);
  },
});

export const list = authenticatedQuery({
  args: {
    websiteId: v.id("overseer_websites"),
    includeArchived: v.optional(v.boolean()),
  },
  returns: v.array(instanceResult),
  handler: async (ctx, args) => {
    const website = await ctx.db.get(args.websiteId);
    if (!website?.organization_id || !website.business_id) {
      throw new Error("Website not found");
    }
    const isAdmin = ctx.operator.role === "owner" || ctx.operator.role === "admin";
    if (args.includeArchived && !isAdmin) {
      throw new Error("Only an owner or admin may list archived environments");
    }
    await assertStoredAccess(ctx, ctx.operator, {
      selector: { type: "capability", code: "environment.read" },
      target: {
        organizationId: String(website.organization_id),
        businessId: String(website.business_id),
        websiteId: String(website._id),
      },
    });
    const instances = await ctx.db
      .query("overseer_websiteInstances")
      .withIndex("by_website", (q) => q.eq("website_id", website._id))
      .take(100);
    const visible = [];
    for (const instance of instances) {
      if (!args.includeArchived && instance.status === "archived") continue;
      const decision = await resolveStoredAccess(ctx, ctx.operator, {
        selector: { type: "capability", code: "environment.read" },
        target: {
          organizationId: String(website.organization_id),
          businessId: String(website.business_id),
          websiteId: String(website._id),
          instanceId: String(instance._id),
        },
      });
      if (decision.allowed) visible.push(instance);
    }
    return visible
      .sort((left, right) =>
        left.isDefault !== right.isDefault
          ? left.isDefault
            ? -1
            : 1
          : left.kind.localeCompare(right.kind),
      )
      .map(summarize);
  },
});

export const setDefault = authenticatedMutation({
  args: { instanceId: v.id("overseer_websiteInstances") },
  returns: instanceResult,
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.instanceId);
    if (!instance || instance.status !== "active") throw new Error("Environment not found");
    const website = await ctx.db.get(instance.website_id);
    if (!website?.organization_id || !website.business_id) throw new Error("Website not found");
    await assertStoredAccess(ctx, ctx.operator, {
      selector: { type: "capability", code: "website.update" },
      target: {
        organizationId: String(website.organization_id),
        businessId: String(website.business_id),
        websiteId: String(website._id),
        instanceId: String(instance._id),
      },
    });
    if (instance.kind === "live") {
      await assertStoredAccess(ctx, ctx.operator, {
        selector: { type: "capability", code: "environment.live.operate" },
        target: {
          organizationId: String(website.organization_id),
          businessId: String(website.business_id),
          websiteId: String(website._id),
          instanceId: String(instance._id),
        },
      });
    }
    await clearWebsiteDefault(ctx, website._id, String(instance._id));
    await ctx.db.patch(instance._id, { isDefault: true, updatedAt: Date.now() });
    return summarize((await ctx.db.get(instance._id))!);
  },
});

export const update = authenticatedMutation({
  args: {
    instanceId: v.id("overseer_websiteInstances"),
    label: v.optional(v.union(v.string(), v.null())),
    deploymentOrigin: v.optional(v.string()),
    managementOrigin: v.optional(v.string()),
    siteOrigin: v.optional(v.string()),
    deploymentName: v.optional(v.union(v.string(), v.null())),
    projectRef: v.optional(v.union(v.string(), v.null())),
    siteContractVersion: v.optional(v.union(v.string(), v.null())),
    schemaVersion: v.optional(v.union(v.string(), v.null())),
    engineVersion: v.optional(v.union(v.string(), v.null())),
  },
  returns: instanceResult,
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.instanceId);
    if (!instance || instance.status !== "active") {
      throw new Error("Environment not found");
    }
    const website = await ctx.db.get(instance.website_id);
    if (
      !website?.organization_id ||
      !website.business_id ||
      website.status !== "active" ||
      instance.organization_id !== website.organization_id ||
      instance.business_id !== website.business_id
    ) {
      throw new Error("Environment target identity is inconsistent");
    }
    const target = {
      organizationId: String(website.organization_id),
      businessId: String(website.business_id),
      websiteId: String(website._id),
      instanceId: String(instance._id),
    };
    await assertStoredAccess(ctx, ctx.operator, {
      selector: { type: "capability", code: "website.update" },
      target,
    });
    if (instance.kind === "live") {
      await assertStoredAccess(ctx, ctx.operator, {
        selector: { type: "capability", code: "environment.live.operate" },
        target,
      });
    }

    const { instanceId: _instanceId, ...editable } = args;
    const patch = buildWebsiteInstancePatch({
      current: instance,
      input: editable,
      now: Date.now(),
    });
    const originsChanged =
      (patch.deploymentOrigin !== undefined &&
        patch.deploymentOrigin !== instance.deploymentOrigin) ||
      (patch.managementOrigin !== undefined &&
        patch.managementOrigin !== instance.managementOrigin) ||
      (patch.siteOrigin !== undefined && patch.siteOrigin !== instance.siteOrigin);
    if (originsChanged) {
      const activeConnections = await ctx.db
        .query("overseer_connections")
        .withIndex("by_instance", (q) =>
          q.eq("instance_id", instance._id).eq("isActive", true),
        )
        .take(1);
      if (activeConnections.length > 0) {
        throw new Error("Revoke the active connection before changing environment origins");
      }
    }

    if (
      patch.deploymentOrigin !== undefined &&
      patch.deploymentOrigin !== instance.deploymentOrigin
    ) {
      const matches = await ctx.db
        .query("overseer_websiteInstances")
        .withIndex("by_deployment_origin", (q) =>
          q.eq("deploymentOrigin", patch.deploymentOrigin as string),
        )
        .take(2);
      if (matches.some((match) => match._id !== instance._id)) {
        throw new Error("Deployment origin is already attached to another environment");
      }
    }
    if (patch.siteOrigin !== undefined && patch.siteOrigin !== instance.siteOrigin) {
      const matches = await ctx.db
        .query("overseer_websiteInstances")
        .withIndex("by_site_origin", (q) =>
          q.eq("siteOrigin", patch.siteOrigin as string),
        )
        .take(2);
      if (matches.some((match) => match._id !== instance._id)) {
        throw new Error("Site origin is already attached to another environment");
      }
    }
    if (
      patch.managementOrigin !== undefined &&
      patch.managementOrigin !== instance.managementOrigin
    ) {
      const matches = await ctx.db
        .query("overseer_websiteInstances")
        .withIndex("by_management_origin", (q) =>
          q.eq("managementOrigin", patch.managementOrigin as string),
        )
        .take(2);
      if (matches.some((match) => match._id !== instance._id)) {
        throw new Error("Management origin is already attached to another environment");
      }
    }

    await ctx.db.patch(instance._id, patch);
    return summarize((await ctx.db.get(instance._id))!);
  },
});
