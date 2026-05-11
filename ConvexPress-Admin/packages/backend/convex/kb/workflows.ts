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
import { emitEvent } from "../helpers/events";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { KB_EVENTS, SYSTEM } from "../events/constants";
import {
  createWorkflowArgs,
  updateWorkflowArgs,
  removeWorkflowArgs,
  startWorkflowArgs,
  approveStepArgs,
  rejectStepArgs,
} from "./validators";
import { v } from "convex/values";
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";

// ─── List (Admin) ───────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const list = query({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    return ctx.db.query("kb_workflows").take(100);
  },
});

// ─── Get (Admin) ────────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const get = query({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { workflowId: v.id("kb_workflows") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    return ctx.db.get("kb_workflows", args.workflowId);
  },
});

// ─── Get Default ────────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getDefault = query({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    return ctx.db
      .query("kb_workflows")
      .withIndex("by_default", (q: ConvexQueryBuilder) => q.eq("isDefault", true))
      .first();
  },
});

// ─── Create ─────────────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const create = mutation({
  args: createWorkflowArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
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
        .withIndex("by_default", (q: ConvexQueryBuilder) => q.eq("isDefault", true))
        .first();
      if (existingDefault) {
        await ctx.db.patch("kb_workflows", existingDefault._id, { isDefault: false, updatedAt: now });
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

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const update = mutation({
  args: updateWorkflowArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "kb.manageWorkflows");

    const workflow = await ctx.db.get("kb_workflows", args.workflowId);
    if (!workflow) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Workflow not found" });
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };

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
          .withIndex("by_default", (q: ConvexQueryBuilder) => q.eq("isDefault", true))
          .first();
        if (existingDefault && existingDefault._id !== args.workflowId) {
          await ctx.db.patch("kb_workflows", existingDefault._id, { isDefault: false, updatedAt: Date.now() });
        }
      }
    }

    await ctx.db.patch("kb_workflows", args.workflowId, updates);
    return args.workflowId;
  },
});

// ─── Remove ─────────────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const remove = mutation({
  args: removeWorkflowArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "kb.manageWorkflows");

    const workflow = await ctx.db.get("kb_workflows", args.workflowId);
    if (!workflow) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Workflow not found" });
    }

    // Delete all article workflow instances using this workflow
    const instances = await ctx.db
      .query("kb_articleWorkflows")
      .withIndex("by_workflow", (q: ConvexQueryBuilder) => q.eq("workflowId", args.workflowId))
      .take(500);
    for (const instance of instances) {
      await ctx.db.delete("kb_articleWorkflows", instance._id);
    }

    await ctx.db.delete("kb_workflows", args.workflowId);
    return args.workflowId;
  },
});

// ─── Start Workflow ─────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const startWorkflow = mutation({
  args: startWorkflowArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const article = await ctx.db.get("kb_articles", args.articleId);
    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }

    // Get the workflow (specified or default)
    let workflow;
    if (args.workflowId) {
      workflow = await ctx.db.get("kb_workflows", args.workflowId);
    } else {
      workflow = await ctx.db
        .query("kb_workflows")
        .withIndex("by_default", (q: ConvexQueryBuilder) => q.eq("isDefault", true))
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
      .withIndex("by_article", (q: ConvexQueryBuilder) => q.eq("articleId", args.articleId))
      .take(50);
    const activeWorkflow = existingWorkflow.find(
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      (w) => w.status === "inProgress" || w.status === "pendingReview",
    );
    if (activeWorkflow) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Article already has an active workflow" });
    }

    // Update article status to review
    await ctx.db.patch("kb_articles", args.articleId, {
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

    if (firstStep?.assigneeId) {
      await emitEvent(ctx, KB_EVENTS.WORKFLOW_STEP_READY, SYSTEM.KB, {
        articleWorkflowId,
        articleId: args.articleId,
        workflowId: workflow._id,
        assigneeId: firstStep.assigneeId,
        stepIndex: 0,
        stepName: firstStep.name,
        authorId: article.authorId,
        articleTitle: article.title,
      });
    }

    return articleWorkflowId;
  },
});

