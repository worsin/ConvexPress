/**
 * Audit Log System - Description Templates
 *
 * Generates human-readable descriptions for each event code.
 * Pattern: "{Actor} {verb} {object type} '{label}'"
 *
 * The actor name is prepended by the caller (internals.ts createEntry).
 * These templates generate the action portion only.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

interface DescriptionConfig {
  /** Human-readable action label (e.g., "Published Post") */
  action: string;

  /**
   * Template function that generates a description from the event payload.
   * Receives the parsed payload object. Returns a description string.
   * The actor name will be prepended by the caller.
   */
  template: (payload: Record<string, unknown>) => string;
}

// ─── Description Map ────────────────────────────────────────────────────────

/**
 * Maps each event code to its action label and description template.
 */
export const DESCRIPTION_MAP: Record<string, DescriptionConfig> = {
  // ── Post System ─────────────────────────────────────────────────────────
  "post.created": {
    action: "Created Post",
    template: (p) => `created post "${p.title ?? "Untitled"}"`,
  },
  "post.updated": {
    action: "Updated Post",
    template: (p) => `updated post "${p.title ?? "Untitled"}"`,
  },
  "post.published": {
    action: "Published Post",
    template: (p) => `published post "${p.title ?? "Untitled"}"`,
  },
  "post.unpublished": {
    action: "Unpublished Post",
    template: (p) => `unpublished post "${p.title ?? "Untitled"}"`,
  },
  "post.scheduled": {
    action: "Scheduled Post",
    template: (p) => `scheduled post "${p.title ?? "Untitled"}"`,
  },
  "post.trashed": {
    action: "Trashed Post",
    template: (p) => `moved post "${p.title ?? "Untitled"}" to trash`,
  },
  "post.restored": {
    action: "Restored Post",
    template: (p) => `restored post "${p.title ?? "Untitled"}" from trash`,
  },
  "post.deleted": {
    action: "Deleted Post",
    template: (p) => `permanently deleted post "${p.title ?? "Untitled"}"`,
  },
  "post.duplicated": {
    action: "Duplicated Post",
    template: (p) => `duplicated post "${p.title ?? "Untitled"}"`,
  },
  "post.status_changed": {
    action: "Changed Post Status",
    template: (p) =>
      `changed post "${p.title ?? "Untitled"}" status from "${p.fromStatus ?? "unknown"}" to "${p.toStatus ?? "unknown"}"`,
  },

  // ── Page System ─────────────────────────────────────────────────────────
  "page.created": {
    action: "Created Page",
    template: (p) => `created page "${p.title ?? "Untitled"}"`,
  },
  "page.updated": {
    action: "Updated Page",
    template: (p) => `updated page "${p.title ?? "Untitled"}"`,
  },
  "page.published": {
    action: "Published Page",
    template: (p) => `published page "${p.title ?? "Untitled"}"`,
  },
  "page.unpublished": {
    action: "Unpublished Page",
    template: (p) => `unpublished page "${p.title ?? "Untitled"}"`,
  },
  "page.trashed": {
    action: "Trashed Page",
    template: (p) => `moved page "${p.title ?? "Untitled"}" to trash`,
  },
  "page.restored": {
    action: "Restored Page",
    template: (p) => `restored page "${p.title ?? "Untitled"}" from trash`,
  },
  "page.deleted": {
    action: "Deleted Page",
    template: (p) => `permanently deleted page "${p.title ?? "Untitled"}"`,
  },
  "page.reordered": {
    action: "Reordered Pages",
    template: () => `reordered pages`,
  },

  // ── Media System ────────────────────────────────────────────────────────
  "media.uploaded": {
    action: "Uploaded Media",
    template: (p) => `uploaded file "${p.fileName ?? "unknown"}"`,
  },
  "media.updated": {
    action: "Updated Media",
    template: (p) => `updated media "${p.fileName ?? "unknown"}"`,
  },
  "media.deleted": {
    action: "Deleted Media",
    template: (p) => `deleted media "${p.fileName ?? "unknown"}"`,
  },
  "media.cropped": {
    action: "Cropped Image",
    template: (p) => `cropped image "${p.fileName ?? "unknown"}"`,
  },

  // ── Taxonomy System ─────────────────────────────────────────────────────
  "taxonomy.category_created": {
    action: "Created Category",
    template: (p) => `created category "${p.name ?? "unknown"}"`,
  },
  "taxonomy.category_updated": {
    action: "Updated Category",
    template: (p) => `updated category "${p.name ?? "unknown"}"`,
  },
  "taxonomy.category_deleted": {
    action: "Deleted Category",
    template: (p) => `deleted category "${p.name ?? "unknown"}"`,
  },
  "taxonomy.tag_created": {
    action: "Created Tag",
    template: (p) => `created tag "${p.name ?? "unknown"}"`,
  },
  "taxonomy.tag_updated": {
    action: "Updated Tag",
    template: (p) => `updated tag "${p.name ?? "unknown"}"`,
  },
  "taxonomy.tag_deleted": {
    action: "Deleted Tag",
    template: (p) => `deleted tag "${p.name ?? "unknown"}"`,
  },
  "taxonomy.merged": {
    action: "Merged Terms",
    template: (p) =>
      `merged term "${p.sourceName ?? "unknown"}" into "${p.targetName ?? "unknown"}"`,
  },
  "taxonomy.term_assigned": {
    action: "Assigned Term",
    template: (p) =>
      `assigned term "${p.termName ?? "unknown"}" to ${p.postType ?? "post"} "${p.postTitle ?? "unknown"}"`,
  },

  // ── Comment System ──────────────────────────────────────────────────────
  "comment.created": {
    action: "Posted Comment",
    template: (p) =>
      `posted a comment on "${p.postTitle ?? "unknown"}"`,
  },
  "comment.updated": {
    action: "Updated Comment",
    template: (p) =>
      `updated a comment on "${p.postTitle ?? "unknown"}"`,
  },
  "comment.approved": {
    action: "Approved Comment",
    template: (p) =>
      `approved a comment on "${p.postTitle ?? "unknown"}"`,
  },
  "comment.rejected": {
    action: "Rejected Comment",
    template: (p) =>
      `rejected a comment on "${p.postTitle ?? "unknown"}"`,
  },
  "comment.flagged": {
    action: "Flagged Comment",
    template: (p) =>
      `flagged a comment on "${p.postTitle ?? "unknown"}"`,
  },
  "comment.spammed": {
    action: "Marked Comment as Spam",
    template: (p) =>
      `marked a comment as spam on "${p.postTitle ?? "unknown"}"`,
  },
  "comment.replied": {
    action: "Replied to Comment",
    template: (p) =>
      `replied to a comment on "${p.postTitle ?? "unknown"}"`,
  },
  "comment.deleted": {
    action: "Deleted Comment",
    template: (p) =>
      `deleted a comment on "${p.postTitle ?? "unknown"}"`,
  },

  // ── Role & Capability System ────────────────────────────────────────────
  "role.created": {
    action: "Created Role",
    template: (p) => `created role "${p.name ?? "unknown"}"`,
  },
  "role.updated": {
    action: "Updated Role",
    template: (p) => `updated role "${p.name ?? "unknown"}"`,
  },
  "role.deleted": {
    action: "Deleted Role",
    template: (p) => `deleted role "${p.name ?? "unknown"}"`,
  },
  "role.assigned": {
    action: "Assigned Role",
    template: (p) =>
      `assigned role "${p.roleName ?? "unknown"}" to user "${p.targetEmail ?? p.targetName ?? "unknown"}"`,
  },
  "role.capability_granted": {
    action: "Granted Capability",
    template: (p) =>
      `granted capability "${p.capability ?? "unknown"}" to role "${p.roleName ?? p.name ?? "unknown"}"`,
  },
  "role.capability_revoked": {
    action: "Revoked Capability",
    template: (p) =>
      `revoked capability "${p.capability ?? "unknown"}" from role "${p.roleName ?? p.name ?? "unknown"}"`,
  },

  // ── Auth System ─────────────────────────────────────────────────────────
  "auth.login": {
    action: "Logged In",
    template: (p) => `logged in${p.method ? ` via ${p.method}` : ""}`,
  },
  "auth.login_failed": {
    action: "Login Failed",
    template: (p) =>
      `failed login attempt for "${p.email ?? "unknown"}"${p.reason ? ` (${p.reason})` : ""}`,
  },
  "auth.logout": {
    action: "Logged Out",
    template: () => `logged out`,
  },
  "auth.session_refreshed": {
    action: "Session Refreshed",
    template: () => `refreshed session`,
  },
  "auth.oauth_completed": {
    action: "OAuth Completed",
    template: (p) => `completed OAuth login${p.provider ? ` via ${p.provider}` : ""}`,
  },
  "auth.email_verified": {
    action: "Email Verified",
    template: (p) => `verified email "${p.email ?? "unknown"}"`,
  },

  // ── Registration System ─────────────────────────────────────────────────
  "registration.registered": {
    action: "User Registered",
    template: (p) => `registered as "${p.email ?? "unknown"}"`,
  },
  "registration.user_registered": {
    action: "User Registered",
    template: (p) => `registered as "${p.email ?? "unknown"}"`,
  },
  "registration.email_verified": {
    action: "Email Verified",
    template: (p) => `verified email "${p.email ?? "unknown"}"`,
  },
  "registration.user_invited": {
    action: "User Invited",
    template: (p) =>
      `invited "${p.email ?? "unknown"}" to join${p.roleName ? ` as ${p.roleName}` : ""}`,
  },

  // ── User Profile System ─────────────────────────────────────────────────
  "profile.updated": {
    action: "Updated Profile",
    template: () => `updated their profile`,
  },
  "profile.avatar_changed": {
    action: "Changed Avatar",
    template: () => `changed their avatar`,
  },
  "profile.deactivated": {
    action: "Deactivated Account",
    template: (p) =>
      `deactivated account for "${p.email ?? p.targetName ?? "unknown"}"`,
  },
  "profile.deleted": {
    action: "Deleted Account",
    template: (p) =>
      `permanently deleted account for "${p.email ?? p.targetName ?? "unknown"}"`,
  },

  // ── Password Management System ──────────────────────────────────────────
  "password.changed": {
    action: "Changed Password",
    template: () => `changed their password`,
  },
  "password.reset_requested": {
    action: "Requested Password Reset",
    template: (p) =>
      `requested a password reset for "${p.email ?? "unknown"}"`,
  },
  "password.reset_completed": {
    action: "Completed Password Reset",
    template: (p) =>
      `completed a password reset${p.email ? ` for "${p.email}"` : ""}`,
  },

  // ── Menu System ─────────────────────────────────────────────────────────
  "menu.created": {
    action: "Created Menu",
    template: (p) => `created menu "${p.name ?? "unknown"}"`,
  },
  "menu.updated": {
    action: "Updated Menu",
    template: (p) => `updated menu "${p.name ?? "unknown"}"`,
  },
  "menu.deleted": {
    action: "Deleted Menu",
    template: (p) => `deleted menu "${p.name ?? "unknown"}"`,
  },
  "menu.location_assigned": {
    action: "Assigned Menu Location",
    template: (p) =>
      `assigned menu "${p.name ?? "unknown"}" to location "${p.location ?? "unknown"}"`,
  },

  // ── Settings System ─────────────────────────────────────────────────────
  "settings.updated": {
    action: "Updated Settings",
    template: (p) => `updated ${p.section ?? "unknown"} settings`,
  },
  "settings.permalinks_changed": {
    action: "Changed Permalink Structure",
    template: (p) =>
      `changed permalink structure${p.newStructure ? ` to "${p.newStructure}"` : ""}`,
  },

  // ── SEO System ──────────────────────────────────────────────────────────
  "seo.meta_updated": {
    action: "Updated SEO Meta",
    template: (p) =>
      `updated SEO meta for "${p.title ?? p.url ?? "unknown"}"`,
  },
  "seo.sitemap_generated": {
    action: "Generated Sitemap",
    template: () => `generated sitemap`,
  },

  // ── API System ──────────────────────────────────────────────────────────
  "api.key_created": {
    action: "Created API Key",
    template: (p) => `created API key "${p.name ?? "unknown"}"`,
  },
  "api.key_revoked": {
    action: "Revoked API Key",
    template: (p) => `revoked API key "${p.name ?? "unknown"}"`,
  },
  "api.webhook_triggered": {
    action: "Webhook Triggered",
    template: (p) => `triggered webhook "${p.url ?? p.name ?? "unknown"}"`,
  },

  // ── Revision System ─────────────────────────────────────────────────────
  "revision.created": {
    action: "Created Revision",
    template: (p) =>
      `created revision for "${p.postTitle ?? "unknown"}"`,
  },
  "revision.restored": {
    action: "Restored Revision",
    template: (p) =>
      `restored revision for "${p.postTitle ?? "unknown"}"`,
  },

  // ── Email System ────────────────────────────────────────────────────────
  "email.sent": {
    action: "Email Sent",
    template: (p) =>
      `sent email "${p.subject ?? "unknown"}" to "${p.to ?? "unknown"}"`,
  },
  "email.failed": {
    action: "Email Failed",
    template: (p) =>
      `failed to send email "${p.subject ?? "unknown"}" to "${p.to ?? "unknown"}"`,
  },

  // ── Notification System ─────────────────────────────────────────────────
  "notification.sent": {
    action: "Notification Sent",
    template: (p) =>
      `sent notification "${p.type ?? p.title ?? "unknown"}"`,
  },
  "notification.email_sent": {
    action: "Notification Email Sent",
    template: (p) =>
      `sent notification email "${p.subject ?? p.type ?? "unknown"}"`,
  },
  "notification.email_failed": {
    action: "Notification Email Failed",
    template: (p) =>
      `failed to send notification email "${p.subject ?? p.type ?? "unknown"}"`,
  },

  // ── Custom Field System ─────────────────────────────────────────────────
  "custom_field.group_created": {
    action: "Created Field Group",
    template: (p) => `created custom field group "${p.name ?? "unknown"}"`,
  },
  "custom_field.group_updated": {
    action: "Updated Field Group",
    template: (p) => `updated custom field group "${p.name ?? "unknown"}"`,
  },
  "custom_field.group_deleted": {
    action: "Deleted Field Group",
    template: (p) => `deleted custom field group "${p.name ?? "unknown"}"`,
  },
  "custom_field.group_activated": {
    action: "Activated Field Group",
    template: (p) => `activated custom field group "${p.name ?? "unknown"}"`,
  },
  "custom_field.group_deactivated": {
    action: "Deactivated Field Group",
    template: (p) => `deactivated custom field group "${p.name ?? "unknown"}"`,
  },
  "custom_field.value_set": {
    action: "Set Custom Field Value",
    template: (p) =>
      `set custom field "${p.fieldName ?? "unknown"}" on ${p.objectType ?? "post"}`,
  },

  // ── Editor System ───────────────────────────────────────────────────────
  "editor.draft_saved": {
    action: "Saved Draft",
    template: (p) => `saved draft for "${p.title ?? "unknown"}"`,
  },
  "editor.autosaved": {
    action: "Autosaved",
    template: (p) => `autosaved "${p.title ?? "unknown"}"`,
  },

  // ── Search System ───────────────────────────────────────────────────────
  "search.reindex_completed": {
    action: "Search Reindex Complete",
    template: (p) =>
      `completed search reindex${p.indexedCount ? ` (${p.indexedCount} records)` : ""}`,
  },

  // ── Event Dispatcher System ─────────────────────────────────────────────
  "event.listener_failed": {
    action: "Listener Failed",
    template: (p) =>
      `event listener "${p.listenerName ?? "unknown"}" failed for event "${p.eventCode ?? "unknown"}"`,
  },

  // ── Audit Log System (self-auditing) ────────────────────────────────────
  "audit.cleared": {
    action: "Cleared Audit Log",
    template: (p) =>
      `cleared ${p.count ?? 0} audit entries (mode: ${p.mode ?? "unknown"})`,
  },
  "audit.exported": {
    action: "Exported Audit Log",
    template: (p) =>
      `exported ${p.recordCount ?? 0} audit entries as ${p.format ?? "unknown"}`,
  },

  // ── Dashboard System ─────────────────────────────────────────────────
  "dashboard.viewed": {
    action: "Viewed Dashboard",
    template: () => `viewed the dashboard`,
  },
  "dashboard.quick_drafted": {
    action: "Quick Drafted",
    template: (p) => `quick drafted "${p.title ?? "Untitled"}"`,
  },
  "dashboard.widget_dismissed": {
    action: "Dismissed Widget",
    template: (p) => `dismissed dashboard widget "${p.widgetId ?? "unknown"}"`,
  },
  "dashboard.widget_restored": {
    action: "Restored Widget",
    template: (p) => `restored dashboard widget "${p.widgetId ?? "unknown"}"`,
  },
  "dashboard.widgets_reordered": {
    action: "Reordered Widgets",
    template: () => `reordered dashboard widgets`,
  },
  "dashboard.welcome_dismissed": {
    action: "Dismissed Welcome",
    template: () => `dismissed the welcome panel`,
  },
};

