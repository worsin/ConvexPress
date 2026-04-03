/**
 * Comment System - Helper Functions
 *
 * Shared logic used by comment mutations and queries:
 *   - sanitizeCommentContent  - Strip dangerous HTML, keep allowed tags
 *   - validateCommentDepth    - Check max nesting depth from discussion settings
 *   - canEditComment          - Check if user can edit (owner within window or moderator)
 *   - resolveCommentAuthor    - Build author display info from user record
 *   - getDiscussionSettings   - Fetch discussion settings with fallback defaults
 *   - runModerationPipeline   - Determine initial comment status via moderation rules
 *   - checkFloodProtection    - Enforce minimum interval between comments
 *   - buildCommentTree        - Build threaded comment tree from flat list
 *   - createCommentCore       - Shared core logic for create + reply mutations
 */

import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import {
  DISCUSSION_DEFAULTS,
  MAX_CONTENT_LENGTH,
  MIN_CONTENT_LENGTH,
} from "../comments/validators";
import { currentUserCan, getUserIdentifier } from "./permissions";
import { emitEvent } from "./events";
import { COMMENT_EVENTS, SYSTEM } from "../events/constants";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DiscussionSettingsResolved {
  commentModeration: boolean;
  commentPreviouslyApproved: boolean;
  commentMaxLinks: number;
  moderationKeys: string;
  disallowedKeys: string;
  threadComments: boolean;
  threadCommentsDepth: number;
  pageComments: boolean;
  commentsPerPage: number;
  defaultCommentsPage: "newest" | "oldest";
  commentOrder: "asc" | "desc";
  commentFloodInterval: number;
  commentFlagThreshold: number;
  commentEditGracePeriod: number;
}

export interface CommentTreeNode {
  _id: string;
  postId: string;
  content: string;
  status: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string;
  parentId?: string;
  depth: number;
  likeCount: number;
  flagCount: number;
  isEdited: boolean;
  editedAt?: number;
  createdAt: number;
  updatedAt: number;
  isLikedByMe: boolean;
  /** Whether the current user can edit this comment (owner within grace period) */
  canEdit: boolean;
  replies: CommentTreeNode[];
}

// ─── Content Sanitization ────────────────────────────────────────────────────

/**
 * Allowed HTML tags for comment content.
 * Matches WordPress's allowed comment tags subset.
 */
const ALLOWED_TAGS = new Set(["b", "i", "strong", "em", "a", "code", "pre"]);

/**
 * Sanitize comment content to prevent XSS.
 *
 * Strips all HTML tags except a safe subset (b, i, strong, em, a, code, pre).
 * Removes event handlers, javascript: URLs, and script tags.
 * Trims whitespace.
 *
 * @param content - Raw comment content
 * @returns Sanitized content string
 */
export function sanitizeCommentContent(content: string): string {
  let sanitized = content.trim();

  // Remove script tags and their content entirely
  sanitized = sanitized.replace(/<script[\s\S]*?<\/script>/gi, "");

  // Remove event handler attributes (onclick, onerror, etc.)
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "");
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, "");

  // Remove javascript: protocol in href attributes
  sanitized = sanitized.replace(
    /href\s*=\s*["']?\s*javascript\s*:[^"'>]*/gi,
    'href="#"',
  );

  // Strip disallowed HTML tags (keep allowed ones)
  sanitized = sanitized.replace(
    /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g,
    (match, tagName) => {
      const tag = tagName.toLowerCase();
      if (ALLOWED_TAGS.has(tag)) {
        // For <a> tags, only allow href attribute
        if (tag === "a") {
          const hrefMatch = match.match(/href\s*=\s*["']([^"']*)["']/i);
          if (match.startsWith("</")) {
            return "</a>";
          }
          if (hrefMatch) {
            const href = hrefMatch[1];
            // Only allow http/https URLs
            if (/^https?:\/\//i.test(href)) {
              return `<a href="${href}" rel="nofollow noopener">`;
            }
          }
          return `<a rel="nofollow noopener">`;
        }
        // For other allowed tags, strip all attributes
        if (match.startsWith("</")) {
          return `</${tag}>`;
        }
        return `<${tag}>`;
      }
      return ""; // Strip disallowed tags entirely
    },
  );

  return sanitized;
}

