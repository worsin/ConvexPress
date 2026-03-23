/**
 * RSS/Feed System - Client-Side TypeScript Types
 *
 * Type definitions for feed configuration and feed data structures
 * used by the website frontend's feed-serving API routes and the
 * FeedDiscoveryHead component.
 *
 * These mirror/re-export the types from the backend helpers for
 * use in the ConvexPress-Website context.
 */

// ─── Feed Configuration ─────────────────────────────────────────────────────

export interface FeedConfig {
  siteTitle: string;
  siteDescription: string;
  siteUrl: string;
  language: string;
  feedItemCount: number;
  feedContentDisplay: "full" | "summary";
}

// ─── Feed Item Types (mirrored from backend feedXml.ts) ─────────────────────

export interface RssFeedItem {
  title: string;
  link: string;
  guid: string;
  pubDate: number;
  creator: string;
  categories: string[];
  description: string;
  contentEncoded: string;
  commentCount: number;
  commentsUrl: string;
  enclosure?: {
    url: string;
    length: number;
    type: string;
  };
}

export interface AtomFeedEntry {
  title: string;
  link: string;
  id: string;
  published: number;
  updated: number;
  author: { name: string };
  categories: Array<{ term: string; label: string }>;
  summary: string;
  content: string;
  enclosure?: { href: string; type: string; length: number };
}

export interface CommentFeedItem {
  title: string;
  link: string;
  guid: string;
  pubDate: number;
  creator: string;
  description: string;
}

// ─── External Feed Types ────────────────────────────────────────────────────

export interface ExternalFeed {
  feed: {
    title: string;
    description: string;
    link: string;
    lastUpdated: number;
    format: "rss2" | "atom";
  };
  items: Array<{
    title: string;
    link: string;
    description: string;
    content: string;
    publishedAt: number;
    author: string;
    categories: string[];
    guid: string;
  }>;
}

// ─── Feed Type Enums ────────────────────────────────────────────────────────

export type FeedType =
  | "main"
  | "category"
  | "tag"
  | "author"
  | "comments"
  | "postComments";

export type FeedFormat = "rss2" | "atom";

// ─── Enriched Post (from feed queries) ──────────────────────────────────────

export interface EnrichedFeedPost {
  _id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  status: string;
  publishedAt: number;
  updatedAt: number;
  commentStatus: string;
  commentCount: number;
  authorName: string;
  authorSlug: string;
  categories: string[];
  tags: string[];
  featuredImageUrl?: string;
  featuredImageMimeType?: string;
  featuredImageSize?: number;
}

// ─── Enriched Comment (from feed queries) ───────────────────────────────────

export interface EnrichedFeedComment {
  _id: string;
  content: string;
  authorName: string;
  createdAt: number;
  updatedAt: number;
  postTitle: string;
  postSlug: string;
}

export interface PostCommentData {
  _id: string;
  content: string;
  authorName: string;
  createdAt: number;
  updatedAt: number;
}
