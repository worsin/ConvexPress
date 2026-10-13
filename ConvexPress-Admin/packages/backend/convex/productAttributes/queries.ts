import { v } from "convex/values";
import { query } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { isPluginEnabled } from "../helpers/plugins";

import { productAttributesDocs } from "../schema/productAttributes.docs.generated";
type AttributeTerm = Doc<"commerce_product_attribute_terms">;

/** Sorts terms in place by the attribute's configured order. */
function sortTerms(terms: AttributeTerm[], orderBy: Doc<"commerce_product_attributes">["orderBy"]): AttributeTerm[] {
  if (orderBy === "menu_order") return terms.sort((a, b) => a.menuOrder - b.menuOrder);
  if (orderBy === "name") return terms.sort((a, b) => a.name.localeCompare(b.name));
  if (orderBy === "name_num") return terms.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return terms.sort((a, b) => a._creationTime - b._creationTime);
}

export const listAttributes = query({
  args: {},
  returns: v.union(v.null(), v.array(productAttributesDocs.commerce_product_attributes)),
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "customFields"))) return null;
    const attributes = await ctx.db.query("commerce_product_attributes").collect();
    return attributes.sort((a, b) => a.label.localeCompare(b.label));
  },
});

export const getAttribute = query({
  args: { attributeId: v.id("commerce_product_attributes") },
  returns: v.union(v.null(), v.object({
    terms: v.array(productAttributesDocs.commerce_product_attribute_terms),
    _id: v.id("commerce_product_attributes"),
    _creationTime: v.number(),
    type: v.union(v.literal("text"), v.literal("select")),
    name: v.string(),
    updatedAt: v.number(),
    createdAt: v.number(),
    label: v.string(),
    slug: v.string(),
    orderBy: v.union(v.literal("id"), v.literal("name"), v.literal("menu_order"), v.literal("name_num")),
    hasArchives: v.boolean(),
  })),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "customFields"))) return null;
    const attribute = await ctx.db.get("commerce_product_attributes", args.attributeId);
    if (!attribute) return null;

    const terms = await ctx.db.query("commerce_product_attribute_terms")
      .withIndex("by_attribute", (q) => q.eq("attributeId", args.attributeId))
      .collect();

    // Sort terms by the attribute's orderBy setting
    return { ...attribute, terms: sortTerms(terms, attribute.orderBy) };
  },
});

export const listTerms = query({
  args: { attributeId: v.id("commerce_product_attributes") },
  returns: v.union(v.null(), v.array(productAttributesDocs.commerce_product_attribute_terms)),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "customFields"))) return null;
    const attribute = await ctx.db.get("commerce_product_attributes", args.attributeId);
    if (!attribute) return [];

    const terms = await ctx.db.query("commerce_product_attribute_terms")
      .withIndex("by_attribute", (q) => q.eq("attributeId", args.attributeId))
      .collect();

    return sortTerms(terms, attribute.orderBy);
  },
});
