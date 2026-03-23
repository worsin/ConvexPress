/**
 * Event Dispatcher System - Frontend Constants
 *
 * Re-exports event codes and system slugs from the backend constants,
 * plus adds frontend-specific display helpers and groupings.
 *
 * Backend constants are the canonical source of truth. This file provides
 * a convenient frontend API for working with events in the admin UI.
 */

// ─── Re-export from Backend ───────────────────────────────────────────────
// The backend constants are the canonical source of truth for all event codes.
// We re-export them here for convenient frontend access.

export {
  SYSTEM,
  type SystemSlug,
  POST_EVENTS,
  PAGE_EVENTS,
  MEDIA_EVENTS,
  TAXONOMY_EVENTS,
  COMMENT_EVENTS,
  ROLE_EVENTS,
  PROFILE_EVENTS,
  AUTH_EVENTS,
  PASSWORD_EVENTS,
  REGISTRATION_EVENTS,
  EDITOR_EVENTS,
  CUSTOM_FIELD_EVENTS,
  REVISION_EVENTS,
  SEO_EVENTS,
  SEARCH_EVENTS,
  MENU_EVENTS,
  SETTINGS_EVENTS,
  EMAIL_EVENTS,
  NOTIFICATION_EVENTS,
  API_EVENTS,
  THEME_EVENTS,
  EVENT_EVENTS,
  ALL_EVENT_CODES,
  EVENT_CODE_SET,
  isValidEventCode,
  EVENT_CODES_BY_SYSTEM,
  WILDCARD_ALL,
  WILDCARD_SYSTEM_SUFFIX,
  isWildcard,
  matchesEventCode,
  RETENTION,
  getRetentionMs,
  LISTENER_DEFAULTS,
} from "@backend/convex/events/constants";

// ─── Frontend Display Constants ───────────────────────────────────────────

import type { EventCategory } from "./types";

/** Human-readable system names for the admin UI */
export const SYSTEM_DISPLAY_NAMES: Record<string, string> = {
  post: "Post System",
  page: "Page System",
  media: "Media System",
  taxonomy: "Taxonomy System",
  comment: "Comment System",
  role: "Role & Capability System",
  profile: "User Profile System",
  auth: "Auth System",
  password: "Password Management",
  registration: "Registration System",
  editor: "Content Editor",
  custom_field: "Custom Field System",
  revision: "Revision System",
  seo: "SEO System",
  search: "Search System",
  menu: "Menu System",
  settings: "Settings System",
  email: "Email Notification System",
  notification: "Site Notification System",
  audit: "Audit Log System",
  api: "API System",
  event: "Event Dispatcher",
  routing: "Routing System",
  widget: "Widget System",
  theme: "Theme System",
  feed: "RSS/Feed System",
  sitemap: "Sitemap System",
  dashboard: "Dashboard System",
};

/** Map system slugs to event categories for UI grouping */
export const SYSTEM_TO_CATEGORY: Record<string, EventCategory> = {
  post: "content",
  page: "content",
  media: "media",
  taxonomy: "taxonomy",
  comment: "comment",
  role: "role",
  profile: "user",
  auth: "auth",
  password: "password",
  registration: "user",
  editor: "content",
  custom_field: "content",
  revision: "revision",
  seo: "seo",
  search: "system",
  menu: "menu",
  settings: "settings",
  email: "notification",
  notification: "notification",
  audit: "system",
  api: "api",
  event: "system",
  routing: "system",
  widget: "system",
  theme: "system",
  feed: "system",
  sitemap: "seo",
  dashboard: "system",
};

/** Category display names and colors for the admin UI */
export const CATEGORY_DISPLAY: Record<EventCategory, { label: string; description: string }> = {
  content: {
    label: "Content",
    description: "Post and page lifecycle events",
  },
  comment: {
    label: "Comments",
    description: "Comment creation, moderation, and interaction events",
  },
  media: {
    label: "Media",
    description: "File upload, update, and deletion events",
  },
  taxonomy: {
    label: "Taxonomy",
    description: "Category, tag, and term management events",
  },
  auth: {
    label: "Authentication",
    description: "Login, logout, and session events",
  },
  user: {
    label: "Users",
    description: "Registration, profile, and account events",
  },
  role: {
    label: "Roles",
    description: "Role and capability management events",
  },
  password: {
    label: "Password",
    description: "Password reset and change events",
  },
  menu: {
    label: "Menus",
    description: "Menu creation, update, and assignment events",
  },
  settings: {
    label: "Settings",
    description: "Site configuration change events",
  },
  seo: {
    label: "SEO",
    description: "SEO metadata and sitemap events",
  },
  api: {
    label: "API",
    description: "API key and webhook events",
  },
  notification: {
    label: "Notifications",
    description: "Email and site notification delivery events",
  },
  revision: {
    label: "Revisions",
    description: "Content revision and autosave events",
  },
  system: {
    label: "System",
    description: "Infrastructure and internal system events",
  },
};

/**
 * Get a human-readable label for an event code.
 *
 * Converts "post.published" to "Post Published",
 * "comment.created" to "Comment Created", etc.
 */
export function getEventCodeLabel(code: string): string {
  const parts = code.split(".");
  if (parts.length !== 2) return code;

  const [system, action] = parts;
  const systemName = system.charAt(0).toUpperCase() + system.slice(1);
  const actionName = action
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return `${systemName} ${actionName}`;
}

/**
 * Get the system slug from an event code.
 * "post.published" -> "post"
 */
export function getSystemFromCode(code: string): string {
  const dotIndex = code.indexOf(".");
  return dotIndex > 0 ? code.slice(0, dotIndex) : code;
}

/**
 * Get the action name from an event code.
 * "post.published" -> "published"
 */
export function getActionFromCode(code: string): string {
  const dotIndex = code.indexOf(".");
  return dotIndex > 0 ? code.slice(dotIndex + 1) : code;
}
