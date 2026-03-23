/**
 * Audit Log System - Constants
 *
 * Severity levels, object type labels, filter options, and other
 * constants used across audit UI components.
 *
 * CRITICAL: No hardcoded colors. Uses CSS variables and opacity modifiers only.
 */

import type { AuditSeverity, AuditObjectType } from "./types";

// ─── Severity Levels ────────────────────────────────────────────────────────

export interface SeverityConfig {
  value: AuditSeverity;
  label: string;
  /** CSS class for the severity dot indicator */
  dotClass: string;
  /** CSS class for text color */
  textClass: string;
  /** CSS class for background badge */
  badgeClass: string;
}

export const SEVERITY_LEVELS: SeverityConfig[] = [
  {
    value: "critical",
    label: "Critical",
    dotClass: "bg-destructive",
    textClass: "text-destructive",
    badgeClass: "bg-destructive/10 text-destructive",
  },
  {
    value: "high",
    label: "High",
    dotClass: "bg-[var(--color-warning,hsl(25,95%,53%))]",
    textClass: "text-[var(--color-warning,hsl(25,95%,53%))]",
    badgeClass: "bg-[var(--color-warning,hsl(25,95%,53%))]/10 text-[var(--color-warning,hsl(25,95%,53%))]",
  },
  {
    value: "medium",
    label: "Medium",
    dotClass: "bg-[var(--color-caution,hsl(48,96%,53%))]",
    textClass: "text-[var(--color-caution,hsl(48,96%,53%))]",
    badgeClass: "bg-[var(--color-caution,hsl(48,96%,53%))]/10 text-[var(--color-caution,hsl(48,96%,53%))]",
  },
  {
    value: "low",
    label: "Low",
    dotClass: "bg-primary",
    textClass: "text-primary",
    badgeClass: "bg-primary/10 text-primary",
  },
  {
    value: "informational",
    label: "Info",
    dotClass: "bg-muted-foreground",
    textClass: "text-muted-foreground",
    badgeClass: "bg-muted text-muted-foreground",
  },
];

/**
 * Map from severity value to its config.
 */
export const SEVERITY_MAP: Record<AuditSeverity, SeverityConfig> =
  Object.fromEntries(
    SEVERITY_LEVELS.map((s) => [s.value, s]),
  ) as Record<AuditSeverity, SeverityConfig>;

// ─── Object Type Labels ─────────────────────────────────────────────────────

export const OBJECT_TYPE_LABELS: Record<AuditObjectType, string> = {
  post: "Post",
  page: "Page",
  comment: "Comment",
  media: "Media",
  user: "User",
  role: "Role",
  taxonomy: "Taxonomy",
  menu: "Menu",
  settings: "Settings",
  seo: "SEO",
  api: "API",
  notification: "Notification",
  system: "System",
};

// ─── System Labels ──────────────────────────────────────────────────────────

export const SYSTEM_LABELS: Record<string, string> = {
  post: "Post System",
  page: "Page System",
  comment: "Comment System",
  media: "Media System",
  auth: "Auth System",
  registration: "Registration System",
  profile: "User Profile System",
  role: "Role & Capability System",
  taxonomy: "Taxonomy System",
  menu: "Menu System",
  settings: "Settings System",
  seo: "SEO System",
  api: "API System",
  notification: "Notification System",
  password: "Password System",
  revision: "Revision System",
  editor: "Content Editor",
  custom_field: "Custom Field System",
  search: "Search System",
  email: "Email System",
  audit: "Audit Log System",
  event: "Event Dispatcher",
  routing: "Routing System",
  widget: "Widget System",
  theme: "Theme System",
  feed: "RSS/Feed System",
  sitemap: "Sitemap System",
};

// ─── Filter Options ─────────────────────────────────────────────────────────

export const SEVERITY_FILTER_OPTIONS = [
  { value: "", label: "All Severities" },
  ...SEVERITY_LEVELS.map((s) => ({ value: s.value, label: s.label })),
];

export const OBJECT_TYPE_FILTER_OPTIONS = [
  { value: "", label: "All Types" },
  ...Object.entries(OBJECT_TYPE_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

export const SYSTEM_FILTER_OPTIONS = [
  { value: "", label: "All Systems" },
  ...Object.entries(SYSTEM_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

// ─── Pagination ─────────────────────────────────────────────────────────────

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

// ─── Export ─────────────────────────────────────────────────────────────────

export const MAX_EXPORT_RECORDS = 50000;
export const DEFAULT_EXPORT_RECORDS = 10000;

// ─── Activity Log Categories ────────────────────────────────────────────────

export const ACTIVITY_CATEGORIES = [
  { key: "all", label: "All", objectTypes: undefined },
  {
    key: "content",
    label: "Content",
    objectTypes: ["post", "page", "media", "taxonomy"] as AuditObjectType[],
  },
  {
    key: "users",
    label: "Users",
    objectTypes: ["user", "role"] as AuditObjectType[],
  },
  {
    key: "security",
    label: "Security",
    eventPrefixes: ["auth.", "password.", "role.capability"],
  },
  {
    key: "system",
    label: "System",
    objectTypes: [
      "settings",
      "system",
      "api",
      "notification",
    ] as AuditObjectType[],
  },
] as const;

// ─── Stats Periods ──────────────────────────────────────────────────────────

export const STATS_PERIODS = [
  { value: "today" as const, label: "Today" },
  { value: "week" as const, label: "This Week" },
  { value: "month" as const, label: "This Month" },
];