// ─── Discussion Settings ─────────────────────────────────────────────────────

/**
 * Fetch discussion settings from the Settings System.
 * Falls back to hardcoded defaults if Settings System is unavailable.
 *
 * Maps the Settings System's field names to Comment System's internal names.
 */
export async function getDiscussionSettings(
  ctx: QueryCtx | MutationCtx,
): Promise<DiscussionSettingsResolved> {
  try {
    const doc = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "discussion"))
      .unique();

    if (!doc || !doc.values) {
      return { ...DISCUSSION_DEFAULTS };
    }

    const vals = doc.values as Record<string, unknown>;

    return {
      commentModeration:
        (vals.manualApprovalRequired as boolean) ??
        DISCUSSION_DEFAULTS.commentModeration,
      commentPreviouslyApproved:
        (vals.previouslyApprovedRequired as boolean) ??
        DISCUSSION_DEFAULTS.commentPreviouslyApproved,
      commentMaxLinks:
        (vals.holdIfLinksExceed as number) ??
        DISCUSSION_DEFAULTS.commentMaxLinks,
      moderationKeys:
        (vals.moderationWordList as string) ??
        DISCUSSION_DEFAULTS.moderationKeys,
      disallowedKeys:
        (vals.disallowedWordList as string) ??
        DISCUSSION_DEFAULTS.disallowedKeys,
      threadComments:
        (vals.enableThreadedComments as boolean) ??
        DISCUSSION_DEFAULTS.threadComments,
      threadCommentsDepth:
        (vals.threadedCommentsDepth as number) ??
        DISCUSSION_DEFAULTS.threadCommentsDepth,
      pageComments:
        (vals.enablePaginatedComments as boolean) ??
        DISCUSSION_DEFAULTS.pageComments,
      commentsPerPage:
        (vals.commentsPerPage as number) ??
        DISCUSSION_DEFAULTS.commentsPerPage,
      defaultCommentsPage:
        (vals.defaultCommentsPage as "newest" | "oldest") ??
        DISCUSSION_DEFAULTS.defaultCommentsPage,
      commentOrder:
        (vals.commentOrder as "asc" | "desc") ??
        DISCUSSION_DEFAULTS.commentOrder,
      commentFloodInterval:
        (vals.commentFloodInterval as number) ??
        DISCUSSION_DEFAULTS.commentFloodInterval,
      commentFlagThreshold:
        (vals.commentFlagThreshold as number) ??
        DISCUSSION_DEFAULTS.commentFlagThreshold,
      commentEditGracePeriod:
        (vals.commentEditGracePeriod as number) ??
        DISCUSSION_DEFAULTS.commentEditGracePeriod,
    };
  } catch {
    // Settings System not available - use defaults
    return { ...DISCUSSION_DEFAULTS };
  }
}

// ─── Depth Validation ────────────────────────────────────────────────────────

/**
 * Validate and resolve the depth for a new comment.
 *
 * If parentId is provided, calculates depth as parent.depth + 1.
 * If this exceeds the max depth, clamps to max depth and re-parents
 * to the deepest allowed ancestor (walks up the chain).
 *
 * @returns Object with resolved parentId and depth
 */
export async function resolveCommentDepth(
  ctx: QueryCtx | MutationCtx,
  parentId: Id<"comments"> | undefined,
  settings: DiscussionSettingsResolved,
): Promise<{ resolvedParentId: Id<"comments"> | undefined; depth: number }> {
  if (!parentId || !settings.threadComments) {
    return { resolvedParentId: undefined, depth: 0 };
  }

  const parent = await ctx.db.get("comments", parentId);
  if (!parent) {
    return { resolvedParentId: undefined, depth: 0 };
  }

  const maxDepth = Math.max(1, Math.min(10, settings.threadCommentsDepth));
  const newDepth = parent.depth + 1;

  if (newDepth <= maxDepth) {
    return { resolvedParentId: parentId, depth: newDepth };
  }

  // Depth exceeds max - walk up the parent chain to find the deepest
  // allowed ancestor, then re-parent to that ancestor's child at max depth
  let currentComment = parent;
  while (currentComment.depth >= maxDepth && currentComment.parentId) {
    const grandparent = await ctx.db.get("comments", currentComment.parentId);
    if (!grandparent) break;
    currentComment = grandparent;
  }

  return {
    resolvedParentId: currentComment._id as Id<"comments">,
    depth: Math.min(newDepth, maxDepth),
  };
}

