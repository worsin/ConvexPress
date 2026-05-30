export type PublicPluginId =
  | "commerce"
  | "commerceDigital"
  | "commerceReviews"
  | "commerceSubscriptions"
  | "commerceWishlists"
  | "commerceBundles"
  | "commerceReturns"
  | "kb"
  | "tickets"
  | "recipes"
  | "gallery"
  | "membership"
  | "forms";

export type PublicPluginSettings = {
  plugins?: {
    commerceEnabled?: boolean;
    commerceDigitalEnabled?: boolean;
    commerceReviewsEnabled?: boolean;
    commerceSubscriptionsEnabled?: boolean;
    commerceWishlistsEnabled?: boolean;
    commerceBundlesEnabled?: boolean;
    commerceReturnsEnabled?: boolean;
    kbEnabled?: boolean;
    knowledgeBaseEnabled?: boolean;
    ticketsEnabled?: boolean;
    recipesEnabled?: boolean;
    galleryEnabled?: boolean;
    membershipEnabled?: boolean;
    formsEnabled?: boolean;
  };
} | null | undefined;

export function isPublicPluginEnabled(
  pluginId: PublicPluginId,
  settings: PublicPluginSettings,
) {
  if (!settings) return false;

  const commerceEnabled = settings.plugins?.commerceEnabled === true;

  switch (pluginId) {
    case "commerce":
      return commerceEnabled;
    case "commerceDigital":
      return commerceEnabled && settings.plugins?.commerceDigitalEnabled === true;
    case "commerceReviews":
      return commerceEnabled && settings.plugins?.commerceReviewsEnabled === true;
    case "commerceSubscriptions":
      return (
        commerceEnabled &&
        settings.plugins?.commerceSubscriptionsEnabled === true
      );
    case "commerceWishlists":
      return commerceEnabled && settings.plugins?.commerceWishlistsEnabled === true;
    case "commerceBundles":
      return commerceEnabled && settings.plugins?.commerceBundlesEnabled === true;
    case "commerceReturns":
      return commerceEnabled && settings.plugins?.commerceReturnsEnabled === true;
    case "kb":
      return (
        settings.plugins?.knowledgeBaseEnabled === true ||
        settings.plugins?.kbEnabled === true
      );
    case "tickets":
      return settings.plugins?.ticketsEnabled === true;
    case "recipes":
      return settings.plugins?.recipesEnabled === true;
    case "gallery":
      return settings.plugins?.galleryEnabled === true;
    case "membership":
      return settings.plugins?.membershipEnabled === true;
    case "forms":
      // The Admin's public settings query does not (yet) surface a
      // `formsEnabled` flag, so this fails OPEN: a published form renders
      // publicly unless an explicit `formsEnabled === false` is present.
      // The authoritative published/unpublished gate is enforced server-side
      // by `forms.queries.getBySlug` (unpublished → null → 404). When the
      // Admin later surfaces the flag, an explicit `false` disables here.
      return settings.plugins?.formsEnabled !== false;
    default:
      return false;
  }
}
