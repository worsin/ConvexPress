import { v } from "convex/values";

export const packageSourceValidator = v.union(
  v.literal("custom"),
  v.literal("shipstation"),
  v.literal("ups"),
  v.literal("usps"),
  v.literal("fedex"),
  v.literal("dhl"),
);

export const dimensionUnitValidator = v.union(v.literal("in"), v.literal("cm"));
export const weightUnitValidator = v.union(
  v.literal("oz"),
  v.literal("lb"),
  v.literal("g"),
  v.literal("kg"),
);

export const dimensionsValidator = v.object({
  length: v.number(),
  width: v.number(),
  height: v.number(),
});

export const createShippingPackageArgs = {
  code: v.string(),
  label: v.string(),
  packageType: v.string(),
  packageSource: v.optional(packageSourceValidator),
  carrierPackageCode: v.optional(v.string()),
  shipFromLocationId: v.optional(v.id("commerce_ship_from_locations")),
  isDefault: v.optional(v.boolean()),
  dimensionUnit: v.optional(dimensionUnitValidator),
  weightUnit: v.optional(weightUnitValidator),
  dimensions: v.optional(dimensionsValidator),
  innerDimensions: v.optional(dimensionsValidator),
  tareWeight: v.optional(v.number()),
  maxLoadWeight: v.optional(v.number()),
  shipStationPackageId: v.optional(v.string()),
  shipStationCarrierCode: v.optional(v.string()),
  carrierCode: v.optional(v.string()),
  notes: v.optional(v.string()),
  sortOrder: v.optional(v.number()),
};

export const updateShippingPackageArgs = {
  packageId: v.id("commerce_shipping_packages"),
  patch: v.object({
    code: v.optional(v.string()),
    label: v.optional(v.string()),
    packageType: v.optional(v.string()),
    dimensions: v.optional(dimensionsValidator),
    innerDimensions: v.optional(dimensionsValidator),
    tareWeight: v.optional(v.number()),
    maxLoadWeight: v.optional(v.number()),
    dimensionUnit: v.optional(dimensionUnitValidator),
    weightUnit: v.optional(weightUnitValidator),
    isDefault: v.optional(v.boolean()),
    shipFromLocationId: v.optional(v.id("commerce_ship_from_locations")),
    notes: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    isArchived: v.optional(v.boolean()),
  }),
};

export const deleteShippingPackageArgs = {
  packageId: v.id("commerce_shipping_packages"),
};

export const setDefaultPackageArgs = {
  packageId: v.id("commerce_shipping_packages"),
  shipFromLocationId: v.optional(v.id("commerce_ship_from_locations")),
};
