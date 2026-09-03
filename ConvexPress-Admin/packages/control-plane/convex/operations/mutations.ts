import {
  cancel,
  restart,
  start,
  type WorkflowId,
} from "@convex-dev/workflow";
import { OPERATION_CAPABILITY, OPERATION_CODES } from "@convexpress/site-contract";
import { v } from "convex/values";

import { components, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { assertStoredAccess, authenticatedMutation } from "../rbac/functions";
import { outerCapabilityForSiteCapability } from "../siteBroker/policy";
import {
  createOperationRecord,
  resumeOperationRecord,
  setOperationWorkflowId,
} from "./records";
import { assertSnapshotCompatibleForTarget } from "./policy";

const startState = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("waiting"),
  v.literal("interrupted"),
  v.literal("resuming"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("cancelled"),
);

const startResult = v.object({
  operationId: v.id("overseer_siteOperations"),
  operationKey: v.string(),
  workflowId: v.string(),
  state: startState,
  idempotent: v.boolean(),
});

async function requireLifecycleAccess(
  ctx: MutationCtx,
  operator: Parameters<typeof assertStoredAccess>[1],
  input: {
    instanceId: Id<"overseer_websiteInstances">;
    outerCapability: string;
  },
) {
  const instance = await ctx.db.get(input.instanceId);
  if (!instance || instance.status !== "active") {
    throw new Error("Lifecycle environment not found");
  }
  const website = await ctx.db.get(instance.website_id);
  if (
    !website ||
    website.status !== "active" ||
    website.engine !== "convexpress" ||
    !website.organization_id ||
    !website.business_id ||
    instance.organization_id !== website.organization_id ||
    instance.business_id !== website.business_id
  ) {
    throw new Error("Lifecycle target identity is inconsistent");
  }
  const target = {
    organizationId: String(website.organization_id),
    businessId: String(website.business_id),
    websiteId: String(website._id),
    instanceId: String(instance._id),
  };
  await assertStoredAccess(ctx, operator, {
    selector: { type: "capability", code: input.outerCapability },
    target,
  });
  if (instance.kind === "live") {
    await assertStoredAccess(ctx, operator, {
      selector: { type: "capability", code: "environment.live.operate" },
      target,
    });
  }
  return { instance, website };
}

export const startBackup = authenticatedMutation({
  args: {
    instanceId: v.id("overseer_websiteInstances"),
    idempotencyKey: v.string(),
    includeStorage: v.boolean(),
    expectedRevision: v.optional(v.number()),
    provider: v.optional(v.union(v.literal("manual"), v.literal("magicdb"))),
  },
  returns: startResult,
  handler: async (ctx, args) => {
    if (!args.includeStorage) {
      throw new Error("Full site backups must include file storage");
    }
    const capability = outerCapabilityForSiteCapability(
      OPERATION_CAPABILITY[OPERATION_CODES.backupCreate],
    );
    const { website } = await requireLifecycleAccess(ctx, ctx.operator, {
      instanceId: args.instanceId,
      outerCapability: capability,
    });
    const created = await createOperationRecord(ctx, {
      operationCode: OPERATION_CODES.backupCreate,
      idempotencyKey: args.idempotencyKey,
      websiteId: website._id,
      instanceId: args.instanceId,
      requestedByUserId: ctx.operator._id,
      provider: args.provider ?? "manual",
      includeStorage: true,
      expectedRevision: args.expectedRevision,
    });

    if (created.idempotent) {
      const existing = await ctx.db.get(created.operationId);
      if (!existing?.workflowId) {
        throw new Error("Lifecycle operation is missing its durable workflow");
      }
      return {
        ...created,
        workflowId: existing.workflowId,
        state: existing.state,
      };
    }

    const workflowId: WorkflowId = await start(
      ctx,
      internal.operations.workflows.backupWorkflow,
      { operationId: created.operationId },
      {
        onComplete: internal.operations.internal.handleBackupComplete,
        context: { operationId: created.operationId },
      },
    );
    await setOperationWorkflowId(ctx, {
      operationId: created.operationId,
      workflowId,
    });
    return {
      ...created,
      workflowId,
      state: "queued" as const,
    };
  },
});

export const startRestore = authenticatedMutation({
  args: {
    instanceId: v.id("overseer_websiteInstances"),
    snapshotId: v.string(),
    confirmation: v.string(),
    idempotencyKey: v.string(),
    expectedRevision: v.optional(v.number()),
    provider: v.optional(v.union(v.literal("manual"), v.literal("magicdb"))),
  },
  returns: startResult,
  handler: async (ctx, args) => {
    const capability = outerCapabilityForSiteCapability(
      OPERATION_CAPABILITY[OPERATION_CODES.restore],
    );
    const { website, instance } = await requireLifecycleAccess(ctx, ctx.operator, {
      instanceId: args.instanceId,
      outerCapability: capability,
    });
    const snapshots = await ctx.db
      .query("overseer_siteBackups")
      .withIndex("by_snapshot_id", (q) => q.eq("snapshotId", args.snapshotId))
      .take(2);
    if (snapshots.length !== 1) {
      throw new Error("Restore snapshot was not found");
    }
    const snapshot = snapshots[0]!;
    if (
      snapshot.verificationStatus !== "verified" ||
      snapshot.websiteId !== website._id ||
      !instance.siteContractVersion ||
      !instance.schemaVersion ||
      !instance.engineVersion
    ) {
      throw new Error("Restore snapshot is not valid for this website");
    }
    assertSnapshotCompatibleForTarget({
      source: {
        siteContractVersion: snapshot.siteContractVersion,
        schemaVersion: snapshot.schemaVersion,
        engineVersion: snapshot.engineVersion,
      },
      target: {
        siteContractVersion: instance.siteContractVersion,
        schemaVersion: instance.schemaVersion,
        engineVersion: instance.engineVersion,
      },
    });
    const created = await createOperationRecord(ctx, {
      operationCode: OPERATION_CODES.restore,
      idempotencyKey: args.idempotencyKey,
      websiteId: website._id,
      instanceId: instance._id,
      requestedByUserId: ctx.operator._id,
      provider: args.provider ?? "manual",
      snapshotId: snapshot.snapshotId,
      confirmation: args.confirmation,
      expectedRevision: args.expectedRevision,
    });

    if (created.idempotent) {
      const existing = await ctx.db.get(created.operationId);
      if (!existing?.workflowId) {
        throw new Error("Lifecycle operation is missing its durable workflow");
      }
      return {
        ...created,
        workflowId: existing.workflowId,
        state: existing.state,
      };
    }
    const workflowId: WorkflowId = await start(
      ctx,
      internal.operations.workflows.restoreWorkflow,
      { operationId: created.operationId },
      {
        onComplete: internal.operations.internal.handleBackupComplete,
        context: { operationId: created.operationId },
      },
    );
    await setOperationWorkflowId(ctx, {
      operationId: created.operationId,
      workflowId,
    });
    return {
      ...created,
      workflowId,
      state: "queued" as const,
    };
  },
});

export const startClone = authenticatedMutation({
  args: {
    sourceInstanceId: v.id("overseer_websiteInstances"),
    instanceId: v.id("overseer_websiteInstances"),
    idempotencyKey: v.string(),
    expectedRevision: v.optional(v.number()),
    provider: v.optional(v.union(v.literal("manual"), v.literal("magicdb"))),
  },
  returns: startResult,
  handler: async (ctx, args) => {
    const capability = outerCapabilityForSiteCapability(
      OPERATION_CAPABILITY[OPERATION_CODES.clone],
    );
    const [target, source] = await Promise.all([
      requireLifecycleAccess(ctx, ctx.operator, {
        instanceId: args.instanceId,
        outerCapability: capability,
      }),
      requireLifecycleAccess(ctx, ctx.operator, {
        instanceId: args.sourceInstanceId,
        outerCapability: capability,
      }),
    ]);
    if (target.website._id !== source.website._id) {
      throw new Error("Clone source must belong to the target website");
    }
    const created = await createOperationRecord(ctx, {
      operationCode: OPERATION_CODES.clone,
      idempotencyKey: args.idempotencyKey,
      websiteId: target.website._id,
      instanceId: target.instance._id,
      sourceInstanceId: source.instance._id,
      requestedByUserId: ctx.operator._id,
      provider: args.provider ?? "manual",
      expectedRevision: args.expectedRevision,
    });
    if (created.idempotent) {
      const existing = await ctx.db.get(created.operationId);
      if (!existing?.workflowId) {
        throw new Error("Lifecycle operation is missing its durable workflow");
      }
      return {
        ...created,
        workflowId: existing.workflowId,
        state: existing.state,
      };
    }
    const workflowId: WorkflowId = await start(
      ctx,
      internal.operations.workflows.cloneWorkflow,
      { operationId: created.operationId },
      {
        onComplete: internal.operations.internal.handleBackupComplete,
        context: { operationId: created.operationId },
      },
    );
    await setOperationWorkflowId(ctx, {
      operationId: created.operationId,
      workflowId,
    });
    return {
      ...created,
      workflowId,
      state: "queued" as const,
    };
  },
});

export const startPromotion = authenticatedMutation({
  args: {
    sourceInstanceId: v.id("overseer_websiteInstances"),
    instanceId: v.id("overseer_websiteInstances"),
    confirmation: v.string(),
    idempotencyKey: v.string(),
    expectedRevision: v.optional(v.number()),
    provider: v.optional(v.union(v.literal("manual"), v.literal("magicdb"))),
  },
  returns: startResult,
  handler: async (ctx, args) => {
    const capability = outerCapabilityForSiteCapability(
      OPERATION_CAPABILITY[OPERATION_CODES.promote],
    );
    const [target, source] = await Promise.all([
      requireLifecycleAccess(ctx, ctx.operator, {
        instanceId: args.instanceId,
        outerCapability: capability,
      }),
      requireLifecycleAccess(ctx, ctx.operator, {
        instanceId: args.sourceInstanceId,
        outerCapability: capability,
      }),
    ]);
    if (target.website._id !== source.website._id) {
      throw new Error("Promotion source must belong to the target website");
    }
    const created = await createOperationRecord(ctx, {
      operationCode: OPERATION_CODES.promote,
      idempotencyKey: args.idempotencyKey,
      websiteId: target.website._id,
      instanceId: target.instance._id,
      sourceInstanceId: source.instance._id,
      requestedByUserId: ctx.operator._id,
      provider: args.provider ?? "manual",
      confirmation: args.confirmation,
      expectedRevision: args.expectedRevision,
    });
    if (created.idempotent) {
      const existing = await ctx.db.get(created.operationId);
      if (!existing?.workflowId) {
        throw new Error("Lifecycle operation is missing its durable workflow");
      }
      return {
        ...created,
        workflowId: existing.workflowId,
        state: existing.state,
      };
    }
    const workflowId: WorkflowId = await start(
      ctx,
      internal.operations.workflows.promoteWorkflow,
      { operationId: created.operationId },
      {
        onComplete: internal.operations.internal.handleBackupComplete,
        context: { operationId: created.operationId },
      },
    );
    await setOperationWorkflowId(ctx, {
      operationId: created.operationId,
      workflowId,
    });
    return {
      ...created,
      workflowId,
      state: "queued" as const,
    };
  },
});

export const cancelOperation = authenticatedMutation({
  args: { operationId: v.id("overseer_siteOperations") },
  returns: v.object({ operationId: v.id("overseer_siteOperations"), requested: v.boolean() }),
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId);
    if (!operation || !operation.workflowId) {
      throw new Error("Lifecycle operation not found");
    }
    const capability = outerCapabilityForSiteCapability(
      OPERATION_CAPABILITY[operation.operationCode],
    );
    await requireLifecycleAccess(ctx, ctx.operator, {
      instanceId: operation.instanceId,
      outerCapability: capability,
    });
    if (
      operation.state === "succeeded" ||
      operation.state === "failed" ||
      operation.state === "cancelled"
    ) {
      throw new Error("Lifecycle operation is already complete");
    }
    await cancel(ctx, components.workflow, operation.workflowId as WorkflowId);
    return { operationId: operation._id, requested: true };
  },
});

export const resumeOperation = authenticatedMutation({
  args: { operationId: v.id("overseer_siteOperations") },
  returns: v.object({
    operationId: v.id("overseer_siteOperations"),
    workflowId: v.string(),
    state: v.literal("running"),
  }),
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId);
    if (!operation?.workflowId || operation.state !== "interrupted") {
      throw new Error("Lifecycle operation is not resumable");
    }
    await requireLifecycleAccess(ctx, ctx.operator, {
      instanceId: operation.instanceId,
      outerCapability: outerCapabilityForSiteCapability("operation.resume"),
    });
    if (!operation.currentStep) {
      throw new Error("Lifecycle operation has no durable checkpoint");
    }
    await resumeOperationRecord(ctx, {
      operationId: operation._id,
      expectedRevision: operation.revision,
    });
    await restart(ctx, components.workflow, operation.workflowId as WorkflowId, {
      from: operation.currentStep,
      startAsync: true,
    });
    return {
      operationId: operation._id,
      workflowId: operation.workflowId,
      state: "running" as const,
    };
  },
});
