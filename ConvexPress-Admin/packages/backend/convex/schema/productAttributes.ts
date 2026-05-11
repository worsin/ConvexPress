import { defineTable } from "convex/server";
import { v } from "convex/values";

export const productAttributesTables = {
  commerce_product_attributes: defineTable({
    name: v.string(),
    label: v.string(),
    slug: v.string(),
    type: v.union(v.literal("select"), v.literal("text")),
    orderBy: v.union(
      v.literal("menu_order"),
      v.literal("name"),
      v.literal("name_num"),
      v.literal("id"),
    ),
    hasArchives: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_name", ["name"]),

  commerce_product_attribute_terms: defineTable({
    attributeId: v.id("commerce_product_attributes"),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    menuOrder: v.number(),
    productCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_attribute", ["attributeId"])
    .index("by_attribute_slug", ["attributeId", "slug"])
    .index("by_attribute_order", ["attributeId", "menuOrder"]),
};