// ─── Edit Permission Check ───────────────────────────────────────────────────

/**
 * Check if a user can edit a specific comment.
 *
 * Rules:
 *   1. Own comment within grace period -> allowed (requires edit_own_comments capability)
 *   2. Own comment past grace period -> requires moderate_comments
 *   3. Other user's comment -> requires moderate_comments
 *
 * @returns Object with `allowed` boolean and `reason` string
 */
export function canEditComment(
  comment: { authorId: string; createdAt: number; status: string },
  userId: string,
  userCapabilities: string[],
  gracePeriodSeconds: number,
): { allowed: boolean; reason: string } {
  // Cannot edit trashed or spam comments (moderators use approve/restore instead)
  if (comment.status === "trash" || comment.status === "spam") {
    return { allowed: false, reason: "Cannot edit a comment in trash or spam" };
  }

  const isModerator = userCapabilities.includes("moderate_comments");
  const isOwner = comment.authorId === userId;

  // Moderators can always edit
  if (isModerator) {
    return { allowed: true, reason: "Moderator" };
  }

  // Non-owner without moderate capability
  if (!isOwner) {
    return { allowed: false, reason: "Only moderators can edit others' comments" };
  }

  // Owner - check grace period
  const elapsedMs = Date.now() - comment.createdAt;
  const gracePeriodMs = gracePeriodSeconds * 1000;

  if (elapsedMs <= gracePeriodMs) {
    return { allowed: true, reason: "Within grace period" };
  }

  return { allowed: false, reason: "Grace period has expired" };
}

// ─── Author Resolution ───────────────────────────────────────────────────────

/**
 * Build author display info from a user document.
 * Used to denormalize author data when creating comments.
 */
export function resolveCommentAuthor(user: {
  _id: string;
  clerkUserId?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  email: string;
  avatarUrl?: string;
  profilePictureUrl?: string;
}): { authorId: string; authorName: string; authorAvatarUrl?: string } {
  const authorName =
    user.displayName ||
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.email;

  return {
    authorId: getUserIdentifier(user as any),
    authorName,
    authorAvatarUrl: user.avatarUrl || user.profilePictureUrl || undefined,
  };
}

// ─── Moderation Pipeline ─────────────────────────────────────────────────────

/**
 * Run the moderation pipeline to determine the initial status for a new comment.
 *
 * Pipeline order (mirrors WordPress):
 *   1. Is commenter a moderator? -> auto-approve
 *   2. Content matches disallowed_keys? -> spam
 *   3. All comments require manual approval? -> pending
 *   4. Content matches moderation_keys? -> pending
 *   5. Content has too many links? -> pending
 *   6. Previously-approved required AND no prior approved comments? -> pending
 *   7. All checks passed -> approved
 *
 * @returns The determined status: "approved", "pending", or "spam"
 */
