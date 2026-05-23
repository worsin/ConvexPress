// @ts-nocheck
import { ConvexError, v } from "convex/values";

import { internalMutation, mutation, query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";

const workflowStatus = v.union(
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("canceled"),
);

async function beginRun(ctx: any, args: any) {
  const existing = await ctx.db
    .query("commerce_workflow_runs")
    .withIndex("by_idempotency", (q: any) =>
      q.eq("workflowKey", args.workflowKey).eq("idempotencyKey", args.idempotencyKey),
    )
    .unique();

  if (existing) {
    return {
      runId: existing._id,
      status: existing.status,
      existing: true,
      result: existing.result,
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
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    if (args.status) {
      return await ctx.db
        .query("commerce_workflow_runs")
        .withIndex("by_status", (q: any) => q.eq("status", args.status))
        .order("desc")
        .take(limit);
    }
    if (args.entityType && args.entityId) {
      return await ctx.db
        .query("commerce_workflow_runs")
        .withIndex("by_entity", (q: any) =>
          q.eq("entityType", args.entityType).eq("entityId", args.entityId),
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
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const run = await ctx.db.get(args.runId);
    if (!run) throw new ConvexError({ code: "NOT_FOUND", message: "Workflow run not found." });
    const now = Date.now();
    await ctx.db.patch(args.runId, {
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
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const run = await ctx.db.get(args.runId);
    if (!run) throw new ConvexError({ code: "NOT_FOUND", message: "Workflow run not found." });
    const now = Date.now();
    await ctx.db.patch(args.runId, {
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
  handler: beginRun,
});

export const completeInternal = internalMutation({
  args: {
    runId: v.id("commerce_workflow_runs"),
    result: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.runId, {
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
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.runId, {
      status: "failed",
      error: args.error,
      failedAt: now,
      updatedAt: now,
    });
    return args.runId;
  },
});
