import { v } from "convex/values";

export const zoneCountryCodeValidator = v.string();
export const zoneStateCodeValidator = v.string();
export const zonePostcodeRuleValidator = v.string();

export const createZoneArgs = {
  name: v.string(),
  slug: v.optional(v.string()),
  description: v.optional(v.string()),
  countries: v.array(zoneCountryCodeValidator),
  states: v.optional(v.array(zoneStateCodeValidator)),
  postalCodeRules: v.optional(v.array(zonePostcodeRuleValidator)),
  enabled: v.optional(v.boolean()),
  isFallback: v.optional(v.boolean()),
  sortOrder: v.optional(v.number()),
};

export const updateZoneArgs = {
  zoneId: v.id("commerce_shipping_zones"),
  patch: v.object({
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    countries: v.optional(v.array(zoneCountryCodeValidator)),
    states: v.optional(v.array(zoneStateCodeValidator)),
    postalCodeRules: v.optional(v.array(zonePostcodeRuleValidator)),
    enabled: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
  }),
};

export const reorderZonesArgs = {
  orderedIds: v.array(v.id("commerce_shipping_zones")),
};

export const deleteZoneArgs = {
  zoneId: v.id("commerce_shipping_zones"),
};

export const setFallbackZoneArgs = {
  zoneId: v.union(v.id("commerce_shipping_zones"), v.null()),
};

export const toggleZoneEnabledArgs = {
  zoneId: v.id("commerce_shipping_zones"),
  enabled: v.boolean(),
};

export const matchZoneForAddressArgs = {
  countryCode: v.string(),
  state: v.optional(v.string()),
  postalCode: v.optional(v.string()),
};