export async function runModerationPipeline(
  ctx: QueryCtx | MutationCtx,
  content: string,
  authorId: string,
  authorName: string,
  isModerator: boolean,
  settings: DiscussionSettingsResolved,
): Promise<"approved" | "pending" | "spam"> {
  // 1. Moderators always get auto-approved
  if (isModerator) {
    return "approved";
  }

  const lowerContent = content.toLowerCase();
  const lowerAuthorName = authorName.toLowerCase();

  // 2. Check disallowed keys (auto-spam)
  if (settings.disallowedKeys.trim()) {
    const disallowedWords = settings.disallowedKeys
      .split("\n")
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean);

    for (const word of disallowedWords) {
      if (matchesWord(lowerContent, word) || matchesWord(lowerAuthorName, word)) {
        return "spam";
      }
    }
  }

  // 3. All comments require manual approval
  if (settings.commentModeration) {
    return "pending";
  }

  // 4. Check moderation keys (hold for moderation)
  if (settings.moderationKeys.trim()) {
    const moderationWords = settings.moderationKeys
      .split("\n")
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean);

    for (const word of moderationWords) {
      if (matchesWord(lowerContent, word) || matchesWord(lowerAuthorName, word)) {
        return "pending";
      }
    }
  }

  // 5. Check link count
  const linkCount = countLinks(content);
  if (linkCount >= settings.commentMaxLinks) {
    return "pending";
  }

  // 6. Previously-approved check
  if (settings.commentPreviouslyApproved) {
    const priorApproved = await ctx.db
      .query("comments")
      .withIndex("by_author", (q) => q.eq("authorId", authorId))
      .first();

    // Check if any of the author's previous comments are approved
    if (!priorApproved) {
      return "pending";
    }

    const hasApproved = priorApproved.status === "approved";
    if (!hasApproved) {
      // Query more to check if any are approved
      const allByAuthor = await ctx.db
        .query("comments")
        .withIndex("by_author", (q) => q.eq("authorId", authorId))
        .collect();

      const anyApproved = allByAuthor.some((c) => c.status === "approved");
      if (!anyApproved) {
        return "pending";
      }
    }
  }

  // 7. All checks passed
  return "approved";
}

/**
 * Case-insensitive whole-word matching.
 * Supports multi-word phrases (e.g., "bad phrase").
 */
function matchesWord(text: string, word: string): boolean {
  if (!word) return false;

  // Escape special regex characters in the word
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Use word boundary matching
  const regex = new RegExp(`\\b${escaped}\\b`, "i");
  return regex.test(text);
}

/**
 * Count URLs in content.
 * Counts http:// and https:// URLs, as well as href attributes.
 */
function countLinks(content: string): number {
  const urlPattern = /https?:\/\//gi;
  const matches = content.match(urlPattern);
  return matches ? matches.length : 0;
}

// ─── Flood Protection ────────────────────────────────────────────────────────

/**
 * Check if the user is within the flood protection interval.
 *
 * @returns null if allowed, or the number of remaining seconds to wait
 */
export async function checkFloodProtection(
  ctx: QueryCtx | MutationCtx,
  authorId: string,
  intervalSeconds: number,
): Promise<number | null> {
  if (intervalSeconds <= 0) return null;

  // Find the user's most recent comment
  const recentComments = await ctx.db
    .query("comments")
    .withIndex("by_author", (q) => q.eq("authorId", authorId))
    .order("desc")
    .take(1);

  if (recentComments.length === 0) return null;

  const lastComment = recentComments[0];
  const elapsedMs = Date.now() - lastComment.createdAt;
  const intervalMs = intervalSeconds * 1000;

  if (elapsedMs < intervalMs) {
    const remainingSeconds = Math.ceil((intervalMs - elapsedMs) / 1000);
    return remainingSeconds;
  }

  return null;
}

// ─── Delete Comment and Related Records ──────────────────────────────────────

/**
 * Delete a comment and all its related records (meta, likes, flags).
 * Pure data deletion with no events or side effects.
 * Shared across mutations.ts and internals.ts.
 */
export async function deleteCommentAndRelated(
  ctx: MutationCtx,
  commentId: Id<"comments">,
): Promise<void> {
  // Delete all commentMeta
  const metaRecords = await ctx.db
    .query("commentMeta")
    .withIndex("by_comment", (q) => q.eq("commentId", commentId))
    .collect();
  for (const meta of metaRecords) {
    await ctx.db.delete("commentMeta", meta._id);
  }

  // Delete all commentLikes
  const likeRecords = await ctx.db
    .query("commentLikes")
    .withIndex("by_comment", (q) => q.eq("commentId", commentId))
    .collect();
  for (const likeRecord of likeRecords) {
    await ctx.db.delete("commentLikes", likeRecord._id);
  }

  // Delete all commentFlags
  const flagRecords = await ctx.db
    .query("commentFlags")
    .withIndex("by_comment", (q) => q.eq("commentId", commentId))
    .collect();
  for (const flag of flagRecords) {
    await ctx.db.delete("commentFlags", flag._id);
  }

  // Delete the comment itself
  await ctx.db.delete("comments", commentId);
}

// ─── Tree Builder ────────────────────────────────────────────────────────────

/**
 * Options for building the comment tree.
 */
