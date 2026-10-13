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

import { ConvexError, v, type Infer } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireCan } from "../helpers/permissions";
import {
  productRelationSourceValidator,
  productRelationTypeValidator,
} from "../schema/commerceAssistant";
import { requireCommerceEnabled } from "./helpers";
import { patchDynamicWithMediaReferences, deleteDynamicWithMediaReferences } from "../media/attachmentGuard";


import { commerceAssistantDocs } from "../schema/commerceAssistant.docs.generated";
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

type RelationSource = Infer<typeof productRelationSourceValidator>;

async function upsertRelation(
  ctx: Pick<MutationCtx, "db">,
  input: {
    fromProductId: Id<"commerce_products">;
    toProductId: Id<"commerce_products">;
    type: RelationType;
    weight?: number;
    source: RelationSource;
    evidence?: string;
    status?: "active" | "rejected";
  },
): Promise<Id<"commerce_product_relations">> {
  if (String(input.fromProductId) === String(input.toProductId)) {
    throw new ConvexError({ code: "VALIDATION_ERROR", message: "A product cannot relate to itself." });
  }
  const now = Date.now();
  const existing = await ctx.db
    .query("commerce_product_relations")
    .withIndex("by_pair", (q) =>
      q.eq("fromProductId", input.fromProductId).eq("toProductId", input.toProductId).eq("type", input.type),
    )
    .unique();
  if (existing) {
    await patchDynamicWithMediaReferences(ctx, existing._id, {
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
  returns: v.object({
    outgoing: v.array(v.object({
      from: v.union(v.null(), v.object({ title: v.string(), slug: v.string() })),
      to: v.union(v.null(), v.object({ title: v.string(), slug: v.string() })),
      _id: v.id("commerce_product_relations"),
      _creationTime: v.number(),
      evidence: v.optional(v.string()),
      type: v.union(v.literal("accessory_of"), v.literal("compatible_with"), v.literal("consumable_for"), v.literal("maintenance_for"), v.literal("upgrade_of"), v.literal("replacement_for"), v.literal("bundle_with"), v.literal("similar_to")),
      updatedAt: v.number(),
      createdAt: v.number(),
      status: v.union(v.literal("active"), v.literal("rejected")),
      source: v.union(v.literal("manual"), v.literal("woo_upsell"), v.literal("woo_crosssell"), v.literal("ai_inferred"), v.literal("co_purchase"), v.literal("seed")),
      weight: v.number(),
      fromProductId: v.id("commerce_products"),
      toProductId: v.id("commerce_products"),
    })),
    incoming: v.array(v.object({
      from: v.union(v.null(), v.object({ title: v.string(), slug: v.string() })),
      to: v.union(v.null(), v.object({ title: v.string(), slug: v.string() })),
      _id: v.id("commerce_product_relations"),
      _creationTime: v.number(),
      evidence: v.optional(v.string()),
      type: v.union(v.literal("accessory_of"), v.literal("compatible_with"), v.literal("consumable_for"), v.literal("maintenance_for"), v.literal("upgrade_of"), v.literal("replacement_for"), v.literal("bundle_with"), v.literal("similar_to")),
      updatedAt: v.number(),
      createdAt: v.number(),
      status: v.union(v.literal("active"), v.literal("rejected")),
      source: v.union(v.literal("manual"), v.literal("woo_upsell"), v.literal("woo_crosssell"), v.literal("ai_inferred"), v.literal("co_purchase"), v.literal("seed")),
      weight: v.number(),
      fromProductId: v.id("commerce_products"),
      toProductId: v.id("commerce_products"),
    })),
  }),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");
    const [outgoing, incoming] = await Promise.all([
      ctx.db
        .query("commerce_product_relations")
        .withIndex("by_from", (q) => q.eq("fromProductId", args.productId))
        .collect(),
      ctx.db
        .query("commerce_product_relations")
        .withIndex("by_to", (q) => q.eq("toProductId", args.productId))
        .collect(),
    ]);
    const ids = new Map<string, Id<"commerce_products">>();
    for (const edge of [...outgoing, ...incoming]) {
      ids.set(String(edge.fromProductId), edge.fromProductId);
      ids.set(String(edge.toProductId), edge.toProductId);
    }
    const products = await Promise.all([...ids.values()].map((id) => ctx.db.get(id)));
    const titles = new Map(
      products.flatMap((p) => (p ? [[String(p._id), { title: p.title, slug: p.slug }] as const] : [])),
    );
    const decorate = (edge: Doc<"commerce_product_relations">) => ({
      ...edge,
      from: titles.get(String(edge.fromProductId)) ?? null,
      to: titles.get(String(edge.toProductId)) ?? null,
    });
    return { outgoing: outgoing.map(decorate), incoming: incoming.map(decorate) };
  },
});

export const listPending = query({
  args: {},
  returns: v.array(commerceAssistantDocs.commerce_product_relations),
  handler: async (ctx) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");
    const edges = await ctx.db
      .query("commerce_product_relations")
      .withIndex("by_status", (q) => q.eq("status", "rejected"))
      .take(200);
    return edges;
  },
});

export const upsert = mutation({
  args: upsertArgs,
  returns: v.id("commerce_product_relations"),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");
    return await upsertRelation(ctx, { ...args, source: "manual" });
  },
});

export const setStatus = mutation({
  args: setStatusArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");
    await patchDynamicWithMediaReferences(ctx, args.relationId, { status: args.status, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: relationIdArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");
    await deleteDynamicWithMediaReferences(ctx, args.relationId);
  },
});

// ─── Internal (seeders, sync, inference) ─────────────────────────────────────

export const upsertInternal = internalMutation({
  args: upsertInternalArgs,
  returns: v.id("commerce_product_relations"),
  handler: async (ctx, args) => upsertRelation(ctx, args),
});

/**
 * Seed edges from WooCommerce upsell / cross-sell ids already on products.
 * Upsells become "upgrade_of"; cross-sells become "accessory_of".
 */
export const seedFromWoo = internalMutation({
  args: {},
  returns: v.object({ created: v.number() }),
  handler: async (ctx) => {
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
