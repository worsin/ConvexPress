import { ConvexError, v } from "convex/values";

import { internalMutation, mutation, query, type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireCan } from "../helpers/permissions";

import { commerceDocs } from "../schema/commerce.docs.generated";
const workflowStatus = v.union(
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("canceled"),
);

type BeginRunArgs = {
  workflowKey: string;
  idempotencyKey: string;
  entityType?: string;
  entityId?: string;
  input?: unknown;
  lockedUntil?: number;
};

/**
 * `resultJson` is the stored result of an earlier run, serialized: results are
 * stored untyped, so callers parse and validate the value they expect.
 */
type BeginRunResult = {
  runId: Id<"commerce_workflow_runs">;
  status: Doc<"commerce_workflow_runs">["status"];
  existing: boolean;
  resultJson?: string;
  error?: string;
};

async function beginRun(ctx: Pick<MutationCtx, "db">, args: BeginRunArgs): Promise<BeginRunResult> {
  const existing = await ctx.db
    .query("commerce_workflow_runs")
    .withIndex("by_idempotency", (q) =>
      q.eq("workflowKey", args.workflowKey).eq("idempotencyKey", args.idempotencyKey),
    )
    .unique();

  if (existing) {
    return {
      runId: existing._id,
      status: existing.status,
      existing: true,
      resultJson: existing.result === undefined ? undefined : JSON.stringify(existing.result),
      error: existing.error,
    };
  }

  const now = Date.now();
  const runId = await ctx.db.insert("commerce_workflow_runs", {
    workflowKey: args.workflowKey,
    idempotencyKey: args.idempotencyKey,
    status: "running",
    entityType: args.entityType,
    entityId: args.entityId,
    input: args.input,
    lockedUntil: args.lockedUntil,
    startedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  return { runId, status: "running", existing: false };
}

export const list = query({
  args: {
    status: v.optional(workflowStatus),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(commerceDocs.commerce_workflow_runs),
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    const status = args.status;
    if (status) {
      return await ctx.db
        .query("commerce_workflow_runs")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .take(limit);
    }
    const { entityType, entityId } = args;
    if (entityType && entityId) {
      return await ctx.db
        .query("commerce_workflow_runs")
        .withIndex("by_entity", (q) =>
          q.eq("entityType", entityType).eq("entityId", entityId),
        )
        .order("desc")
        .take(limit);
    }
    return await ctx.db.query("commerce_workflow_runs").order("desc").take(limit);
  },
});

export const begin = mutation({
  args: {
    workflowKey: v.string(),
    idempotencyKey: v.string(),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    input: v.optional(v.any()),
    lockedUntil: v.optional(v.number()),
  },
  returns: v.object({
    runId: v.id("commerce_workflow_runs"),
    status: v.union(v.literal("failed"), v.literal("completed"), v.literal("running"), v.literal("canceled")),
    existing: v.boolean(),
    resultJson: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    return await beginRun(ctx, args);
  },
});

export const complete = mutation({
  args: {
    runId: v.id("commerce_workflow_runs"),
    result: v.optional(v.any()),
  },
  returns: v.id("commerce_workflow_runs"),
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const run = await ctx.db.get(args.runId);
    if (!run) throw new ConvexError({ code: "NOT_FOUND", message: "Workflow run not found." });
    const now = Date.now();
    await ctx.db.patch("commerce_workflow_runs", args.runId, {
      status: "completed",
      result: args.result,
      completedAt: now,
      updatedAt: now,
    });
    return args.runId;
  },
});

export const fail = mutation({
  args: {
    runId: v.id("commerce_workflow_runs"),
    error: v.string(),
  },
  returns: v.id("commerce_workflow_runs"),
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const run = await ctx.db.get(args.runId);
    if (!run) throw new ConvexError({ code: "NOT_FOUND", message: "Workflow run not found." });
    const now = Date.now();
    await ctx.db.patch("commerce_workflow_runs", args.runId, {
      status: "failed",
      error: args.error,
      failedAt: now,
      updatedAt: now,
    });
    return args.runId;
  },
});

export const beginInternal = internalMutation({
  args: {
    workflowKey: v.string(),
    idempotencyKey: v.string(),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    input: v.optional(v.any()),
    lockedUntil: v.optional(v.number()),
  },
  returns: v.object({
    runId: v.id("commerce_workflow_runs"),
    status: v.union(v.literal("failed"), v.literal("completed"), v.literal("running"), v.literal("canceled")),
    existing: v.boolean(),
    resultJson: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: beginRun,
});

export const completeInternal = internalMutation({
  args: {
    runId: v.id("commerce_workflow_runs"),
    result: v.optional(v.any()),
  },
  returns: v.id("commerce_workflow_runs"),
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch("commerce_workflow_runs", args.runId, {
      status: "completed",
      result: args.result,
      completedAt: now,
      updatedAt: now,
    });
    return args.runId;
  },
});

export const failInternal = internalMutation({
  args: {
    runId: v.id("commerce_workflow_runs"),
    error: v.string(),
  },
  returns: v.id("commerce_workflow_runs"),
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch("commerce_workflow_runs", args.runId, {
      status: "failed",
      error: args.error,
      failedAt: now,
      updatedAt: now,
    });
    return args.runId;
  },
});