// ─── Description Generator ──────────────────────────────────────────────────

/**
 * Generate a human-readable action label for an event code.
 * Returns a generic label for unrecognized codes.
 */
export function getActionLabel(eventCode: string): string {
  const config = DESCRIPTION_MAP[eventCode];
  if (config) return config.action;

  // Generate a reasonable label from the event code
  const parts = eventCode.split(".");
  if (parts.length === 2) {
    const action = parts[1]
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    const system = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    return `${action} (${system})`;
  }

  return `Event: ${eventCode}`;
}

/**
 * Generate a human-readable description for an event.
 *
 * @param eventCode - The event code (e.g., "post.published")
 * @param payload - The parsed event payload
 * @param actorName - The actor's display name (prepended to the description)
 * @returns Full description string (e.g., "John Smith published post 'Hello World'")
 */
export function generateDescription(
  eventCode: string,
  payload: Record<string, unknown>,
  actorName?: string,
): string {
  const config = DESCRIPTION_MAP[eventCode];
  const actor = actorName ?? "System";

  if (config) {
    try {
      const actionText = config.template(payload);
      return `${actor} ${actionText}`;
    } catch {
      return `${actor} performed ${eventCode}`;
    }
  }

  // Fallback for unrecognized event codes
  return `${actor} performed ${eventCode}`;
}
