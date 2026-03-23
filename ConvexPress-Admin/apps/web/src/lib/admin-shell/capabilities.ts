import type { AdminNavSection } from "./types";

/**
 * Legacy WordPress capability keys used in nav config mapped to
 * SmithHarper's canonical dot-capability system.
 */
const LEGACY_CAPABILITY_MAP: Record<string, string[]> = {
  edit_posts: ["post.read", "post.create", "post.update"],
  manage_categories: [
    "taxonomy.create_category",
    "taxonomy.update_category",
    "taxonomy.create_tag",
    "taxonomy.update_tag",
  ],
  upload_files: ["media.upload", "media.read"],
  edit_pages: ["page.create", "page.update", "page.delete"],
  moderate_comments: [
    "comment.approve",
    "comment.reject",
    "comment.spam",
    "comment.bulk_approve",
  ],
  manage_options: [
    "settings.update_general",
    "settings.update_reading",
    "settings.update_writing",
    "settings.update_discussion",
    "settings.update_permalinks",
    "settings.update_privacy",
    "settings.update_email",
    "custom_field.create_group",
    "custom_field.update_group",
    "audit.view",
    "event.register_listener",
    "routing.create_redirect",
    "api.create_key",
    "api.create_webhook",
    "notification.send",
  ],
  manage_settings: [
    "settings.update_general",
    "settings.update_reading",
    "settings.update_writing",
    "settings.update_discussion",
    "settings.update_permalinks",
    "settings.update_privacy",
    "settings.update_email",
  ],
  manage_widgets: ["dashboard.reorder_widgets", "dashboard.dismiss_widget"],
  list_users: ["profile.deactivate", "role.assign", "role.update"],
  create_users: ["registration.invite"],
  edit_theme_options: ["menu.create", "menu.update", "menu.assign_location"],
};

/**
 * Check if the user's capabilities include the required capability.
 * Pure client-side check for UI filtering only.
 * Actual authorization happens server-side in Convex mutations.
 */
export function hasCapability(
  userCapabilities: string[],
  requiredCapability: string | undefined,
): boolean {
  if (!requiredCapability) return true; // No capability required
  // First check direct canonical capability match.
  if (userCapabilities.includes(requiredCapability)) return true;

  // Then support legacy WordPress-style capability keys used in nav config.
  const mappedCapabilities = LEGACY_CAPABILITY_MAP[requiredCapability];
  if (!mappedCapabilities) return false;

  return mappedCapabilities.some((capability) =>
    userCapabilities.includes(capability),
  );
}

/**
 * Filter nav sections by user capabilities.
 * Removes sections and items the user cannot access.
 */
export function filterNavSections(
  sections: AdminNavSection[],
  userCapabilities: string[],
): AdminNavSection[] {
  return sections
    .filter((section) => hasCapability(userCapabilities, section.capability))
    .map((section) => ({
      ...section,
      children: section.children?.filter((item) =>
        hasCapability(userCapabilities, item.capability),
      ),
    }));
}
