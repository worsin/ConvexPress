/**
 * Revision System - Shared Helper Functions
 *
 * Reusable helpers for revision operations used across queries,
 * mutations, and internal functions.
 *
 * Usage:
 *   import { getRevisionCount, getLatestRevision, getNextRevisionNumber } from "../helpers/revisions";
 *   import { diffFields, shouldCreateRevision } from "../helpers/revisions";
 *   import { getRevisionSettings } from "../helpers/revisions";
 */

import { ConvexError } from "convex/values";
import type { Id, Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { resolveUserRole } from "./permissions";

// ─── Settings Integration ────────────────────────────────────────────────────

/** Default maximum revisions per post (matches validators.ts). */
const SETTINGS_DEFAULT_MAX_REVISIONS = 25;

/**
 * Read revision-related settings from the Settings System.
 *
 * Settings are stored in the "writing" section using the `by_section` index.
 * The `values` field is an object containing `max_revisions` and `revisions_enabled`.
 *
 * This is the SINGLE source of truth for settings integration in the Revision System.
 * All code that needs max_revisions or revisions_enabled MUST use this helper.
 *
 * @param ctx - Query or mutation context
 * @returns Object with maxRevisions and revisionsEnabled
 */
export async function getRevisionSettings(
  ctx: QueryCtx | MutationCtx,
): Promise<{ maxRevisions: number; revisionsEnabled: boolean }> {
  let maxRevisions = SETTINGS_DEFAULT_MAX_REVISIONS;
  let revisionsEnabled = true;

  try {
    const writingSettings = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "writing"))
      .unique();

    if (writingSettings?.values) {
      const values = writingSettings.values as Record<string, unknown>;

      if (values.max_revisions !== undefined) {
        const parsed =
          typeof values.max_revisions === "number"
            ? values.max_revisions
            : parseInt(String(values.max_revisions), 10);
        if (!isNaN(parsed)) {
          maxRevisions = parsed;
        }
      }

      if (values.revisions_enabled !== undefined) {
        revisionsEnabled = values.revisions_enabled !== false && values.revisions_enabled !== "false";
      }
    }
  } catch {
    // Settings table may not exist yet; use defaults
  }

  return { maxRevisions, revisionsEnabled };
}

// ─── Revision Access Check ──────────────────────────────────────────────────

/**
 * Check if a user can access revisions for a given post.
 *
 * Ownership check compares the post's `authorId` (Convex user ID)
 * with the current user's `_id` (Convex user ID). Both are `Id<"users">`.
 *
 * NOTE: This is different from revision.authorId which is a user identifier string.
 * The ownership check here is about the POST owner, not the revision author.
 *
 * Own posts: requires the specified capability.
 * Others' posts: requires the capability + role level >= 80 (Editor).
 *
 * Shared between queries.ts and mutations.ts to avoid permission drift.
 *
 * @param ctx - Query or mutation context
 * @param user - The current user document (must have _id, roleId, internalRole)
 * @param post - The parent post document (must have authorId)
 * @param capability - The capability string to check
 */
export async function requireRevisionAccess(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
  post: Doc<"posts">,
  capability: string,
): Promise<void> {
  const role = await resolveUserRole(ctx, user);
  const capabilities = role?.capabilities ?? [];
  const level = role?.level ?? 0;

  if (!capabilities.includes(capability)) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: `Missing capability: ${capability}`,
    });
  }

  // Check ownership: post.authorId and user._id are both Convex Id<"users">
  const isOwner = post.authorId === user._id;
  if (!isOwner && level < 80) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: `Cannot access revisions of another user's post (Editor+ required)`,
    });
  }
}

// ─── Revision Count ─────────────────────────────────────────────────────────

/**
 * Get total revision count for a post.
 *
 * @param ctx - Query or mutation context
 * @param parentId - The parent post/page ID
 * @param type - Optional filter: "manual" or "autosave"
 * @returns The number of revisions matching the criteria
 */
export async function getRevisionCount(
  ctx: QueryCtx | MutationCtx,
  parentId: Id<"posts">,
  type?: "manual" | "autosave",
): Promise<number> {
  if (type) {
    const revisions = await ctx.db
      .query("revisions")
      .withIndex("by_parent_type", (q) =>
        q.eq("parentId", parentId).eq("type", type),
      )
      .collect();
    return revisions.length;
  }

  const revisions = await ctx.db
    .query("revisions")
    .withIndex("by_parent", (q) => q.eq("parentId", parentId))
    .collect();
  return revisions.length;
}

