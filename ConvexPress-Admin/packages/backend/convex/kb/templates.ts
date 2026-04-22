/**
 * Knowledge Base System - Template Functions
 *
 * CRUD for reusable article templates:
 *   list    - All templates for admin (auth required)
 *   getById - Single template by ID (auth required)
 *   create  - Create a new template
 *   update  - Update an existing template
 *   remove  - Delete a template
 */

import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { generateTemplateSlug } from "./helpers/utils";
import {
  createTemplateArgs,
  updateTemplateArgs,
  removeTemplateArgs,
  getTemplateByIdArgs,
} from "./validators";
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

    return ctx.db
      .query("kb_templates")
      .withIndex("by_active", (q: ConvexQueryBuilder) => q.eq("isActive", true))
      .take(500);
  },
});

// ─── Get By ID (Admin) ─────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getById = query({
  args: getTemplateByIdArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    return ctx.db.get("kb_templates", args.templateId);
  },
});

// ─── Create ─────────────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const create = mutation({
  args: createTemplateArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "kb.manageTemplates");

    const name = args.name.trim();
    if (!name) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Template name is required" });
    }

    const slug = await generateTemplateSlug(ctx, name);
    const now = Date.now();

    const templateId = await ctx.db.insert("kb_templates", {
      name,
      slug,
      description: args.description,
      content: args.content,
      category: args.category,
      isDefault: args.isDefault ?? false,
      isActive: true,
      usageCount: 0,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    // If setting as default, unset other defaults in same category
    if (args.isDefault) {
      const others = await ctx.db
        .query("kb_templates")
        .withIndex("by_category", (q: ConvexQueryBuilder) => q.eq("category", args.category))
        .take(100);
      for (const other of others) {
        if (other._id !== templateId && other.isDefault) {
          await ctx.db.patch("kb_templates", other._id, { isDefault: false, updatedAt: now });
        }
      }
    }

    return templateId;
  },
});

// ─── Update ─────────────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const update = mutation({
  args: updateTemplateArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "kb.manageTemplates");

    const template = await ctx.db.get("kb_templates", args.templateId);
    if (!template) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Template not found" });
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) {
        throw new ConvexError({ code: "VALIDATION_ERROR", message: "Template name is required" });
      }
      updates.name = name;
      updates.slug = await generateTemplateSlug(ctx, name, args.templateId);
    }

    if (args.description !== undefined) updates.description = args.description;
    if (args.content !== undefined) updates.content = args.content;
    if (args.category !== undefined) updates.category = args.category;
    if (args.isActive !== undefined) updates.isActive = args.isActive;

    if (args.isDefault !== undefined) {
      updates.isDefault = args.isDefault;
      if (args.isDefault) {
        const category = args.category ?? template.category;
        const others = await ctx.db
          .query("kb_templates")
          .withIndex("by_category", (q: ConvexQueryBuilder) => q.eq("category", category))
          .take(100);
        for (const other of others) {
          if (other._id !== args.templateId && other.isDefault) {
            await ctx.db.patch("kb_templates", other._id, { isDefault: false, updatedAt: Date.now() });
          }
        }
      }
    }

    await ctx.db.patch("kb_templates", args.templateId, updates);
    return args.templateId;
  },
});

// ─── Remove ─────────────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const remove = mutation({
  args: removeTemplateArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "kb.manageTemplates");

    const template = await ctx.db.get("kb_templates", args.templateId);
    if (!template) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Template not found" });
    }

    await ctx.db.delete("kb_templates", args.templateId);
    return args.templateId;
  },
});
