/**
 * Revision System - Shared Argument Validators
 *
 * Reusable Convex argument validators for revision mutations and queries.
 * Centralizes validation logic so mutations and queries stay clean.
 *
 * Convention: each exported object is an args shape (Record<string, Validator>)
 * ready to spread into a Convex function's `args` field.
 */

import { v } from "convex/values";
import {
  revisionTypeValidator,
  revisionParentTypeValidator,
} from "../schema/revisions";

// ─── Re-exports for convenience ──────────────────────────────────────────────

export { revisionTypeValidator, revisionParentTypeValidator };

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum title length in characters (matches Post System). */
export const MAX_TITLE_LENGTH = 500;

/** Maximum excerpt length in characters (matches Post System). */
export const MAX_EXCERPT_LENGTH = 1000;

/** Default maximum revisions per post. Oldest manual revisions pruned when exceeded. */
export const DEFAULT_MAX_REVISIONS = 25;

/** Default items per page for revision listings. */
export const DEFAULT_REVISION_LIMIT = 50;

/** Maximum items per page for revision listings. */
export const MAX_REVISION_LIMIT = 200;

// ─── Mutation Args ──────────────────────────────────────────────────────────

/**
 * Arguments for restoring a revision.
 */
export const restoreRevisionArgs = {
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  revisionId: v.id("revisions"),
};

/**
 * Arguments for deleting a single revision.
 */
export const deleteRevisionArgs = {
  revisionId: v.id("revisions"),
};

/**
 * Arguments for deleting all revisions for a post.
 */
export const deleteAllForPostArgs = {
  parentId: v.id("posts"),
};

// ─── Query Args ─────────────────────────────────────────────────────────────

/**
 * Arguments for listing revisions by parent post.
 */
export const listByPostArgs = {
  parentId: v.id("posts"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  type: v.optional(revisionTypeValidator),
  limit: v.optional(v.number()),
};

/**
 * Arguments for getting a single revision.
 */
export const getRevisionArgs = {
  revisionId: v.id("revisions"),
};

/**
 * Arguments for comparing two revisions.
 */
export const compareRevisionsArgs = {
  leftRevisionId: v.id("revisions"),
  rightRevisionId: v.id("revisions"),
};

/**
 * Arguments for counting revisions for a post.
 */
export const countRevisionsArgs = {
  parentId: v.id("posts"),
};

/**
 * Arguments for getting the latest revision for a post.
 */
export const getLatestRevisionArgs = {
  parentId: v.id("posts"),
  type: v.optional(revisionTypeValidator),
};

// ─── Internal Function Args ─────────────────────────────────────────────────

/**
 * Arguments for the internal createOnSave function.
 * Called by Post System before applying updates.
 */
export const createOnSaveArgs = {
  parentId: v.id("posts"),
  parentType: revisionParentTypeValidator,
  title: v.string(),
  content: v.string(),
  excerpt: v.optional(v.string()),
  authorId: v.string(),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  changedFields: v.array(v.string()),
};

/**
 * Arguments for the internal createAutosave function.
 * Called by Content Editor System at 5-minute intervals.
 */
export const createAutosaveArgs = {
  parentId: v.id("posts"),
  parentType: revisionParentTypeValidator,
  title: v.string(),
  content: v.string(),
  excerpt: v.optional(v.string()),
  authorId: v.string(),
};

/**
 * Arguments for the internal deleteByParent function.
 * Called by Post System on permanent delete.
 */
export const deleteByParentArgs = {
  parentId: v.id("posts"),
};

/**
 * Arguments for the internal prune function.
 */
export const pruneArgs = {
  parentId: v.optional(v.id("posts")),
  maxRevisions: v.optional(v.number()),
};
