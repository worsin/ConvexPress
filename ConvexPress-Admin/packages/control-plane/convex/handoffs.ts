import {
  assessRuntimeCompatibility,
  canonicalJson,
  OPERATION_CAPABILITY,
  OPERATION_CODES,
  parseHandoffBundle,
  sha256Hex,
} from "@convexpress/site-contract";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  assertStoredAccess,
  authenticatedMutation,
  authenticatedQuery,
} from "./rbac/functions";
import { outerCapabilityForSiteCapability } from "./siteBroker/policy";
import { normalizeDomain } from "./hierarchyPolicy";
import { buildHandoffBundleFromRecords, buildHandoffImportPlan } from "./operations/handoffs";
import {
  checkpointOperationRecord,
  completeOperationRecord,
  createOperationRecord,
  transitionOperationRecord,
} from "./operations/records";

const SOURCE_CONTROLLER_ID = "controller_convexpress_standalone";
const MIN_HANDOFF_LIFETIME_MS = 10 * 60_000;
const MAX_HANDOFF_LIFETIME_MS = 30 * 24 * 60 * 60_000;

const environmentKind = v.union(
  v.literal("live"),
  v.literal("staging"),
  v.literal("beta"),
  v.literal("preview"),
  v.literal("development"),
  v.literal("local"),
  v.literal("custom"),
);

const exportResult = v.object({
  operationId: v.id("overseer_siteOperations"),
  handoffId: v.string(),
  packageJson: v.string(),
  manifestSha256: v.string(),
  environmentCount: v.number(),
  expiresAt: v.number(),
  status: v.union(v.literal("ready"), v.literal("downloaded")),
  idempotent: v.boolean(),
});

