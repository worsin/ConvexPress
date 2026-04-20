/**
 * Ticket System - Canned Response Functions
 *
 * CRUD and utility functions for admin canned response templates:
 *   list              - All canned responses (sorted by usage)
 *   listByCategory    - Filtered by category
 *   getByShortcut     - Lookup by shortcut string (e.g., "/refund")
 *   search            - Full-text search across title and content
 *   applyTemplate     - Apply template with {{variable}} substitution
 *   create            - Create a new canned response
 *   update            - Update an existing canned response
 *   remove            - Delete a canned response
 *   incrementUsage    - Bump usage counter (called on insertion)
 *   getCategories     - Get distinct category list
 *
 * Template variables supported:
 *   {{userName}}      - Ticket owner's display name
 *   {{ticketNumber}}  - The ticket number string
 *   {{category}}      - Ticket category label
 */

import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { requireCan, currentUserCan } from "../helpers/permissions";
import {
  createCannedResponseArgs,
  updateCannedResponseArgs,
  removeCannedResponseArgs,
  searchCannedResponsesArgs,
  applyTemplateArgs,
  MAX_CANNED_TITLE_LENGTH,
  MAX_CANNED_SHORTCUT_LENGTH,
  MAX_CANNED_CONTENT_LENGTH,
} from "./validators";
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";

// ─── list ───────────────────────────────────────────────────────────────────

/**
 * List all canned responses, sorted by usage count (most used first).
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "tickets"))) return null;
    const canManage = await currentUserCan(ctx, "ticket.respond");
    if (!canManage) return null;

    const responses = await ctx.db.query("ticket_cannedResponses").take(500);
    responses.sort((a, b) => b.usageCount - a.usageCount);
    return responses;
  },
});

// ─── listByCategory ─────────────────────────────────────────────────────────

/**
 * List canned responses filtered by category.
 */
export const listByCategory = query({
  args: { category: v.string() },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "tickets"))) return null;
    const canManage = await currentUserCan(ctx, "ticket.respond");
    if (!canManage) return null;

    const responses = await ctx.db
      .query("ticket_cannedResponses")
      .withIndex("by_category", (q) => q.eq("category", args.category))
      .take(500);

    responses.sort((a, b) => b.usageCount - a.usageCount);
    return responses;
  },
});

// ─── getByShortcut ──────────────────────────────────────────────────────────

/**
 * Lookup a canned response by its shortcut string (e.g., "/refund").
 * Used for real-time shortcut matching as the admin types in the reply box.
 */
export const getByShortcut = query({
  args: { shortcut: v.string() },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "tickets"))) return null;
    const canManage = await currentUserCan(ctx, "ticket.respond");
    if (!canManage) return null;

    return await ctx.db
      .query("ticket_cannedResponses")
      .withIndex("by_shortcut", (q) => q.eq("shortcut", args.shortcut))
      .unique();
  },
});

// ─── search ─────────────────────────────────────────────────────────────────

/**
 * Full-text search across canned response title and content.
 * Optionally filtered by category.
 */
export const search = query({
  args: searchCannedResponsesArgs,
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "tickets"))) return null;
    const canManage = await currentUserCan(ctx, "ticket.respond");
    if (!canManage) return null;

    let responses;
    if (args.category) {
      responses = await ctx.db
        .query("ticket_cannedResponses")
        .withIndex("by_category", (q) => q.eq("category", args.category!))
        .take(500);
    } else {
      responses = await ctx.db.query("ticket_cannedResponses").take(500);
    }

    const queryLower = args.query.toLowerCase();
    const matches = responses.filter(
      (r) =>
        r.title.toLowerCase().includes(queryLower) ||
        r.content.toLowerCase().includes(queryLower) ||
        r.shortcut.toLowerCase().includes(queryLower),
    );

    matches.sort((a, b) => b.usageCount - a.usageCount);
    return matches;
  },
});

// ─── applyTemplate ──────────────────────────────────────────────────────────

/**
 * Apply a canned response template to a ticket, substituting {{variables}}.
 * Returns the processed content string (does NOT insert a message).
 * Usage tracking is handled separately by incrementUsage (called on actual send).
 */
export const applyTemplate = mutation({
  args: applyTemplateArgs,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "tickets");
    await requireCan(ctx, "ticket.respond");

    const template = await ctx.db.get("ticket_cannedResponses", args.id);
    if (!template) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Canned response not found",
      });
    }

    const ticket = await ctx.db.get("ticket_tickets", args.ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Ticket not found" });
    }

    // Substitute variables
    let content = template.content;
    content = content.replace(/\{\{userName\}\}/g, ticket.userNameSnapshot);
    content = content.replace(/\{\{ticketNumber\}\}/g, ticket.ticketNumber);
    content = content.replace(/\{\{category\}\}/g, ticket.category);

    return { content };
  },
});

// ─── create ─────────────────────────────────────────────────────────────────

/**
 * Create a new canned response template.
 */
