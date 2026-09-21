import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import { assertStoredAccess, authenticatedQuery } from "../rbac/functions";

const operationState = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("waiting"),
  v.literal("interrupted"),
  v.literal("resuming"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("cancelled"),
);

const operationSummary = v.object({
  operationId: v.id("overseer_siteOperations"),
  operationKey: v.string(),
  operationCode: v.string(),
  websiteKey: v.string(),
  instanceKey: v.string(),
  sourceInstanceKey: v.union(v.string(), v.null()),
  snapshotId: v.union(v.string(), v.null()),
  provider: v.union(v.literal("manual"), v.literal("magicdb")),
  state: operationState,
  currentStep: v.union(v.string(), v.null()),
  liveTarget: v.boolean(),
  revision: v.number(),
  workflowId: v.union(v.string(), v.null()),
  preBackupSnapshotId: v.union(v.string(), v.null()),
  preBackupReceiptId: v.union(v.string(), v.null()),
  failureCode: v.union(v.string(), v.null()),
  failureMessage: v.union(v.string(), v.null()),
  startedAt: v.union(v.number(), v.null()),
  completedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const stepSummary = v.object({
  stepId: v.id("overseer_operationSteps"),
  stepKey: v.string(),
  sequence: v.number(),
  state: v.string(),
  attempt: v.number(),
  checkpointCode: v.union(v.string(), v.null()),
  errorCode: v.union(v.string(), v.null()),
  startedAt: v.union(v.number(), v.null()),
  completedAt: v.union(v.number(), v.null()),
});

const receiptSummary = v.object({
  receiptId: v.string(),
  operationCode: v.string(),
  status: v.string(),
  preBackupSnapshotId: v.union(v.string(), v.null()),
  preBackupReceiptId: v.union(v.string(), v.null()),
  summaryJson: v.union(v.string(), v.null()),
  startedAt: v.number(),
  completedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
});

function summarizeOperation(
  operation: Doc<"overseer_siteOperations">,
  preBackupSnapshotId: string | null,
) {
  return {
    operationId: operation._id,
    operationKey: operation.operationKey,
    operationCode: operation.operationCode,
    websiteKey: operation.websiteKey,
    instanceKey: operation.instanceKey,
    sourceInstanceKey: operation.sourceInstanceKey ?? null,
    snapshotId: operation.snapshotId ?? null,
    provider: operation.provider,
    state: operation.state,
    currentStep: operation.currentStep ?? null,
    liveTarget: operation.liveTarget,
    revision: operation.revision,
    workflowId: operation.workflowId ?? null,
    preBackupSnapshotId,
    preBackupReceiptId: operation.preBackupReceiptId ?? null,
    failureCode: operation.failureCode ?? null,
    failureMessage: operation.failureMessage ?? null,
    startedAt: operation.startedAt ?? null,
    completedAt: operation.completedAt ?? null,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
  };
}

async function authorizeOperation(ctx: any, operation: any) {
  const website = await ctx.db.get(operation.websiteId);
  if (!website?.organization_id || !website.business_id) {
    throw new Error("Lifecycle operation target is unavailable");
  }
  await assertStoredAccess(ctx, ctx.operator, {
    selector: { type: "capability", code: "environment.read" },
    target: {
      organizationId: String(website.organization_id),
      businessId: String(website.business_id),
      websiteId: String(website._id),
      instanceId: String(operation.instanceId),
    },
  });
}

export const get = authenticatedQuery({
  args: { operationId: v.id("overseer_siteOperations") },
  returns: v.object({
    operation: operationSummary,
    steps: v.array(stepSummary),
    receipts: v.array(receiptSummary),
  }),
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId);
    if (!operation) throw new Error("Lifecycle operation not found");
    await authorizeOperation(ctx, operation);
    const [steps, receipts, preBackup] = await Promise.all([
      ctx.db
        .query("overseer_operationSteps")
        .withIndex("by_operation_sequence", (q) =>
          q.eq("operationId", operation._id),
        )
        .take(32),
      ctx.db
        .query("overseer_operationReceipts")
        .withIndex("by_operation", (q) => q.eq("operationId", operation._id))
        .order("asc")
        .take(32),
      operation.preBackupId ? ctx.db.get(operation.preBackupId) : null,
    ]);
    return {
      operation: summarizeOperation(operation, preBackup?.snapshotId ?? null),
      steps: steps.map((step) => ({
        stepId: step._id,
        stepKey: step.stepKey,
        sequence: step.sequence,
        state: step.state,
        attempt: step.attempt,
        checkpointCode: step.checkpointCode ?? null,
        errorCode: step.errorCode ?? null,
        startedAt: step.startedAt ?? null,
        completedAt: step.completedAt ?? null,
      })),
      receipts: receipts.map((receipt) => ({
        receiptId: receipt.receiptId,
        operationCode: receipt.operationCode,
        status: receipt.status,
        preBackupSnapshotId: receipt.preBackupSnapshotId ?? null,
        preBackupReceiptId: receipt.preBackupReceiptId ?? null,
        summaryJson: receipt.summaryJson ?? null,
        startedAt: receipt.startedAt,
        completedAt: receipt.completedAt ?? null,
        createdAt: receipt.createdAt,
      })),
    };
  },
});

