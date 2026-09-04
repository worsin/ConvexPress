// @ts-nocheck
// TS2589: the generated commerce schema union exceeds TypeScript's instantiation depth
// inside Convex's typecheck; handlers are annotated `any` like the rest of convex/commerce.
/**
 * Product relation graph.
 *
 * Typed, weighted edges between products ("tamper is an accessory of this
 * machine", "these beans are a consumable for that grinder"). The storefront
 * assistant grounds its recommendations in these edges instead of guessing.
 *
 * Sources: manual admin edits, WooCommerce upsell/cross-sell ids, seeds,
 * co-purchase statistics, and AI inference (which lands as "active" only
 * after an admin approves it).
 */

import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import {
  productRelationSourceValidator,
  productRelationTypeValidator,
} from "../schema/commerceAssistant";
import { requireCommerceEnabled } from "./helpers";

export type RelationType =
  | "accessory_of"
  | "compatible_with"
  | "consumable_for"
  | "maintenance_for"
  | "upgrade_of"
  | "replacement_for"
  | "bundle_with"
  | "similar_to";

/** Group a relation belongs to in the rail ("Complete your setup"). */
export const RELATION_GROUP: Record<RelationType, "accessory" | "consumable" | "maintenance" | "upgrade" | "similar"> = {
  accessory_of: "accessory",
  compatible_with: "accessory",
  bundle_with: "accessory",
  consumable_for: "consumable",
  maintenance_for: "maintenance",
  upgrade_of: "upgrade",
  replacement_for: "upgrade",
  similar_to: "similar",
};

export const RELATION_GROUP_LABEL: Record<string, string> = {
  accessory: "Goes with it",
  consumable: "Keep it stocked",
  maintenance: "Keep it running",
  upgrade: "Step up",
  similar: "Similar picks",
};

// Validators are hoisted out of the function registrations; inline v.id()
// unions on the large commerce schema trip TS2589 in Convex's typecheck.
const productIdArgs = { productId: v.id("commerce_products") };
const relationStatusValidator = v.union(v.literal("active"), v.literal("rejected"));
const upsertArgs = {
  fromProductId: v.id("commerce_products"),
  toProductId: v.id("commerce_products"),
  type: productRelationTypeValidator,
  weight: v.optional(v.number()),
  evidence: v.optional(v.string()),
  status: v.optional(relationStatusValidator),
};
const setStatusArgs = {
  relationId: v.id("commerce_product_relations"),
  status: relationStatusValidator,
};
const relationIdArgs = { relationId: v.id("commerce_product_relations") };
const upsertInternalArgs = {
  fromProductId: v.id("commerce_products"),
  toProductId: v.id("commerce_products"),
  type: productRelationTypeValidator,
  weight: v.optional(v.number()),
  source: productRelationSourceValidator,
  evidence: v.optional(v.string()),
  status: v.optional(relationStatusValidator),
};

function clampWeight(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0.6;
  return Math.min(1, Math.max(0, value));
}

async function upsertRelation(
  ctx: any,
  input: {
    fromProductId: any;
    toProductId: any;
    type: RelationType;
    weight?: number;
    source: string;
    evidence?: string;
    status?: "active" | "rejected";
  },
) {
  if (String(input.fromProductId) === String(input.toProductId)) {
    throw new ConvexError({ code: "VALIDATION_ERROR", message: "A product cannot relate to itself." });
  }
  const now = Date.now();
  const existing = await ctx.db
    .query("commerce_product_relations")
    .withIndex("by_pair", (q: any) =>
      q.eq("fromProductId", input.fromProductId).eq("toProductId", input.toProductId).eq("type", input.type),
    )
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, {
      weight: clampWeight(input.weight ?? existing.weight),
      source: input.source,
      evidence: input.evidence ?? existing.evidence,
      status: input.status ?? existing.status,
      updatedAt: now,
    });
    return existing._id;
  }
  return await ctx.db.insert("commerce_product_relations", {
    fromProductId: input.fromProductId,
    toProductId: input.toProductId,
    type: input.type,
    weight: clampWeight(input.weight),
    source: input.source,
    evidence: input.evidence,
    status: input.status ?? "active",
    createdAt: now,
    updatedAt: now,
  });
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export const listForProduct = query({
  args: productIdArgs,
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");
    const [outgoing, incoming] = await Promise.all([
      ctx.db
        .query("commerce_product_relations")
        .withIndex("by_from", (q: any) => q.eq("fromProductId", args.productId))
        .collect(),
      ctx.db
        .query("commerce_product_relations")
        .withIndex("by_to", (q: any) => q.eq("toProductId", args.productId))
        .collect(),
    ]);
    const ids = new Set<string>();
    for (const edge of [...outgoing, ...incoming]) {
      ids.add(String(edge.fromProductId));
      ids.add(String(edge.toProductId));
    }
    const products = await Promise.all([...ids].map((id) => ctx.db.get(id as any)));
    const titles = new Map(products.filter(Boolean).map((p: any) => [String(p._id), { title: p.title, slug: p.slug }]));
    const decorate = (edge: any) => ({
      ...edge,
      from: titles.get(String(edge.fromProductId)) ?? null,
      to: titles.get(String(edge.toProductId)) ?? null,
    });
    return { outgoing: outgoing.map(decorate), incoming: incoming.map(decorate) };
  },
});

export const listPending = query({
  args: {},
  handler: async (ctx: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");
    const edges = await ctx.db
      .query("commerce_product_relations")
      .withIndex("by_status", (q: any) => q.eq("status", "rejected"))
      .take(200);
    return edges;
  },
});

export const upsert = mutation({
  args: upsertArgs,
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");
    return await upsertRelation(ctx, { ...args, source: "manual" });
  },
});

export const setStatus = mutation({
  args: setStatusArgs,
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");
    await ctx.db.patch(args.relationId, { status: args.status, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: relationIdArgs,
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");
    await ctx.db.delete(args.relationId);
  },
});

// ─── Internal (seeders, sync, inference) ─────────────────────────────────────

export const upsertInternal = internalMutation({
  args: upsertInternalArgs,
  handler: async (ctx: any, args: any) => upsertRelation(ctx, args),
});

/**
 * Seed edges from WooCommerce upsell / cross-sell ids already on products.
 * Upsells become "upgrade_of"; cross-sells become "accessory_of".
 */
export const seedFromWoo = internalMutation({
  args: {},
  handler: async (ctx: any) => {
    const products = await ctx.db.query("commerce_products").take(5000);
    let created = 0;
    for (const product of products) {
      for (const targetId of product.upsellProductIds ?? []) {
        await upsertRelation(ctx, {
          fromProductId: product._id,
          toProductId: targetId,
          type: "upgrade_of",
          weight: 0.7,
          source: "woo_upsell",
        });
        created += 1;
      }
      for (const targetId of product.crossSellProductIds ?? []) {
        await upsertRelation(ctx, {
          fromProductId: product._id,
          toProductId: targetId,
          type: "accessory_of",
          weight: 0.7,
          source: "woo_crosssell",
        });
        created += 1;
      }
    }
    return { created };
  },
});
