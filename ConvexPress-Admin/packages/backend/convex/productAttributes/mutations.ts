import { ConvexError, v } from "convex/values";
import { mutation, internalMutation } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { requirePluginEnabled } from "../helpers/plugins";

// Slug generation helper
function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 28);
}

// --- Admin-facing mutations ---

export const createAttribute = mutation({
  args: {
    name: v.string(),
    label: v.string(),
    slug: v.optional(v.string()),
    type: v.optional(v.union(v.literal("select"), v.literal("text"))),
    orderBy: v.optional(v.union(v.literal("menu_order"), v.literal("name"), v.literal("name_num"), v.literal("id"))),
    hasArchives: v.optional(v.boolean()),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "customFields");
    await requireCan(ctx, "manage_options");
    const slug = slugify(args.slug || args.name);
    if (slug.length === 0) throw new ConvexError({ code: "validation_error", message: "Attribute name is required." });
    if (slug.length > 28) throw new ConvexError({ code: "validation_error", message: "Attribute slug must be 28 characters or less." });

    const existing = await ctx.db.query("commerce_product_attributes").withIndex("by_slug", (q: any) => q.eq("slug", slug)).unique();
    if (existing) throw new ConvexError({ code: "duplicate", message: `Attribute "${slug}" already exists.` });

    const now = Date.now();
    return ctx.db.insert("commerce_product_attributes", {
      name: slug,
      label: args.label.trim(),
      slug,
      type: args.type ?? "select",
      orderBy: args.orderBy ?? "menu_order",
      hasArchives: args.hasArchives ?? false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateAttribute = mutation({
  args: {
    attributeId: v.id("commerce_product_attributes"),
    label: v.optional(v.string()),
    type: v.optional(v.union(v.literal("select"), v.literal("text"))),
    orderBy: v.optional(v.union(v.literal("menu_order"), v.literal("name"), v.literal("name_num"), v.literal("id"))),
    hasArchives: v.optional(v.boolean()),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "customFields");
    await requireCan(ctx, "manage_options");
    const attr = await ctx.db.get(args.attributeId);
    if (!attr) throw new ConvexError({ code: "not_found", message: "Attribute not found." });

    const patch: any = { updatedAt: Date.now() };
    if (args.label !== undefined) patch.label = args.label.trim();
    if (args.type !== undefined) patch.type = args.type;
    if (args.orderBy !== undefined) patch.orderBy = args.orderBy;
    if (args.hasArchives !== undefined) patch.hasArchives = args.hasArchives;

    await ctx.db.patch(args.attributeId, patch);
    return args.attributeId;
  },
});

export const deleteAttribute = mutation({
  args: { attributeId: v.id("commerce_product_attributes") },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "customFields");
    await requireCan(ctx, "manage_options");
    const attr = await ctx.db.get(args.attributeId);
    if (!attr) throw new ConvexError({ code: "not_found", message: "Attribute not found." });

    // Cascade delete all terms
    const terms = await ctx.db.query("commerce_product_attribute_terms").withIndex("by_attribute", (q: any) => q.eq("attributeId", args.attributeId)).collect();
    for (const term of terms) {
      await ctx.db.delete(term._id);
    }

    await ctx.db.delete(args.attributeId);
    return { success: true };
  },
});

export const createTerm = mutation({
  args: {
    attributeId: v.id("commerce_product_attributes"),
    name: v.string(),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    menuOrder: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "customFields");
    await requireCan(ctx, "manage_options");
    const attr = await ctx.db.get(args.attributeId);
    if (!attr) throw new ConvexError({ code: "not_found", message: "Attribute not found." });

    const slug = slugify(args.slug || args.name);
    const existing = await ctx.db.query("commerce_product_attribute_terms").withIndex("by_attribute_slug", (q: any) => q.eq("attributeId", args.attributeId).eq("slug", slug)).unique();
    if (existing) throw new ConvexError({ code: "duplicate", message: `Term "${slug}" already exists in this attribute.` });

    const terms = await ctx.db.query("commerce_product_attribute_terms").withIndex("by_attribute", (q: any) => q.eq("attributeId", args.attributeId)).collect();
    const now = Date.now();
    return ctx.db.insert("commerce_product_attribute_terms", {
      attributeId: args.attributeId,
      name: args.name.trim(),
      slug,
      description: args.description?.trim(),
      menuOrder: args.menuOrder ?? terms.length,
      productCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateTerm = mutation({
  args: {
    termId: v.id("commerce_product_attribute_terms"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    menuOrder: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "customFields");
    await requireCan(ctx, "manage_options");
    const term = await ctx.db.get(args.termId);
    if (!term) throw new ConvexError({ code: "not_found", message: "Term not found." });

    const patch: any = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.slug !== undefined) patch.slug = slugify(args.slug);
    if (args.description !== undefined) patch.description = args.description?.trim();
    if (args.menuOrder !== undefined) patch.menuOrder = args.menuOrder;

    await ctx.db.patch(args.termId, patch);
    return args.termId;
  },
});

export const deleteTerm = mutation({
  args: { termId: v.id("commerce_product_attribute_terms") },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "customFields");
    await requireCan(ctx, "manage_options");
    const term = await ctx.db.get(args.termId);
    if (!term) throw new ConvexError({ code: "not_found", message: "Term not found." });
    await ctx.db.delete(args.termId);
    return { success: true };
  },
});

export const reorderTerms = mutation({
  args: {
    attributeId: v.id("commerce_product_attributes"),
    termIds: v.array(v.id("commerce_product_attribute_terms")),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "customFields");
    await requireCan(ctx, "manage_options");
    const now = Date.now();
    for (let i = 0; i < args.termIds.length; i++) {
      await ctx.db.patch(args.termIds[i], { menuOrder: i, updatedAt: now });
    }
    return { success: true };
  },
});

// --- Internal mutations for sync ---

export const upsertAttribute = internalMutation({
  args: {
    slug: v.string(),
    label: v.string(),
    type: v.optional(v.string()),
    orderBy: v.optional(v.string()),
    hasArchives: v.optional(v.boolean()),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "customFields");
    const now = Date.now();
    const existing = await ctx.db.query("commerce_product_attributes").withIndex("by_slug", (q: any) => q.eq("slug", args.slug)).unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        label: args.label,
        type: args.type ?? existing.type,
        orderBy: args.orderBy ?? existing.orderBy,
        hasArchives: args.hasArchives ?? existing.hasArchives,
        updatedAt: now,
      });
      return existing._id;
    }

    return ctx.db.insert("commerce_product_attributes", {
      name: args.slug,
      label: args.label,
      slug: args.slug,
      type: (args.type as any) ?? "select",
      orderBy: (args.orderBy as any) ?? "menu_order",
      hasArchives: args.hasArchives ?? false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const upsertTerm = internalMutation({
  args: {
    attributeId: v.id("commerce_product_attributes"),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    menuOrder: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "customFields");
    const now = Date.now();
    const existing = await ctx.db.query("commerce_product_attribute_terms").withIndex("by_attribute_slug", (q: any) => q.eq("attributeId", args.attributeId).eq("slug", args.slug)).unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        description: args.description,
        menuOrder: args.menuOrder ?? existing.menuOrder,
        updatedAt: now,
      });
      return existing._id;
    }

    return ctx.db.insert("commerce_product_attribute_terms", {
      attributeId: args.attributeId,
      name: args.name,
      slug: args.slug,
      description: args.description,
      menuOrder: args.menuOrder ?? 0,
      productCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});