export const listForInstance = authenticatedQuery({
  args: {
    instanceId: v.id("overseer_websiteInstances"),
    limit: v.optional(v.number()),
  },
  returns: v.array(operationSummary),
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.instanceId);
    if (!instance) throw new Error("Lifecycle environment not found");
    const website = await ctx.db.get(instance.website_id);
    if (!website?.organization_id || !website.business_id) {
      throw new Error("Lifecycle environment target is unavailable");
    }
    await assertStoredAccess(ctx, ctx.operator, {
      selector: { type: "capability", code: "environment.read" },
      target: {
        organizationId: String(website.organization_id),
        businessId: String(website.business_id),
        websiteId: String(website._id),
        instanceId: String(instance._id),
      },
    });
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 25), 100));
    const operations = await ctx.db
      .query("overseer_siteOperations")
      .withIndex("by_instance_created", (q) => q.eq("instanceId", instance._id))
      .order("desc")
      .take(limit);
    const summaries = [];
    for (const operation of operations) {
      const preBackup = operation.preBackupId
        ? await ctx.db.get(operation.preBackupId)
        : null;
      summaries.push(
        summarizeOperation(operation, preBackup?.snapshotId ?? null),
      );
    }
    return summaries;
  },
});

export const listBackupsForInstance = authenticatedQuery({
  args: {
    instanceId: v.id("overseer_websiteInstances"),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      backupId: v.id("overseer_siteBackups"),
      snapshotId: v.string(),
      purpose: v.string(),
      checksumSha256: v.string(),
      sizeBytes: v.number(),
      tableCount: v.number(),
      storageObjectCount: v.number(),
      verificationStatus: v.string(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.instanceId);
    if (!instance) throw new Error("Lifecycle environment not found");
    const website = await ctx.db.get(instance.website_id);
    if (!website?.organization_id || !website.business_id) {
      throw new Error("Lifecycle environment target is unavailable");
    }
    await assertStoredAccess(ctx, ctx.operator, {
      selector: { type: "capability", code: "environment.read" },
      target: {
        organizationId: String(website.organization_id),
        businessId: String(website.business_id),
        websiteId: String(website._id),
        instanceId: String(instance._id),
      },
    });
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 25), 100));
    const backups = await ctx.db
      .query("overseer_siteBackups")
      .withIndex("by_instance_created", (q) => q.eq("instanceId", instance._id))
      .order("desc")
      .take(limit);
    return backups.map((backup) => ({
      backupId: backup._id,
      snapshotId: backup.snapshotId,
      purpose: backup.purpose,
      checksumSha256: backup.checksumSha256,
      sizeBytes: backup.sizeBytes,
      tableCount: backup.tableCount,
      storageObjectCount: backup.storageObjectCount,
      verificationStatus: backup.verificationStatus,
      createdAt: backup.createdAt,
    }));
  },
});