export interface BuildCommentTreeOptions {
  /** Set of comment IDs the current user has liked */
  likedCommentIds: Set<string>;
  /** Current user's identifier string (for canEdit check) */
  currentUserId?: string;
  /** Grace period in seconds for editing own comments (default: 300 = 5 minutes) */
  gracePeriodSeconds?: number;
}

/**
 * Build a threaded comment tree from a flat list of comments.
 *
 * Two-pass algorithm:
 *   1. Create node map (each comment becomes a tree node with empty replies array)
 *   2. Build tree (attach children to parents, orphans become top-level)
 *
 * @param comments - Flat array of comment documents
 * @param options - Options including likedCommentIds, currentUserId, gracePeriodSeconds
 * @returns Array of top-level CommentTreeNode with nested replies
 */
export function buildCommentTree(
  comments: Array<{
    _id: string;
    postId: string;
    content: string;
    status: string;
    authorId: string;
    authorName: string;
    authorAvatarUrl?: string;
    parentId?: string;
    depth: number;
    likeCount: number;
    flagCount: number;
    isEdited: boolean;
    editedAt?: number;
    createdAt: number;
    updatedAt: number;
  }>,
  options: BuildCommentTreeOptions,
): CommentTreeNode[] {
  const { likedCommentIds, currentUserId, gracePeriodSeconds = 300 } = options;
  const now = Date.now();
  const gracePeriodMs = gracePeriodSeconds * 1000;
  const map = new Map<string, CommentTreeNode>();
  const roots: CommentTreeNode[] = [];

  // First pass: create nodes
  for (const comment of comments) {
    const id = comment._id.toString();

    // Compute canEdit: owner within grace period, not trashed/spam
    let canEdit = false;
    if (currentUserId && comment.authorId === currentUserId) {
      const elapsedMs = now - comment.createdAt;
      const isWithinGracePeriod = elapsedMs <= gracePeriodMs;
      const isEditableStatus = comment.status !== "trash" && comment.status !== "spam";
      canEdit = isWithinGracePeriod && isEditableStatus;
    }

    map.set(id, {
      _id: id,
      postId: comment.postId.toString(),
      content: comment.content,
      status: comment.status,
      authorId: comment.authorId,
      authorName: comment.authorName,
      authorAvatarUrl: comment.authorAvatarUrl,
      parentId: comment.parentId?.toString(),
      depth: comment.depth,
      likeCount: comment.likeCount,
      flagCount: comment.flagCount,
      isEdited: comment.isEdited,
      editedAt: comment.editedAt,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      isLikedByMe: likedCommentIds.has(id),
      canEdit,
      replies: [],
    });
  }

  // Second pass: build tree
  for (const comment of comments) {
    const id = comment._id.toString();
    const node = map.get(id)!;

    if (comment.parentId) {
      const parentId = comment.parentId.toString();
      const parent = map.get(parentId);
      if (parent) {
        parent.replies.push(node);
      } else {
        // Orphaned reply becomes top-level
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}

// ─── Shared Comment Creation Core ─────────────────────────────────────────

/**
 * Parameters for the shared comment creation logic.
 */
export interface CreateCommentCoreParams {
  /** The post the comment belongs to (already validated as published + open) */
  postId: Id<"posts">;
  /** The post document (for commentCount update) */
  post: { commentCount?: number };
  /** Raw comment content (will be validated and sanitized) */
  content: string;
  /** The authenticated user creating the comment */
  user: {
    _id: string;
    clerkUserId?: string;
    displayName?: string;
    firstName?: string;
    lastName?: string;
    email: string;
    profilePictureUrl?: string;
  };
  /** Optional parent comment ID for threading */
  parentId?: Id<"comments">;
  /** Optional user agent string to store in commentMeta */
  userAgent?: string;
  /** Optional IP address to store in commentMeta */
  ipAddress?: string;
}

/**
 * Core comment creation logic shared between `create` and `reply` mutations.
 *
 * Handles:
 *   1. Content validation + sanitization
 *   2. Discussion settings fetch
 *   3. Flood protection check
 *   4. Threading depth resolution
 *   5. Moderation pipeline (determines initial status)
 *   6. Author data denormalization
 *   7. Comment record insertion
 *   8. CommentMeta storage (user agent, IP)
 *   9. Post commentCount update (if approved)
 *   10. Event emission (comment.created + comment.replied if parentId)
 *
 * The caller is responsible for:
 *   - Authentication and capability checks
 *   - Fetching and validating the post (exists, published, open)
 *   - Validating the parent comment (if reply)
 *
 * @returns { commentId, status }
 */
export async function createCommentCore(
  ctx: MutationCtx,
  params: CreateCommentCoreParams,
): Promise<{ commentId: Id<"comments">; status: "approved" | "pending" | "spam" }> {
  const { postId, post, content, user, parentId, userAgent, ipAddress } = params;

  // ── Validate content ────────────────────────────────────────────────
  const trimmed = content.trim();
  if (trimmed.length < MIN_CONTENT_LENGTH) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Comment content cannot be empty",
    });
  }
  if (trimmed.length > MAX_CONTENT_LENGTH) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: `Comment content must be ${MAX_CONTENT_LENGTH} characters or fewer`,
    });
  }
  const sanitizedContent = sanitizeCommentContent(trimmed);

  // ── Get discussion settings ─────────────────────────────────────────
  const settings = await getDiscussionSettings(ctx);

  // ── Flood protection ────────────────────────────────────────────────
  const userIdentifier = getUserIdentifier(user as any);
  const floodWait = await checkFloodProtection(
    ctx,
    userIdentifier,
    settings.commentFloodInterval,
  );
  if (floodWait !== null) {
    throw new ConvexError({
      code: "RATE_LIMITED",
      message: `Please wait ${floodWait} seconds before posting another comment`,
      retryAfter: floodWait,
    });
  }

  // ── Resolve threading depth ─────────────────────────────────────────
  const { resolvedParentId, depth } = await resolveCommentDepth(
    ctx,
    parentId,
    settings,
  );

  // ── Moderation pipeline ─────────────────────────────────────────────
  const isModerator = await currentUserCan(ctx, "comment.approve");
  const status = await runModerationPipeline(
    ctx,
    sanitizedContent,
    userIdentifier,
    user.displayName ?? user.email,
    isModerator,
    settings,
  );

  // ── Denormalize author data ─────────────────────────────────────────
  const { authorId, authorName, authorAvatarUrl } = resolveCommentAuthor({
    _id: user._id,
    clerkUserId: user.clerkUserId,
    displayName: user.displayName,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    profilePictureUrl: user.profilePictureUrl,
  });

  // ── Insert comment record ──────────────────────────────────────────
  const now = Date.now();
  const commentId = await ctx.db.insert("comments", {
    postId,
    content: sanitizedContent,
    status,
    authorId,
    authorName,
    authorAvatarUrl,
    parentId: resolvedParentId,
    depth,
    likeCount: 0,
    flagCount: 0,
    isEdited: false,
    createdAt: now,
    updatedAt: now,
  });

  // ── Store commentMeta (user agent + IP address) ────────────────────
  if (userAgent) {
    await ctx.db.insert("commentMeta", {
      commentId,
      key: "_user_agent",
      value: userAgent,
    });
  }
  if (ipAddress) {
    await ctx.db.insert("commentMeta", {
      commentId,
      key: "_ip_address",
      value: ipAddress,
    });
  }

  // ── Update post comment count if approved ───────────────────────────
  if (status === "approved") {
    const currentCount = post.commentCount ?? 0;
    await ctx.db.patch("posts", postId, {
      commentCount: currentCount + 1,
    });
  }

  // ── Emit comment.created event ─────────────────────────────────────
  await emitEvent(ctx, COMMENT_EVENTS.CREATED, SYSTEM.COMMENT, {
    commentId,
    postId,
    authorId,
    content: sanitizedContent,
    status,
    parentId: resolvedParentId?.toString(),
  });

  // ── If this is a reply, also emit the replied event ────────────────
  if (resolvedParentId) {
    await emitEvent(ctx, COMMENT_EVENTS.REPLIED, SYSTEM.COMMENT, {
      commentId,
      parentCommentId: resolvedParentId,
      postId,
      authorId,
    });
  }

  return { commentId, status };
}