const handoffSummary = v.object({
  handoffId: v.string(),
  websiteId: v.id("overseer_websites"),
  websiteKey: v.string(),
  status: v.union(
    v.literal("preparing"),
    v.literal("ready"),
    v.literal("downloaded"),
    v.literal("revoked"),
    v.literal("failed"),
  ),
  expiresAt: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

type Operator = Parameters<typeof assertStoredAccess>[1];

function validateHandoffLifetime(value: number): number {
  if (
    !Number.isSafeInteger(value) ||
    value < MIN_HANDOFF_LIFETIME_MS ||
    value > MAX_HANDOFF_LIFETIME_MS
  ) {
    throw new Error("Handoff lifetime must be between 10 minutes and 30 days");
  }
  return value;
}

async function requireWebsiteAccess(
  ctx: QueryCtx | MutationCtx,
  operator: Operator,
  websiteId: Id<"overseer_websites">,
) {
  const website = await ctx.db.get(websiteId);
  if (
    !website ||
    website.status !== "active" ||
    website.engine !== "convexpress" ||
    !website.organization_id ||
    !website.business_id
  ) {
    throw new Error("Handoff website is not active");
  }
  await assertStoredAccess(ctx, operator, {
    selector: {
      type: "capability",
      code: outerCapabilityForSiteCapability(
        OPERATION_CAPABILITY[OPERATION_CODES.handoffExport],
      ),
    },
    target: {
      organizationId: String(website.organization_id),
      businessId: String(website.business_id),
      websiteId: String(website._id),
    },
  });
  return website;
}

async function requireExportableEnvironments(
  ctx: QueryCtx | MutationCtx,
  operator: Operator,
  website: NonNullable<Awaited<ReturnType<typeof requireWebsiteAccess>>>,
) {
  const environments = (
    await ctx.db
      .query("overseer_websiteInstances")
      .withIndex("by_website", (query) => query.eq("website_id", website._id))
      .take(100)
  ).filter((environment) => environment.status === "active");
  if (environments.length === 0) {
    throw new Error("Handoff website has no active environments");
  }
  for (const environment of environments) {
    const target = {
      organizationId: String(website.organization_id),
      businessId: String(website.business_id),
      websiteId: String(website._id),
      instanceId: String(environment._id),
    };
    await assertStoredAccess(ctx, operator, {
      selector: { type: "capability", code: "site.handoff.export" },
      target,
    });
    if (environment.kind === "live") {
      await assertStoredAccess(ctx, operator, {
        selector: { type: "capability", code: "environment.live.operate" },
        target,
      });
    }
  }
  return environments;
}

async function existingHandoff(
  ctx: QueryCtx | MutationCtx,
  handoffId: string,
) {
  const matches = await ctx.db
    .query("overseer_siteHandoffs")
    .withIndex("by_handoff_id", (query) => query.eq("handoffId", handoffId))
    .take(2);
  if (matches.length > 1) throw new Error("Handoff identifier is not unique");
  return matches[0] ?? null;
}

export const exportPackage = authenticatedMutation({
  args: {
    instanceId: v.id("overseer_websiteInstances"),
    includeSnapshots: v.boolean(),
    includeRunbook: v.boolean(),
    expiresInMs: v.number(),
    idempotencyKey: v.string(),
  },
  returns: exportResult,
  handler: async (ctx, args) => {
    const expiresInMs = validateHandoffLifetime(args.expiresInMs);
    const anchor = await ctx.db.get(args.instanceId);
    if (!anchor || anchor.status !== "active") {
      throw new Error("Handoff environment not found");
    }
    const website = await requireWebsiteAccess(
      ctx,
      ctx.operator,
      anchor.website_id,
    );
    const environments = await requireExportableEnvironments(
      ctx,
      ctx.operator,
      website,
    );
    const created = await createOperationRecord(ctx, {
      operationCode: OPERATION_CODES.handoffExport,
      idempotencyKey: args.idempotencyKey,
      websiteId: website._id,
      instanceId: anchor._id,
      requestedByUserId: ctx.operator._id,
      provider: "manual",
      includeStorage: args.includeSnapshots,
      includeRunbook: args.includeRunbook,
      expiresInMs,
    });
    const handoffId = `handoff_${sha256Hex(created.operationKey).slice(0, 40)}`;

    if (created.idempotent) {
      const [operation, handoff] = await Promise.all([
        ctx.db.get(created.operationId),
        existingHandoff(ctx, handoffId),
      ]);
      if (
        !operation ||
        operation.state !== "succeeded" ||
        !handoff ||
        (handoff.status !== "ready" && handoff.status !== "downloaded")
      ) {
        throw new Error("Existing handoff operation is incomplete");
      }
      const bundle = parseHandoffBundle(handoff.packageManifestJson);
      return {
        operationId: operation._id,
        handoffId: handoff.handoffId,
        packageJson: handoff.packageManifestJson,
        manifestSha256: bundle.manifestSha256,
        environmentCount: bundle.manifest.environments.length,
        expiresAt: handoff.expiresAt,
        status: handoff.status,
        idempotent: true,
      };
    }

    const running = await transitionOperationRecord(ctx, {
      operationId: created.operationId,
      expectedRevision: 0,
      to: "running",
    });

    await checkpointOperationRecord(ctx, {
      operationId: created.operationId,
      stepKey: "target.revalidate",
      state: "running",
    });
    await checkpointOperationRecord(ctx, {
      operationId: created.operationId,
      stepKey: "target.revalidate",
      state: "succeeded",
      checkpointCode: "website.environments.authorized",
    });

    const backups = await ctx.db
      .query("overseer_siteBackups")
      .withIndex("by_website_created", (query) =>
        query.eq("websiteId", website._id),
      )
      .order("desc")
      .take(2_000);

    await checkpointOperationRecord(ctx, {
      operationId: created.operationId,
      stepKey: "handoff.manifest",
      state: "running",
    });
    const now = Date.now();
    const expiresAt = now + expiresInMs;
    const bundle = buildHandoffBundleFromRecords({
      handoffId,
      sourceControllerId: SOURCE_CONTROLLER_ID,
      website: {
        websiteKey: website.websiteKey,
        title: website.title,
        primaryDomain: website.primaryDomain,
      },
      environments,
      backups,
      includeSnapshots: args.includeSnapshots,
      includeRunbook: args.includeRunbook,
      now,
      expiresAt,
    });
    await checkpointOperationRecord(ctx, {
      operationId: created.operationId,
      stepKey: "handoff.manifest",
      state: "succeeded",
      checkpointCode: bundle.manifestSha256,
    });

    await checkpointOperationRecord(ctx, {
      operationId: created.operationId,
      stepKey: "handoff.package",
      state: "running",
    });
    const packageJson = canonicalJson(bundle);
    await ctx.db.insert("overseer_siteHandoffs", {
      handoffId,
      websiteId: website._id,
      websiteKey: website.websiteKey,
      requestedByUserId: ctx.operator._id,
      packageManifestJson: packageJson,
      status: "ready",
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });
    await checkpointOperationRecord(ctx, {
      operationId: created.operationId,
      stepKey: "handoff.package",
      state: "succeeded",
      checkpointCode: handoffId,
    });

    await checkpointOperationRecord(ctx, {
      operationId: created.operationId,
      stepKey: "handoff.verify",
      state: "running",
    });
    parseHandoffBundle(packageJson);
    await checkpointOperationRecord(ctx, {
      operationId: created.operationId,
      stepKey: "handoff.verify",
      state: "succeeded",
      checkpointCode: "package.checksum.verified",
    });
    await completeOperationRecord(ctx, {
      operationId: created.operationId,
      expectedRevision: running.revision,
      state: "succeeded",
      summary: {
        handoffId,
        manifestSha256: bundle.manifestSha256,
        environmentCount: bundle.manifest.environments.length,
        includesSnapshots: args.includeSnapshots,
        includesRunbook: args.includeRunbook,
        expiresAt,
      },
    });

    return {
      operationId: created.operationId,
      handoffId,
      packageJson,
      manifestSha256: bundle.manifestSha256,
      environmentCount: bundle.manifest.environments.length,
      expiresAt,
      status: "ready" as const,
      idempotent: false,
    };
  },
});

export const listForWebsite = authenticatedQuery({
  args: {
    websiteId: v.id("overseer_websites"),
    limit: v.optional(v.number()),
  },
  returns: v.array(handoffSummary),
  handler: async (ctx, args) => {
    const website = await requireWebsiteAccess(ctx, ctx.operator, args.websiteId);
    const limit = args.limit ?? 25;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Handoff limit must be between 1 and 100");
    }
    const rows = await ctx.db
      .query("overseer_siteHandoffs")
      .withIndex("by_website", (query) => query.eq("websiteId", website._id))
      .order("desc")
      .take(limit);
    return rows.map((row) => ({
      handoffId: row.handoffId,
      websiteId: row.websiteId,
      websiteKey: row.websiteKey,
      status: row.status,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  },
});

export const getPackage = authenticatedQuery({
  args: { handoffId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      handoffId: v.string(),
      packageJson: v.string(),
      status: v.union(v.literal("ready"), v.literal("downloaded")),
      expiresAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const handoff = await existingHandoff(ctx, args.handoffId);
    if (!handoff) return null;
    await requireWebsiteAccess(ctx, ctx.operator, handoff.websiteId);
    if (
      (handoff.status !== "ready" && handoff.status !== "downloaded") ||
      handoff.expiresAt <= Date.now()
    ) {
      return null;
    }
    parseHandoffBundle(handoff.packageManifestJson);
    return {
      handoffId: handoff.handoffId,
      packageJson: handoff.packageManifestJson,
      status: handoff.status,
      expiresAt: handoff.expiresAt,
    };
  },
});

export const markDownloaded = authenticatedMutation({
  args: { handoffId: v.string() },
  returns: handoffSummary,
  handler: async (ctx, args) => {
    const handoff = await existingHandoff(ctx, args.handoffId);
    if (!handoff) throw new Error("Handoff package not found");
    await requireWebsiteAccess(ctx, ctx.operator, handoff.websiteId);
    if (
      (handoff.status !== "ready" && handoff.status !== "downloaded") ||
      handoff.expiresAt <= Date.now()
    ) {
      throw new Error("Handoff package is not available");
    }
    if (handoff.status !== "downloaded") {
      await ctx.db.patch(handoff._id, {
        status: "downloaded",
        updatedAt: Date.now(),
      });
    }
    const updated = (await ctx.db.get(handoff._id))!;
    return {
      handoffId: updated.handoffId,
      websiteId: updated.websiteId,
      websiteKey: updated.websiteKey,
      status: updated.status,
      expiresAt: updated.expiresAt,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  },
});

export const revokePackage = authenticatedMutation({
  args: { handoffId: v.string(), confirmation: v.string() },
  returns: handoffSummary,
  handler: async (ctx, args) => {
    const handoff = await existingHandoff(ctx, args.handoffId);
    if (!handoff) throw new Error("Handoff package not found");
    await requireWebsiteAccess(ctx, ctx.operator, handoff.websiteId);
    if (args.confirmation !== `REVOKE HANDOFF ${handoff.handoffId}`) {
      throw new Error(`Type REVOKE HANDOFF ${handoff.handoffId} to confirm`);
    }
    if (handoff.status !== "revoked") {
      await ctx.db.patch(handoff._id, {
        status: "revoked",
        updatedAt: Date.now(),
      });
    }
    const updated = (await ctx.db.get(handoff._id))!;
    return {
      handoffId: updated.handoffId,
      websiteId: updated.websiteId,
      websiteKey: updated.websiteKey,
      status: updated.status,
      expiresAt: updated.expiresAt,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  },
});

export const importPackage = authenticatedMutation({
  args: {
    organizationId: v.id("overseer_organizations"),
    businessId: v.id("overseer_businesses"),
    packageJson: v.string(),
  },
  returns: v.object({
    websiteId: v.id("overseer_websites"),
    websiteKey: v.string(),
    instanceIds: v.array(v.id("overseer_websiteInstances")),
    environmentCount: v.number(),
    connectionsRequired: v.number(),
    idempotent: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const [organization, business] = await Promise.all([
      ctx.db.get(args.organizationId),
      ctx.db.get(args.businessId),
    ]);
    if (
      !organization?.isActive ||
      !business?.isActive ||
      business.organizationId !== organization._id
    ) {
      throw new Error("Handoff destination hierarchy is invalid");
    }
    await assertStoredAccess(ctx, ctx.operator, {
      selector: { type: "capability", code: "business.update" },
      target: {
        organizationId: String(organization._id),
        businessId: String(business._id),
      },
    });
    const plan = buildHandoffImportPlan({
      bundle: args.packageJson,
      now: Date.now(),
    });
    const primaryDomain = normalizeDomain(plan.website.primaryDomain);
    const websiteMatches = await ctx.db
      .query("overseer_websites")
      .withIndex("by_website_key", (query) =>
        query.eq("websiteKey", plan.website.websiteKey),
      )
      .take(2);
    if (websiteMatches.length > 1) {
      throw new Error("Portable website key is not unique");
    }
    let website = websiteMatches[0] ?? null;
    let idempotent = website !== null;
    if (website) {
      if (
        website.organization_id !== organization._id ||
        website.business_id !== business._id ||
        website.engine !== "convexpress" ||
        website.status === "archived" ||
        website.title !== plan.website.title ||
        website.primaryDomain !== primaryDomain
      ) {
        throw new Error("Handoff website collides with a different registry entry");
      }
    } else {
      const domains = await ctx.db
        .query("overseer_websites")
        .withIndex("by_domain", (query) => query.eq("primaryDomain", primaryDomain))
        .take(100);
      if (
        domains.some(
          (candidate) =>
            candidate.business_id === business._id &&
            candidate.status !== "archived",
        )
      ) {
        throw new Error("Handoff website domain already exists in this business");
      }
      const now = Date.now();
      const websiteId = await ctx.db.insert("overseer_websites", {
        owner_id: String(ctx.operator._id),
        organization_id: organization._id,
        business_id: business._id,
        websiteKey: plan.website.websiteKey,
        engine: "convexpress",
        title: plan.website.title,
        primaryDomain,
        status: "active",
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      });
      website = (await ctx.db.get(websiteId))!;
      idempotent = false;
    }

    const instanceIds: Id<"overseer_websiteInstances">[] = [];
    for (const [index, environment] of plan.environments.entries()) {
      const matches = await ctx.db
        .query("overseer_websiteInstances")
        .withIndex("by_instance_key", (query) =>
          query.eq("instanceKey", environment.instanceKey),
        )
        .take(2);
      if (matches.length > 1) {
        throw new Error("Portable environment key is not unique");
      }
      const existing = matches[0] ?? null;
      if (existing) {
        if (
          existing.website_id !== website._id ||
          existing.kind !== environment.kind ||
          existing.deploymentOrigin !== environment.deploymentOrigin ||
          existing.managementOrigin !== environment.managementOrigin ||
          existing.siteOrigin !== environment.siteOrigin ||
          existing.siteContractVersion !== environment.siteContractVersion ||
          existing.schemaVersion !== environment.schemaVersion ||
          existing.engineVersion !== environment.engineVersion ||
          existing.status !== "active"
        ) {
          throw new Error(
            "Handoff environment collides with a different registry entry",
          );
        }
        instanceIds.push(existing._id);
        continue;
      }

      const [deploymentMatches, managementMatches, siteMatches] = await Promise.all([
        ctx.db
          .query("overseer_websiteInstances")
          .withIndex("by_deployment_origin", (query) =>
            query.eq("deploymentOrigin", environment.deploymentOrigin),
          )
          .take(1),
        ctx.db
          .query("overseer_websiteInstances")
          .withIndex("by_management_origin", (query) =>
            query.eq("managementOrigin", environment.managementOrigin),
          )
          .take(1),
        ctx.db
          .query("overseer_websiteInstances")
          .withIndex("by_site_origin", (query) =>
            query.eq("siteOrigin", environment.siteOrigin),
          )
          .take(1),
      ]);
      if (
        deploymentMatches.length > 0 ||
        managementMatches.length > 0 ||
        siteMatches.length > 0
      ) {
        throw new Error("Handoff environment origin is already registered");
      }
      const compatibility = assessRuntimeCompatibility({
        siteContractVersion: environment.siteContractVersion,
        schemaVersion: environment.schemaVersion,
        engineVersion: environment.engineVersion,
      }).compatible
        ? "compatible"
        : "incompatible";
      const now = Date.now();
      const instanceId = await ctx.db.insert("overseer_websiteInstances", {
        owner_id: String(ctx.operator._id),
        organization_id: organization._id,
        business_id: business._id,
        website_id: website._id,
        instanceKey: environment.instanceKey,
        kind: environment.kind as typeof environmentKind.type,
        label: environment.label ?? undefined,
        deploymentOrigin: environment.deploymentOrigin,
        managementOrigin: environment.managementOrigin,
        siteOrigin: environment.siteOrigin,
        domain: new URL(environment.siteOrigin).hostname,
        siteContractVersion: environment.siteContractVersion,
        schemaVersion: environment.schemaVersion,
        engineVersion: environment.engineVersion,
        compatibility,
        lastCompatibilityAt: now,
        provisioning: "unprovisioned",
        health: "unknown",
        isDefault:
          environment.kind === "live" ||
          (index === 0 && !plan.environments.some((item) => item.kind === "live")),
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      instanceIds.push(instanceId);
      idempotent = false;
    }

    return {
      websiteId: website._id,
      websiteKey: website.websiteKey,
      instanceIds,
      environmentCount: instanceIds.length,
      connectionsRequired: instanceIds.length,
      idempotent,
    };
  },
});
