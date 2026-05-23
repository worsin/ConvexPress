// @ts-nocheck
import { v } from "convex/values";
import { query } from "../_generated/server";
import { isPluginEnabled } from "../helpers/plugins";

export const listAttributes = query({
  args: {},
  handler: async (ctx: any) => {
    if (!(await isPluginEnabled(ctx, "customFields"))) return null;
    const attributes = await ctx.db.query("commerce_product_attributes").collect();
    return attributes.sort((a: any, b: any) => a.label.localeCompare(b.label));
  },
});

export const getAttribute = query({
  args: { attributeId: v.id("commerce_product_attributes") },
  handler: async (ctx: any, args: any) => {
    if (!(await isPluginEnabled(ctx, "customFields"))) return null;
    const attribute = await ctx.db.get(args.attributeId);
    if (!attribute) return null;

    const terms = await ctx.db.query("commerce_product_attribute_terms")
      .withIndex("by_attribute", (q: any) => q.eq("attributeId", args.attributeId))
      .collect();

    // Sort terms by the attribute's orderBy setting
    if (attribute.orderBy === "menu_order") {
      terms.sort((a: any, b: any) => a.menuOrder - b.menuOrder);
    } else if (attribute.orderBy === "name") {
      terms.sort((a: any, b: any) => a.name.localeCompare(b.name));
    } else if (attribute.orderBy === "name_num") {
      terms.sort((a: any, b: any) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    } else {
      terms.sort((a: any, b: any) => a._creationTime - b._creationTime);
    }

    return { ...attribute, terms };
  },
});

export const listTerms = query({
  args: { attributeId: v.id("commerce_product_attributes") },
  handler: async (ctx: any, args: any) => {
    if (!(await isPluginEnabled(ctx, "customFields"))) return null;
    const attribute = await ctx.db.get(args.attributeId);
    if (!attribute) return [];

    const terms = await ctx.db.query("commerce_product_attribute_terms")
      .withIndex("by_attribute", (q: any) => q.eq("attributeId", args.attributeId))
      .collect();

    if (attribute.orderBy === "menu_order") {
      terms.sort((a: any, b: any) => a.menuOrder - b.menuOrder);
    } else if (attribute.orderBy === "name") {
      terms.sort((a: any, b: any) => a.name.localeCompare(b.name));
    } else if (attribute.orderBy === "name_num") {
      terms.sort((a: any, b: any) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    } else {
      terms.sort((a: any, b: any) => a._creationTime - b._creationTime);
    }

    return terms;
  },
});
