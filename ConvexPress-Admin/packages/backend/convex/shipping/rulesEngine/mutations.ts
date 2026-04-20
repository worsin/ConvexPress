import { ConvexError, v } from "convex/values";

import { mutation } from "../../_generated/server";
import { requireCan } from "../../helpers/permissions";
import { emitEvent } from "../../helpers/events";
import { SHIPPING_EVENTS } from "../../events/constants";
import { validateRuleAST } from "./validator";

const RULE_SCHEMA_VERSION = 1;

export const createRule = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    ruleAST: v.any(),
  },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "shipping.rules.manage");
    const errors = validateRuleAST(args.ruleAST);
    if (errors.length > 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Invalid rule AST: ${errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`,
      });
    }
    const now = Date.now();
    const ruleId = await ctx.db.insert("commerce_shipping_rules", {
      name: args.name,
      description: args.description,
      ruleAST: args.ruleAST,
      schemaVersion: RULE_SCHEMA_VERSION,
      createdAt: now,
      createdBy: user?._id,
      updatedAt: now,
      updatedBy: user?._id,
    });
    await emitEvent(ctx, SHIPPING_EVENTS.RULE_CREATED, "shipping", {
      ruleId,
      name: args.name,
    });
    return ruleId;
  },
});

export const updateRule = mutation({
  args: {
    ruleId: v.id("commerce_shipping_rules"),
    patch: v.object({
      name: v.optional(v.string()),
      description: v.optional(v.string()),
      ruleAST: v.optional(v.any()),
    }),
  },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "shipping.rules.manage");
    const existing = await ctx.db.get(args.ruleId);
    if (!existing) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Rule not found." });
    }
    if (args.patch.ruleAST !== undefined) {
      const errors = validateRuleAST(args.patch.ruleAST);
      if (errors.length > 0) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Invalid rule AST: ${errors.map((e) => e.message).join("; ")}`,
        });
      }
    }
    const patch: Record<string, unknown> = {
      updatedAt: Date.now(),
      updatedBy: user?._id,
    };
    if (args.patch.name !== undefined) patch.name = args.patch.name;
    if (args.patch.description !== undefined) patch.description = args.patch.description;
    if (args.patch.ruleAST !== undefined) patch.ruleAST = args.patch.ruleAST;
    await ctx.db.patch(args.ruleId, patch);
    await emitEvent(ctx, SHIPPING_EVENTS.RULE_UPDATED, "shipping", {
      ruleId: args.ruleId,
    });
    return args.ruleId;
  },
});

export const deleteRule = mutation({
  args: { ruleId: v.id("commerce_shipping_rules") },
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.rules.manage");

    // Guard: every B1-B9 method table may reference this rule via `ruleId`.
    // Refuse delete when any method still depends on it so admins don't
    // silently break rate calculation.
    const methodTables = [
      "commerce_shipping_method_flat_rate",
      "commerce_shipping_method_weight_based",
      "commerce_shipping_method_dimensional",
      "commerce_shipping_method_price_based",
      "commerce_shipping_method_quantity_based",
      "commerce_shipping_method_free",
      "commerce_shipping_method_local_pickup",
      "commerce_shipping_method_local_delivery",
      "commerce_shipping_method_table_rate",
    ] as const;
    const refs: Array<{ table: string; methodId: string; name?: string }> = [];
    for (const table of methodTables) {
      const rows = await ctx.db.query(table as any).collect();
      for (const row of rows as any[]) {
        if (row.ruleId === args.ruleId) {
          refs.push({ table, methodId: String(row._id), name: row.name });
        }
      }
    }
    if (refs.length > 0) {
      throw new ConvexError({
        code: "RULE_IN_USE",
        message: `Rule is referenced by ${refs.length} method(s). Detach the rule from each method before deleting.`,
        references: refs,
      });
    }

    await ctx.db.delete(args.ruleId);
    await emitEvent(ctx, SHIPPING_EVENTS.RULE_DELETED, "shipping", {
      ruleId: args.ruleId,
    });
    return { deleted: true };
  },
});