// ─── Approve Step ───────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const approveStep = mutation({
  args: approveStepArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "kb.publish");

    const articleWorkflow = await ctx.db.get("kb_articleWorkflows", args.articleWorkflowId);
    if (!articleWorkflow) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article workflow not found" });
    }

    if (articleWorkflow.status !== "pendingReview") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Workflow is not pending review" });
    }

    const workflow = await ctx.db.get("kb_workflows", articleWorkflow.workflowId);
    if (!workflow) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Workflow definition not found" });
    }

    const currentStep = workflow.steps[articleWorkflow.currentStep];
    if (!currentStep) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Invalid workflow step" });
    }

    // Prevent the same user from approving the same step twice
    if (articleWorkflow.approvals.includes(user._id)) {
      throw new ConvexError({
        code: "ALREADY_APPROVED",
        message: "You have already approved this step",
      });
    }

    const article = await ctx.db.get("kb_articles", articleWorkflow.articleId);
    const newApprovals = [...articleWorkflow.approvals, user._id];
    const now = Date.now();

    // Check if enough approvals for this step
    if (newApprovals.length >= currentStep.requiredApprovals) {
      const nextStepIndex = articleWorkflow.currentStep + 1;

      if (nextStepIndex >= workflow.steps.length) {
        // All steps completed -- workflow approved
        await ctx.db.patch("kb_articleWorkflows", args.articleWorkflowId, {
          status: "approved",
          approvals: newApprovals,
          updatedAt: now,
        });

        // Publish the article
        if (article) {
          // Don't publish if article has been archived or deleted in the meantime
          if (article.status === "archived") {
            throw new ConvexError({
              code: "VALIDATION_ERROR",
              message: "Cannot publish: article has been archived",
            });
          }
          await ctx.db.patch("kb_articles", articleWorkflow.articleId, {
            status: "published",
            publishedAt: now,
            updatedAt: now,
            meilisearchSynced: false,
            ragSynced: false,
          });
          // Increment category article count
          if (article.categoryId) {
            const category = await ctx.db.get("kb_categories", article.categoryId);
            if (category) {
              await ctx.db.patch("kb_categories", article.categoryId, {
                articleCount: category.articleCount + 1,
                updatedAt: now,
              });
            }
          }

          await emitEvent(ctx, KB_EVENTS.WORKFLOW_APPROVED, SYSTEM.KB, {
            articleWorkflowId: args.articleWorkflowId,
            articleId: articleWorkflow.articleId,
            workflowId: workflow._id,
            reviewerId: user._id,
            authorId: article.authorId,
            articleTitle: article.title,
            stepName: currentStep.name,
            nextStep: null,
          });
        }
      } else {
        // Move to next step
        const nextStep = workflow.steps[nextStepIndex];
        await ctx.db.patch("kb_articleWorkflows", args.articleWorkflowId, {
          currentStep: nextStepIndex,
          approvals: [],
          assigneeId: nextStep?.assigneeId,
          updatedAt: now,
        });

        if (article && nextStep?.assigneeId) {
          await emitEvent(ctx, KB_EVENTS.WORKFLOW_STEP_READY, SYSTEM.KB, {
            articleWorkflowId: args.articleWorkflowId,
            articleId: articleWorkflow.articleId,
            workflowId: workflow._id,
            assigneeId: nextStep.assigneeId,
            stepIndex: nextStepIndex,
            stepName: nextStep.name,
            authorId: article.authorId,
            articleTitle: article.title,
            reviewerId: user._id,
          });
        }
      }
    } else {
      // Record approval but wait for more
      await ctx.db.patch("kb_articleWorkflows", args.articleWorkflowId, {
        approvals: newApprovals,
        updatedAt: now,
      });
    }

    return args.articleWorkflowId;
  },
});

// ─── Reject Step ────────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const rejectStep = mutation({
  args: rejectStepArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "kb.publish");

    const articleWorkflow = await ctx.db.get("kb_articleWorkflows", args.articleWorkflowId);
    if (!articleWorkflow) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article workflow not found" });
    }

    if (articleWorkflow.status !== "pendingReview") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Workflow is not pending review" });
    }

    const now = Date.now();
    await ctx.db.patch("kb_articleWorkflows", args.articleWorkflowId, {
      status: "rejected",
      updatedAt: now,
    });

    // Revert article to draft
    const article = await ctx.db.get("kb_articles", articleWorkflow.articleId);
    await ctx.db.patch("kb_articles", articleWorkflow.articleId, {
      status: "draft",
      updatedAt: now,
    });

    await emitEvent(ctx, KB_EVENTS.WORKFLOW_REJECTED, SYSTEM.KB, {
      articleWorkflowId: args.articleWorkflowId,
      articleId: articleWorkflow.articleId,
      workflowId: articleWorkflow.workflowId,
      reviewerId: user._id,
      authorId: article?.authorId ?? null,
      articleTitle: article?.title ?? "",
      rejectionReason: args.reason,
    });

    return args.articleWorkflowId;
  },
});
