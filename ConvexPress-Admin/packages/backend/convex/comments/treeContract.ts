/**
 * Comment System - Threaded Tree Transport
 *
 * Exact return shape of `comments.queries.forPost`.
 *
 * Convex validators cannot recurse, so the threaded tree is described by
 * unrolling the node shape `COMMENT_TREE_LEVELS` times; a node on the last
 * level accepts only an empty `replies` array. `forPost` caps its tree with
 * `capCommentTreeDepth` using the same level count, so the returned value
 * always matches. The node's TypeScript type stays the recursive
 * `CommentTreeNode`: every unrolled level is checked against that shape.
 */
import { v, type Validator } from "convex/values";
import { commentStatusValidator } from "../schema/posts";
import type { CommentTreeNode } from "../helpers/comment";

/**
 * Deepest stored comment depth the threading rules allow
 * (`resolveCommentDepth` clamps `threadCommentsDepth` to 1-10).
 */
export const MAX_THREAD_DEPTH = 10;

/** Tree levels a `forPost` result carries: depths 0 through MAX_THREAD_DEPTH. */
export const COMMENT_TREE_LEVELS = MAX_THREAD_DEPTH + 1;

function commentTreeNodeShape(
  replies: Validator<CommentTreeNode[], "required", string>,
): Validator<CommentTreeNode, "required", string> {
  return v.object({
    _id: v.string(),
    postId: v.string(),
    content: v.string(),
    status: v.string(),
    authorId: v.string(),
    authorName: v.string(),
    authorAvatarUrl: v.optional(v.string()),
    parentId: v.optional(v.string()),
    depth: v.number(),
    likeCount: v.number(),
    flagCount: v.number(),
    isEdited: v.boolean(),
    editedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    isLikedByMe: v.boolean(),
    canEdit: v.boolean(),
    replies,
  });
}

// An empty union accepts no element values, so the deepest replies array must be empty.
let commentTreeNodeValidator = commentTreeNodeShape(v.array(v.union()));
for (let level = 1; level < COMMENT_TREE_LEVELS; level++) {
  commentTreeNodeValidator = commentTreeNodeShape(v.array(commentTreeNodeValidator));
}

/** Exact transport for `comments.queries.forPost`. */
export const forPostResultValidator = v.object({
  comments: v.array(commentTreeNodeValidator),
  total: v.number(),
  page: v.number(),
  perPage: v.number(),
  totalPages: v.number(),
  /** Absent when the post is missing or not published. */
  commentStatus: v.optional(commentStatusValidator),
});

/** Every descendant of `nodes` in display (pre-)order, each with its replies detached. */
function detachDescendants(nodes: CommentTreeNode[]): CommentTreeNode[] {
  const flat: CommentTreeNode[] = [];
  for (const node of nodes) {
    const replies = node.replies;
    node.replies = [];
    flat.push(node, ...detachDescendants(replies));
  }
  return flat;
}

/**
 * Fit a comment tree into `levels` levels without losing comments.
 *
 * Replies nested below the last level are lifted to that level and listed
 * directly after their ancestor, in thread order - the same way WordPress
 * displays comments deeper than its thread depth, and the same placement
 * `resolveCommentDepth` gives a new reply that would exceed the maximum depth.
 */
export function capCommentTreeDepth(nodes: CommentTreeNode[], levels: number): CommentTreeNode[] {
  if (levels <= 1) return detachDescendants(nodes);
  for (const node of nodes) node.replies = capCommentTreeDepth(node.replies, levels - 1);
  return nodes;
}
