/**
 * Knowledge Base System - Workflow Functions
 *
 * Editorial workflow management:
 *   list          - All workflows (admin)
 *   get           - Single workflow by ID (admin)
 *   getDefault    - Get the default workflow (admin)
 *   create        - Create a workflow definition
 *   update        - Update a workflow definition
 *   remove        - Delete a workflow
 *   startWorkflow - Start a workflow for an article
 *   approveStep   - Approve the current workflow step
 *   rejectStep    - Reject the current workflow step
 */

import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import {
  createWorkflowArgs,
  updateWorkflowArgs,
  removeWorkflowArgs,
  startWorkflowArgs,
  approveStepArgs,
  rejectStepArgs,
} from "./validators";
import { v } from "convex/values";

// ─── List (Admin) ───────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    return ctx.db.query("kb_workflows").collect();
  },
});

// ─── Get (Admin) ────────────────────────────────────────────────────────────

export const get = query({
  args: { workflowId: v.id("kb_workflows") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    return ctx.db.get(args.workflowId);
  },
});

// ─── Get Default ────────────────────────────────────────────────────────────

export const getDefault = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    return ctx.db
      .query("kb_workflows")
      .withIndex("by_default", (q) => q.eq("isDefault", true))
      .first();
  },
});

// ─── Create ─────────────────────────────────────────────────────────────────

export const create = mutation({
  args: createWorkflowArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.manageWorkflows");

    const name = args.name.trim();
    if (!name) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Workflow name is required" });
    }

    if (args.steps.length === 0) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Workflow must have at least one step" });
    }

    const now = Date.now();

    // If setting as default, unset other defaults
    if (args.isDefault) {
      const existingDefault = await ctx.db
        .query("kb_workflows")
        .withIndex("by_default", (q) => q.eq("isDefault", true))
        .first();
      if (existingDefault) {
        await ctx.db.patch(existingDefault._id, { isDefault: false, updatedAt: now });
      }
    }

    const workflowId = await ctx.db.insert("kb_workflows", {
      name,
      description: args.description,
      steps: args.steps,
      isDefault: args.isDefault ?? false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return workflowId;
  },
});

// ─── Update ─────────────────────────────────────────────────────────────────

export const update = mutation({
  args: updateWorkflowArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.manageWorkflows");

    const workflow = await ctx.db.get(args.workflowId);
    if (!workflow) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Workflow not found" });
    }

    const updates: Record<string, any> = { updatedAt: Date.now() };

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) {
        throw new ConvexError({ code: "VALIDATION_ERROR", message: "Workflow name is required" });
      }
      updates.name = name;
    }

    if (args.description !== undefined) updates.description = args.description;
    if (args.steps !== undefined) {
      if (args.steps.length === 0) {
        throw new ConvexError({ code: "VALIDATION_ERROR", message: "Workflow must have at least one step" });
      }
      updates.steps = args.steps;
    }
    if (args.isActive !== undefined) updates.isActive = args.isActive;

    if (args.isDefault !== undefined) {
      updates.isDefault = args.isDefault;
      if (args.isDefault) {
        const existingDefault = await ctx.db
          .query("kb_workflows")
          .withIndex("by_default", (q) => q.eq("isDefault", true))
          .first();
        if (existingDefault && existingDefault._id !== args.workflowId) {
          await ctx.db.patch(existingDefault._id, { isDefault: false, updatedAt: Date.now() });
        }
      }
    }

    await ctx.db.patch(args.workflowId, updates);
    return args.workflowId;
  },
});

// ─── Remove ─────────────────────────────────────────────────────────────────

export const remove = mutation({
  args: removeWorkflowArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.manageWorkflows");

    const workflow = await ctx.db.get(args.workflowId);
    if (!workflow) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Workflow not found" });
    }

    // Delete all article workflow instances using this workflow
    const instances = await ctx.db
      .query("kb_articleWorkflows")
      .withIndex("by_status")
      .collect();
    for (const instance of instances) {
      if (instance.workflowId === args.workflowId) {
        await ctx.db.delete(instance._id);
      }
    }

    await ctx.db.delete(args.workflowId);
    return args.workflowId;
  },
});

// ─── Start Workflow ─────────────────────────────────────────────────────────

