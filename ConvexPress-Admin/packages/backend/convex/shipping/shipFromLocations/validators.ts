import { v } from "convex/values";

export const locationTypeValidator = v.union(
  v.literal("warehouse"),
  v.literal("retail_store"),
  v.literal("dropshipper"),
  v.literal("fulfillment_center"),
  v.literal("other"),
);

export const locationAddressValidator = v.object({
  contactName: v.string(),
  companyName: v.optional(v.string()),
  line1: v.string(),
  line2: v.optional(v.string()),
  city: v.string(),
  state: v.string(),
  postalCode: v.string(),
  countryCode: v.string(),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
});

export const createLocationArgs = {
  name: v.string(),
  code: v.string(),
  locationType: locationTypeValidator,
  address: locationAddressValidator,
  isActive: v.optional(v.boolean()),
  isDefault: v.optional(v.boolean()),
  isPickupEnabled: v.optional(v.boolean()),
  timezone: v.string(),
  cutoffTime: v.optional(v.string()),
  operatingDays: v.optional(v.array(v.number())),
  operatingHours: v.optional(
    v.object({ open: v.string(), close: v.string() }),
  ),
  handlingTimeDays: v.optional(v.number()),
  priority: v.optional(v.number()),
};

export const updateLocationArgs = {
  locationId: v.id("commerce_ship_from_locations"),
  patch: v.object({
    name: v.optional(v.string()),
    code: v.optional(v.string()),
    locationType: v.optional(locationTypeValidator),
    address: v.optional(locationAddressValidator),
    isActive: v.optional(v.boolean()),
    isPickupEnabled: v.optional(v.boolean()),
    timezone: v.optional(v.string()),
    cutoffTime: v.optional(v.string()),
    operatingDays: v.optional(v.array(v.number())),
    operatingHours: v.optional(
      v.object({ open: v.string(), close: v.string() }),
    ),
    handlingTimeDays: v.optional(v.number()),
    priority: v.optional(v.number()),
  }),
};

export const archiveLocationArgs = {
  locationId: v.id("commerce_ship_from_locations"),
};

export const setDefaultLocationArgs = {
  locationId: v.id("commerce_ship_from_locations"),
};

export const assignProductLocationArgs = {
  productId: v.id("commerce_products"),
  variantId: v.optional(v.id("commerce_product_variants")),
  locationId: v.id("commerce_ship_from_locations"),
  priority: v.optional(v.number()),
  enabled: v.optional(v.boolean()),
  notes: v.optional(v.string()),
};

export const removeProductLocationArgs = {
  mappingId: v.id("commerce_product_location_fulfillment"),
};
