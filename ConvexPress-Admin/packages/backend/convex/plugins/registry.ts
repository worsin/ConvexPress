/**
 * Backend plugin registry.
 *
 * Mirrors the frontend registry (apps/web/src/lib/plugins/registry.ts).
 * Defines which extensions exist, what they depend on, and their default
 * enablement. The runtime source of truth for enablement is the `plugins`
 * settings section, which this registry is consulted alongside for fallback
 * defaults.
 *
 * Parent-plugin rule: a sub-extension (e.g. commerceBundles) is only
 * considered enabled if both itself AND its parent (commerce) are enabled.
 * This matches user expectation — turning off Commerce turns off all
 * commerce extensions.
 */

export type PluginId =
  | "commerce"
  | "commerceDigital"
  | "commerceReviews"
  | "commerceWishlists"
  | "commerceBundles"
  | "commerceReturns"
  | "commerceSubscriptions"
  | "membership"
  | "knowledgeBase"
  | "tickets"
  | "customFields"
  | "recipes"
  | "gallery"
  | "lms"
  | "forms";

/** Maps pluginId → the key in the `plugins` settings section. */
export const PLUGIN_SETTINGS_KEY: Record<PluginId, string> = {
  commerce: "commerceEnabled",
  commerceDigital: "commerceDigitalEnabled",
  commerceReviews: "commerceReviewsEnabled",
  commerceWishlists: "commerceWishlistsEnabled",
  commerceBundles: "commerceBundlesEnabled",
  commerceReturns: "commerceReturnsEnabled",
  commerceSubscriptions: "commerceSubscriptionsEnabled",
  membership: "membershipEnabled",
  knowledgeBase: "knowledgeBaseEnabled",
  tickets: "ticketsEnabled",
  customFields: "customFieldsEnabled",
  recipes: "recipesEnabled",
  gallery: "galleryEnabled",
  lms: "lmsEnabled",
  forms: "formsEnabled",
};

/** Parent plugin dependency chain. Sub-extension inherits its parent's enablement. */
export const PLUGIN_PARENT: Partial<Record<PluginId, PluginId>> = {
  commerceDigital: "commerce",
  commerceReviews: "commerce",
  commerceWishlists: "commerce",
  commerceBundles: "commerce",
  commerceReturns: "commerce",
  commerceSubscriptions: "commerce",
};

/** Baseline defaults used when the `plugins` settings section is absent. */
export const PLUGIN_DEFAULTS: Record<PluginId, boolean> = {
  commerce: false,
  commerceDigital: false,
  commerceReviews: false,
  commerceWishlists: false,
  commerceBundles: false,
  commerceReturns: false,
  commerceSubscriptions: false,
  membership: false,
  knowledgeBase: true,
  tickets: true,
  customFields: true,
  recipes: true,
  gallery: true,
  lms: true,
  forms: false,
};
