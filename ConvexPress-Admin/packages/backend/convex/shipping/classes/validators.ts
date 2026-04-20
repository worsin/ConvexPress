import { v } from "convex/values";

export const createShippingClassArgs = {
  name: v.string(),
  slug: v.optional(v.string()),
  description: v.optional(v.string()),
  sortOrder: v.optional(v.number()),
};

export const updateShippingClassArgs = {
  classId: v.id("commerce_shipping_classes"),
  patch: v.object({
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  }),
};

export const deleteShippingClassArgs = {
  classId: v.id("commerce_shipping_classes"),
  // Optional: reassign affected products/variants to another class (null clears them).
  reassignTo: v.optional(v.union(v.id("commerce_shipping_classes"), v.null())),
};

export const reorderShippingClassesArgs = {
  orderedIds: v.array(v.id("commerce_shipping_classes")),
};

export const assignClassToProductArgs = {
  productId: v.id("commerce_products"),
  classId: v.union(v.id("commerce_shipping_classes"), v.null()),
};

export const assignClassToVariantArgs = {
  variantId: v.id("commerce_product_variants"),
  classId: v.union(
    v.id("commerce_shipping_classes"),
    v.literal("inherit"),
    v.null(),
  ),
};

export const bulkAssignClassArgs = {
  productIds: v.array(v.id("commerce_products")),
  classId: v.union(v.id("commerce_shipping_classes"), v.null()),
};