export const startWorkflow = mutation({
  args: startWorkflowArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const article = await ctx.db.get(args.articleId);
    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }

    // Get the workflow (specified or default)
    let workflow;
    if (args.workflowId) {
      workflow = await ctx.db.get(args.workflowId);
    } else {
      workflow = await ctx.db
        .query("kb_workflows")
        .withIndex("by_default", (q) => q.eq("isDefault", true))
        .first();
    }

    if (!workflow) {
      throw new ConvexError({ code: "NOT_FOUND", message: "No workflow found" });
    }

    if (!workflow.isActive) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Workflow is not active" });
    }

    // Check for existing active workflow on this article
    const existingWorkflow = await ctx.db
      .query("kb_articleWorkflows")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();
    const activeWorkflow = existingWorkflow.find(
      (w) => w.status === "inProgress" || w.status === "pendingReview",
    );
    if (activeWorkflow) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Article already has an active workflow" });
    }

    // Update article status to review
    await ctx.db.patch(args.articleId, {
      status: "review",
      updatedAt: Date.now(),
    });

    const now = Date.now();
    const firstStep = workflow.steps[0];
    const articleWorkflowId = await ctx.db.insert("kb_articleWorkflows", {
      articleId: args.articleId,
      workflowId: workflow._id,
      currentStep: 0,
      status: "pendingReview",
      assigneeId: firstStep?.assigneeId,
      dueDate: undefined,
      approvals: [],
      createdAt: now,
      updatedAt: now,
    });

    return articleWorkflowId;
  },
});

// ─── Approve Step ───────────────────────────────────────────────────────────

export const approveStep = mutation({
  args: approveStepArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.publish");

    const articleWorkflow = await ctx.db.get(args.articleWorkflowId);
    if (!articleWorkflow) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article workflow not found" });
    }

    if (articleWorkflow.status !== "pendingReview") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Workflow is not pending review" });
    }

    const workflow = await ctx.db.get(articleWorkflow.workflowId);
    if (!workflow) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Workflow definition not found" });
    }

    const currentStep = workflow.steps[articleWorkflow.currentStep];
    if (!currentStep) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Invalid workflow step" });
    }

    const newApprovals = [...articleWorkflow.approvals, user._id];
    const now = Date.now();

    // Check if enough approvals for this step
    if (newApprovals.length >= currentStep.requiredApprovals) {
      const nextStepIndex = articleWorkflow.currentStep + 1;

      if (nextStepIndex >= workflow.steps.length) {
        // All steps completed -- workflow approved
        await ctx.db.patch(args.articleWorkflowId, {
          status: "approved",
          approvals: newApprovals,
          updatedAt: now,
        });

        // Publish the article
        const article = await ctx.db.get(articleWorkflow.articleId);
        if (article) {
          await ctx.db.patch(articleWorkflow.articleId, {
            status: "published",
            publishedAt: now,
            updatedAt: now,
            meilisearchSynced: false,
            ragSynced: false,
          });
          // Increment category article count
          if (article.categoryId) {
            const category = await ctx.db.get(article.categoryId);
            if (category) {
              await ctx.db.patch(article.categoryId, { articleCount: category.articleCount + 1 });
            }
          }
        }
      } else {
        // Move to next step
        const nextStep = workflow.steps[nextStepIndex];
        await ctx.db.patch(args.articleWorkflowId, {
          currentStep: nextStepIndex,
          approvals: [],
          assigneeId: nextStep?.assigneeId,
          updatedAt: now,
        });
      }
    } else {
      // Record approval but wait for more
      await ctx.db.patch(args.articleWorkflowId, {
        approvals: newApprovals,
        updatedAt: now,
      });
    }

    return args.articleWorkflowId;
  },
});

// ─── Reject Step ────────────────────────────────────────────────────────────

export const rejectStep = mutation({
  args: rejectStepArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.publish");

    const articleWorkflow = await ctx.db.get(args.articleWorkflowId);
    if (!articleWorkflow) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article workflow not found" });
    }

    if (articleWorkflow.status !== "pendingReview") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Workflow is not pending review" });
    }

    const now = Date.now();
    await ctx.db.patch(args.articleWorkflowId, {
      status: "rejected",
      updatedAt: now,
    });

    // Revert article to draft
    await ctx.db.patch(articleWorkflow.articleId, {
      status: "draft",
      updatedAt: now,
    });

    return args.articleWorkflowId;
  },
});
