/**
 * WordPress Sync System - Validators
 *
 * Shared argument validators for all sync system functions.
 */

import { v } from "convex/values";

// ─── Site Status ───────────────────────────────────────────────────────────

export const siteStatusValidator = v.union(
  v.literal("active"),
  v.literal("inactive"),
  v.literal("error")
);

export type SiteStatus = "active" | "inactive" | "error";

// ─── Job Status ────────────────────────────────────────────────────────────

export const jobStatusValidator = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("paused"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("cancelled")
);

export type JobStatus = "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";

// ─── Sync Phase ────────────────────────────────────────────────────────────

export const syncPhaseValidator = v.union(
  v.literal("users"),
  v.literal("taxonomies"),
  v.literal("media"),
  v.literal("posts"),
  v.literal("pages"),
  v.literal("comments"),
  v.literal("menus"),
  v.literal("cleanup")
);

export type SyncPhase = "users" | "taxonomies" | "media" | "posts" | "pages" | "comments" | "menus" | "cleanup";

// Phase execution order (dependencies matter!)
export const PHASE_ORDER: SyncPhase[] = [
  "users",      // Must be first - posts reference authors
  "taxonomies", // Must be before posts - posts reference terms
  "media",      // Must be before posts - posts reference featured images
  "posts",      // Main content
  "pages",      // Pages (separate because Elementor handling)
  "comments",   // After posts - references post IDs
  "menus",      // Last - references posts/pages/categories
  "cleanup",    // Finalization
];

// ─── Object Type ───────────────────────────────────────────────────────────

export const objectTypeValidator = v.union(
  v.literal("user"),
  v.literal("post"),
  v.literal("page"),
  v.literal("category"),
  v.literal("tag"),
  v.literal("media"),
  v.literal("comment"),
  v.literal("menu"),
  v.literal("menuItem")
);

export type ObjectType = "user" | "post" | "page" | "category" | "tag" | "media" | "comment" | "menu" | "menuItem";

// ─── Phase Progress ────────────────────────────────────────────────────────

export const phaseProgressValidator = v.object({
  total: v.number(),
  imported: v.number(),
  failed: v.number(),
  cursor: v.optional(v.number()),
});

export interface PhaseProgress {
  total: number;
  imported: number;
  failed: number;
  cursor?: number;
}

export const progressValidator = v.object({
  users: phaseProgressValidator,
  categories: phaseProgressValidator,
  tags: phaseProgressValidator,
  media: phaseProgressValidator,
  posts: phaseProgressValidator,
  pages: phaseProgressValidator,
  comments: phaseProgressValidator,
  menus: phaseProgressValidator,
});

export type Progress = {
  users: PhaseProgress;
  categories: PhaseProgress;
  tags: PhaseProgress;
  media: PhaseProgress;
  posts: PhaseProgress;
  pages: PhaseProgress;
  comments: PhaseProgress;
  menus: PhaseProgress;
};

// ─── Sync Error ────────────────────────────────────────────────────────────

export const syncErrorValidator = v.object({
  phase: v.string(),
  wpId: v.number(),
  message: v.string(),
  timestamp: v.number(),
});

export interface SyncError {
  phase: string;
  wpId: number;
  message: string;
  timestamp: number;
}

// ─── Site Credentials ──────────────────────────────────────────────────────

export const siteCredentialsValidator = v.object({
  siteUrl: v.string(),
  username: v.string(),
  applicationPassword: v.string(),
});

export interface SiteCredentials {
  siteUrl: string;
  username: string;
  applicationPassword: string;
}

// ─── Create Site Args ──────────────────────────────────────────────────────

export const createSiteArgsValidator = v.object({
  name: v.string(),
  siteUrl: v.string(),
  username: v.string(),
  applicationPassword: v.string(),
});

// ─── Update Site Args ──────────────────────────────────────────────────────

export const updateSiteArgsValidator = v.object({
  siteId: v.id("wordpressSites"),
  name: v.optional(v.string()),
  username: v.optional(v.string()),
  applicationPassword: v.optional(v.string()),
  status: v.optional(siteStatusValidator),
});

// ─── Batch Sizes ───────────────────────────────────────────────────────────

// Number of items to fetch per WordPress API request
export const WP_BATCH_SIZE = 100;

// Number of media items to process per batch (smaller due to downloads)
export const MEDIA_BATCH_SIZE = 25;

// Maximum errors per phase before stopping
export const MAX_PHASE_ERRORS = 50;

// Delay between batch operations (ms) to avoid overwhelming the API
export const BATCH_DELAY_MS = 100;

// ─── Helper Functions ──────────────────────────────────────────────────────

/**
 * Create initial progress object with all phases at zero.
 */
export function createInitialProgress(): Progress {
  return {
    users: { total: 0, imported: 0, failed: 0 },
    categories: { total: 0, imported: 0, failed: 0 },
    tags: { total: 0, imported: 0, failed: 0 },
    media: { total: 0, imported: 0, failed: 0 },
    posts: { total: 0, imported: 0, failed: 0 },
    pages: { total: 0, imported: 0, failed: 0 },
    comments: { total: 0, imported: 0, failed: 0 },
    menus: { total: 0, imported: 0, failed: 0 },
  };
}

/**
 * Get the next phase in the sync process.
 */
export function getNextPhase(currentPhase: SyncPhase): SyncPhase | null {
  const currentIndex = PHASE_ORDER.indexOf(currentPhase);
  if (currentIndex === -1 || currentIndex === PHASE_ORDER.length - 1) {
    return null;
  }
  return PHASE_ORDER[currentIndex + 1];
}

/**
 * Calculate overall progress percentage.
 */
export function calculateOverallProgress(progress: Progress): number {
  const phases = Object.values(progress);
  let totalItems = 0;
  let completedItems = 0;

  for (const phase of phases) {
    totalItems += phase.total;
    completedItems += phase.imported + phase.failed;
  }

  if (totalItems === 0) return 0;
  return Math.round((completedItems / totalItems) * 100);
}

/**
 * Validate WordPress site URL format.
 */
export function validateSiteUrl(url: string): { valid: boolean; error?: string } {
  if (!url) {
    return { valid: false, error: "URL is required" };
  }

  try {
    const parsed = new URL(url);

    // Must be HTTPS (recommended for API auth)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { valid: false, error: "URL must use HTTP or HTTPS protocol" };
    }

    // Should not have a path beyond root (WP REST API is at /wp-json/)
    if (parsed.pathname !== "/" && parsed.pathname !== "") {
      return { valid: false, error: "URL should be the root domain (e.g., https://example.com)" };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}

/**
 * Normalize a WordPress site URL.
 */
export function normalizeSiteUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Return origin only (protocol + hostname + port)
    return parsed.origin;
  } catch {
    return url;
  }
}
