/**
 * Post System - Frontend Constants
 *
 * Status labels, colors, and configuration constants for the post system UI.
 */

import type { PostStatus } from "./types";

// ─── Status Labels ──────────────────────────────────────────────────────────

/** Human-readable labels for post statuses. */
export const STATUS_LABELS: Record<PostStatus, string> = {
  "auto-draft": "Auto Draft",
  draft: "Draft",
  pending: "Pending Review",
  publish: "Published",
  future: "Scheduled",
  private: "Private",
  trash: "Trash",
};

// ─── Status Colors (CSS variable based) ─────────────────────────────────────

/**
 * Status-based text color classes using CSS variables.
 * These classes should be applied to status badge text.
 */
export const STATUS_TEXT_CLASSES: Record<PostStatus, string> = {
  "auto-draft": "text-muted-foreground",
  draft: "text-muted-foreground",
  pending: "text-warning",
  publish: "text-success",
  future: "text-info",
  private: "text-private",
  trash: "text-destructive",
};

/**
 * Status-based background color classes using CSS variables.
 */
export const STATUS_BG_CLASSES: Record<PostStatus, string> = {
  "auto-draft": "bg-muted",
  draft: "bg-muted",
  pending: "bg-warning/10",
  publish: "bg-success/10",
  future: "bg-info/10",
  private: "bg-private/10",
  trash: "bg-destructive/10",
};

// ─── Post Statuses Array ────────────────────────────────────────────────────

/** All possible post statuses. */
export const POST_STATUSES: PostStatus[] = [
  "auto-draft",
  "draft",
  "pending",
  "publish",
  "future",
  "private",
  "trash",
];

/** Statuses that are editable (not trashed). */
export const EDITABLE_STATUSES: PostStatus[] = [
  "auto-draft",
  "draft",
  "pending",
  "publish",
  "future",
  "private",
];

/** Statuses that can be published from. */
export const PUBLISHABLE_STATUSES: PostStatus[] = [
  "auto-draft",
  "draft",
  "pending",
  "future",
];

// ─── Default Values ─────────────────────────────────────────────────────────

export const DEFAULT_PER_PAGE = 20;
export const MAX_PER_PAGE = 100;
export const MAX_TITLE_LENGTH = 500;
export const MAX_EXCERPT_LENGTH = 1000;

// ─── Sort Field Mapping ─────────────────────────────────────────────────────

/**
 * Maps the UI column keys used in URL search params to the Convex query
 * `orderBy` field names.
 */
export const SORT_FIELD_MAP: Record<string, string> = {
  title: "title",
  author: "createdAt", // Author column sort not directly supported, fallback to date
  comments: "createdAt", // Comment count sort not directly supported
  date: "createdAt",
};
