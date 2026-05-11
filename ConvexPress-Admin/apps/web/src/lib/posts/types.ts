/**
 * Post System - Frontend TypeScript Types
 *
 * Types matching the Convex schema for posts and postMeta.
 * Used by all admin components, hooks, and routes dealing with posts.
 */

import type { Id } from "@backend/convex/_generated/dataModel";

// ─── Post Status & Enums ────────────────────────────────────────────────────

export type PostStatus =
  | "auto-draft"
  | "draft"
  | "pending"
  | "publish"
  | "future"
  | "private"
  | "trash";

export type PostVisibility = "public" | "private" | "password";

export type CommentStatus = "open" | "closed";

export type PostType = "post" | "page";

// ─── Post Document ──────────────────────────────────────────────────────────

/** The post document as returned from Convex queries. */
export interface Post {
  _id: Id<"posts">;
  _creationTime: number;
  type: PostType;
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  status: PostStatus;
  authorId: Id<"users">;
  visibility: PostVisibility;
  password?: string;
  publishedAt?: number;
  scheduledAt?: number;
  commentStatus: CommentStatus;
  commentCount: number;
  isSticky: boolean;
  menuOrder?: number;
  featuredImageId?: Id<"media">;
  previousStatus?: string;
  trashedAt?: number;
  createdAt: number;
  updatedAt: number;
  autosaveContent?: string;
  autosaveTitle?: string;
  autosavedAt?: number;
}

// ─── Post With Author ───────────────────────────────────────────────────────

/** Author info denormalized into post query responses. */
export interface PostAuthor {
  _id: Id<"users">;
  displayName: string;
  email: string;
  avatarUrl?: string;
  slug?: string;
  bio?: string;
}

/** Post document with denormalized author data (from admin list/get queries). */
export interface PostWithAuthor extends Post {
  author: PostAuthor | null;
  isPasswordProtected?: boolean;
}

// ─── PostMeta ───────────────────────────────────────────────────────────────

export interface PostMeta {
  _id: Id<"postMeta">;
  postId: Id<"posts">;
  key: string;
  value: string;
}

// ─── Query Results ──────────────────────────────────────────────────────────

/** Paginated post list result from posts.list query. */
export interface PostListResult {
  posts: PostWithAuthor[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

/** Status counts from posts.counts query. */
export interface PostCounts {
  all: number;
  publish: number;
  draft: number;
  pending: number;
  future: number;
  private: number;
  trash: number;
  mine: number;
}

// ─── Filter Params ──────────────────────────────────────────────────────────

/** Parameters for the posts.list query. */
export interface PostListParams {
  type?: PostType;
  status?: PostStatus;
  authorId?: Id<"users">;
  search?: string;
  page?: number;
  perPage?: number;
  orderBy?: "publishedAt" | "updatedAt" | "title" | "createdAt";
  orderDir?: "asc" | "desc";
}