export const create = mutation({
  args: createCannedResponseArgs,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "tickets");
    const user = await requireCan(ctx, "ticket.manageCannedResponses");

    // Validate lengths
    if (args.title.trim().length === 0 || args.title.length > MAX_CANNED_TITLE_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Title must be between 1 and ${MAX_CANNED_TITLE_LENGTH} characters`,
      });
    }
    if (args.shortcut.trim().length === 0 || args.shortcut.length > MAX_CANNED_SHORTCUT_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Shortcut must be between 1 and ${MAX_CANNED_SHORTCUT_LENGTH} characters`,
      });
    }
    if (args.content.trim().length === 0 || args.content.length > MAX_CANNED_CONTENT_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Content must be between 1 and ${MAX_CANNED_CONTENT_LENGTH} characters`,
      });
    }

    // Check shortcut uniqueness
    const existing = await ctx.db
      .query("ticket_cannedResponses")
      .withIndex("by_shortcut", (q) => q.eq("shortcut", args.shortcut.trim()))
      .unique();

    if (existing) {
      throw new ConvexError({
        code: "CONFLICT",
        message: `Shortcut "${args.shortcut}" is already in use`,
      });
    }

    const now = Date.now();
    const id = await ctx.db.insert("ticket_cannedResponses", {
      title: args.title.trim(),
      shortcut: args.shortcut.trim(),
      content: args.content.trim(),
      category: args.category.trim(),
      usageCount: 0,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    return { id };
  },
});

// ─── update ─────────────────────────────────────────────────────────────────

/**
 * Update an existing canned response template.
 */
export const update = mutation({
  args: updateCannedResponseArgs,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "tickets");
    const user = await requireCan(ctx, "ticket.manageCannedResponses");

    const existing = await ctx.db.get("ticket_cannedResponses", args.id);
    if (!existing) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Canned response not found",
      });
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };

    if (args.title !== undefined) {
      if (args.title.trim().length === 0 || args.title.length > MAX_CANNED_TITLE_LENGTH) {
        throw new ConvexError({
          code: "VALIDATION",
          message: `Title must be between 1 and ${MAX_CANNED_TITLE_LENGTH} characters`,
        });
      }
      updates.title = args.title.trim();
    }

    if (args.shortcut !== undefined) {
      if (args.shortcut.trim().length === 0 || args.shortcut.length > MAX_CANNED_SHORTCUT_LENGTH) {
        throw new ConvexError({
          code: "VALIDATION",
          message: `Shortcut must be between 1 and ${MAX_CANNED_SHORTCUT_LENGTH} characters`,
        });
      }
      // Check uniqueness (excluding self)
      const conflict = await ctx.db
        .query("ticket_cannedResponses")
        .withIndex("by_shortcut", (q) => q.eq("shortcut", args.shortcut!.trim()))
        .unique();
      if (conflict && conflict._id !== args.id) {
        throw new ConvexError({
          code: "CONFLICT",
          message: `Shortcut "${args.shortcut}" is already in use`,
        });
      }
      updates.shortcut = args.shortcut.trim();
    }

    if (args.content !== undefined) {
      if (args.content.trim().length === 0 || args.content.length > MAX_CANNED_CONTENT_LENGTH) {
        throw new ConvexError({
          code: "VALIDATION",
          message: `Content must be between 1 and ${MAX_CANNED_CONTENT_LENGTH} characters`,
        });
      }
      updates.content = args.content.trim();
    }

    if (args.category !== undefined) {
      updates.category = args.category.trim();
    }

    await ctx.db.patch("ticket_cannedResponses", args.id, updates);

    return { id: args.id };
  },
});

// ─── remove ─────────────────────────────────────────────────────────────────

/**
 * Delete a canned response template permanently.
 */
export const remove = mutation({
  args: removeCannedResponseArgs,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "tickets");
    const user = await requireCan(ctx, "ticket.manageCannedResponses");

    const existing = await ctx.db.get("ticket_cannedResponses", args.id);
    if (!existing) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Canned response not found",
      });
    }

    await ctx.db.delete("ticket_cannedResponses", args.id);
  },
});

// ─── incrementUsage ─────────────────────────────────────────────────────────

/**
 * Increment the usage count of a canned response.
 * Called separately from applyTemplate when the admin actually sends the reply.
 */
export const incrementUsage = mutation({
  args: { id: v.id("ticket_cannedResponses") },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "tickets");
    await requireCan(ctx, "ticket.respond");

    const response = await ctx.db.get("ticket_cannedResponses", args.id);
    if (!response) return;

    await ctx.db.patch("ticket_cannedResponses", args.id, {
      usageCount: response.usageCount + 1,
    });
  },
});

// ─── getCategories ──────────────────────────────────────────────────────────

/**
 * Get a list of distinct categories used across all canned responses.
 */
export const getCategories = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "tickets"))) return null;
    const canManage = await currentUserCan(ctx, "ticket.respond");
    if (!canManage) return null;

    const responses = await ctx.db.query("ticket_cannedResponses").take(500);
    const categories = [...new Set(responses.map((r) => r.category))];
    categories.sort();
    return categories;
  },
});