export const listBackupsForWebsite = authenticatedQuery({
  args: {
    targetInstanceId: v.id("overseer_websiteInstances"),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      backupId: v.id("overseer_siteBackups"),
      snapshotId: v.string(),
      purpose: v.string(),
      instanceKey: v.string(),
      environmentKind: v.string(),
      checksumSha256: v.string(),
      sizeBytes: v.number(),
      tableCount: v.number(),
      storageObjectCount: v.number(),
      verificationStatus: v.literal("verified"),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.targetInstanceId);
    if (!instance) throw new Error("Lifecycle environment not found");
    const website = await ctx.db.get(instance.website_id);
    if (!website?.organization_id || !website.business_id) {
      throw new Error("Lifecycle environment target is unavailable");
    }
    await assertStoredAccess(ctx, ctx.operator, {
      selector: { type: "capability", code: "environment.read" },
      target: {
        organizationId: String(website.organization_id),
        businessId: String(website.business_id),
        websiteId: String(website._id),
        instanceId: String(instance._id),
      },
    });
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 50), 100));
    const backups = await ctx.db
      .query("overseer_siteBackups")
      .withIndex("by_website_created", (q) => q.eq("websiteId", website._id))
      .order("desc")
      .take(limit);
    return backups
      .filter((backup) => backup.verificationStatus === "verified")
      .map((backup) => ({
        backupId: backup._id,
        snapshotId: backup.snapshotId,
        purpose: backup.purpose,
        instanceKey: backup.instanceKey,
        environmentKind: backup.environmentKind,
        checksumSha256: backup.checksumSha256,
        sizeBytes: backup.sizeBytes,
        tableCount: backup.tableCount,
        storageObjectCount: backup.storageObjectCount,
        verificationStatus: "verified" as const,
        createdAt: backup.createdAt,
      }));
  },
});

export const pageForInstance = authenticatedQuery({
  args: { instanceId: v.id("overseer_websiteInstances"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(operationSummary),
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.instanceId);
    if (!instance) throw new Error("Lifecycle environment not found");
    await authorizeOperation(ctx, { websiteId: instance.website_id, instanceId: instance._id });
    if (!Number.isSafeInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 100) throw new Error("History page size must be between 1 and 100");
    const page = await ctx.db.query("overseer_siteOperations").withIndex("by_instance_created", q => q.eq("instanceId", instance._id)).order("desc").paginate(args.paginationOpts);
    const summaries = [];
    for (const operation of page.page) {
      const backup = operation.preBackupId ? await ctx.db.get(operation.preBackupId) : null;
      summaries.push(summarizeOperation(operation, backup?.snapshotId ?? null));
    }
    return { ...page, page: summaries };
  },
});
export const pageBackupsForInstance = authenticatedQuery({
  args: { instanceId: v.id("overseer_websiteInstances"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({backupId:v.id("overseer_siteBackups"),snapshotId:v.string(),purpose:v.string(),checksumSha256:v.string(),sizeBytes:v.number(),tableCount:v.number(),storageObjectCount:v.number(),verificationStatus:v.string(),createdAt:v.number()})),
  handler: async(ctx,args)=>{
    const instance=await ctx.db.get(args.instanceId);if(!instance)throw new Error("Lifecycle environment not found");
    await authorizeOperation(ctx,{websiteId:instance.website_id,instanceId:instance._id});
    if(!Number.isSafeInteger(args.paginationOpts.numItems)||args.paginationOpts.numItems<1||args.paginationOpts.numItems>100)throw new Error("History page size must be between 1 and 100");
    const result=await ctx.db.query("overseer_siteBackups").withIndex("by_instance_created",q=>q.eq("instanceId",instance._id)).order("desc").paginate(args.paginationOpts);
    return {...result,page:result.page.map(backup=>({backupId:backup._id,snapshotId:backup.snapshotId,purpose:backup.purpose,checksumSha256:backup.checksumSha256,sizeBytes:backup.sizeBytes,tableCount:backup.tableCount,storageObjectCount:backup.storageObjectCount,verificationStatus:backup.verificationStatus,createdAt:backup.createdAt}))};
  },
});