// ─── Latest Revision ────────────────────────────────────────────────────────

/**
 * Get the most recent revision for a post.
 *
 * @param ctx - Query or mutation context
 * @param parentId - The parent post/page ID
 * @param type - Optional filter: "manual" or "autosave"
 * @returns The most recent revision document, or null if none exist
 */
export async function getLatestRevision(
  ctx: QueryCtx | MutationCtx,
  parentId: Id<"posts">,
  type?: "manual" | "autosave",
): Promise<Doc<"revisions"> | null> {
  let revisions;

  if (type) {
    revisions = await ctx.db
      .query("revisions")
      .withIndex("by_parent_type", (q) =>
        q.eq("parentId", parentId).eq("type", type),
      )
      .collect();
  } else {
    revisions = await ctx.db
      .query("revisions")
      .withIndex("by_parent", (q) => q.eq("parentId", parentId))
      .collect();
  }

  if (revisions.length === 0) return null;

  // Find the one with the highest revision number
  let latest = revisions[0];
  for (let i = 1; i < revisions.length; i++) {
    if (revisions[i].revisionNumber > latest.revisionNumber) {
      latest = revisions[i];
    }
  }

  return latest;
}

// ─── Next Revision Number ───────────────────────────────────────────────────

/**
 * Get the next sequential revision number for a post.
 * Finds the highest existing revision number and increments by 1.
 * Revision numbers are never reused after pruning.
 *
 * @param ctx - Mutation context (needs write access for transactional safety)
 * @param parentId - The parent post/page ID
 * @returns The next revision number (starts at 1)
 */
export async function getNextRevisionNumber(
  ctx: MutationCtx,
  parentId: Id<"posts">,
): Promise<number> {
  const revisions = await ctx.db
    .query("revisions")
    .withIndex("by_parent", (q) => q.eq("parentId", parentId))
    .collect();

  if (revisions.length === 0) return 1;

  let maxNumber = 0;
  for (const rev of revisions) {
    if (rev.revisionNumber > maxNumber) {
      maxNumber = rev.revisionNumber;
    }
  }

  return maxNumber + 1;
}

// ─── Diff Helpers ───────────────────────────────────────────────────────────

/**
 * Fields that are tracked for revision change detection.
 * Only changes to these fields warrant creating a new revision.
 */
export const REVISION_TRACKED_FIELDS = ["title", "content", "excerpt"] as const;

/**
 * Compare two objects and return which tracked fields differ.
 *
 * @param before - The state before the change
 * @param after - The state after the change
 * @returns Array of field names that changed (e.g., ["title", "content"])
 */
export function diffFields(
  before: { title?: string; content?: string; excerpt?: string },
  after: { title?: string; content?: string; excerpt?: string },
): string[] {
  const changed: string[] = [];

  if ((before.title ?? "") !== (after.title ?? "")) {
    changed.push("title");
  }
  if ((before.content ?? "") !== (after.content ?? "")) {
    changed.push("content");
  }
  if ((before.excerpt ?? "") !== (after.excerpt ?? "")) {
    changed.push("excerpt");
  }

  return changed;
}

/**
 * Determine if changes warrant creating a new revision.
 *
 * A revision should NOT be created when:
 *   - No content fields changed (only metadata like isSticky, menuOrder)
 *   - The changedFields array doesn't include any of title, content, excerpt
 *   - The changes are whitespace-only (trimmed values are identical)
 *
 * @param changedFields - Array of field names that changed in the update
 * @param before - The state before the change (for whitespace check)
 * @param after - The state after the change (for whitespace check)
 * @returns true if a revision should be created
 */
export function shouldCreateRevision(
  changedFields: string[],
  before?: { title?: string; content?: string; excerpt?: string },
  after?: { title?: string; content?: string; excerpt?: string },
): boolean {
  // Check if any tracked fields are in the changed list
  const hasTrackedChanges = changedFields.some((field) =>
    (REVISION_TRACKED_FIELDS as readonly string[]).includes(field),
  );

  if (!hasTrackedChanges) return false;

  // If before/after provided, do a whitespace-normalized check
  if (before && after) {
    const normalizedChanges = diffFields(
      {
        title: (before.title ?? "").trim(),
        content: (before.content ?? "").trim(),
        excerpt: (before.excerpt ?? "").trim(),
      },
      {
        title: (after.title ?? "").trim(),
        content: (after.content ?? "").trim(),
        excerpt: (after.excerpt ?? "").trim(),
      },
    );

    return normalizedChanges.length > 0;
  }

  return true;
}
