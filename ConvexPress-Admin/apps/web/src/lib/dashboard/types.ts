/**
 * Dashboard System - Client-Side Types
 *
 * Type definitions for dashboard widgets, preferences, and data shapes.
 */

import type { ComponentType } from "react";

// ─── Widget Definition ──────────────────────────────────────────────────────

/**
 * A widget registered in the dashboard widget registry.
 */
export interface DashboardWidget {
  /** Unique identifier (matches the IDs used in preferences). */
  id: string;
  /** Display title shown in the widget header and Screen Options. */
  title: string;
  /** React component to render the widget body. */
  component: ComponentType;
  /** Default column placement: "primary" (left) or "secondary" (right). */
  defaultColumn: "primary" | "secondary";
  /** Default sort order within its column (lower = higher). */
  defaultOrder: number;
  /** Minimum capability required to see this widget. Undefined = visible to all. */
  minCapability?: string;
}

// ─── Widget Preferences ─────────────────────────────────────────────────────

/**
 * Widget layout and visibility preferences for a user+surface.
 * Mirrors the dashboardPreferences Convex table shape.
 */
export interface WidgetPreferences {
  widgetOrder: {
    primary: string[];
    secondary: string[];
  };
  hiddenWidgets: string[];
  collapsedWidgets: string[];
  welcomeDismissed: boolean;
}

// ─── At a Glance Data ───────────────────────────────────────────────────────

export interface PostCounts {
  publish: number;
  draft: number;
  pending: number;
  future: number;
  private: number;
  trash: number;
  total: number;
}

export interface PageCounts {
  publish: number;
  draft: number;
  pending: number;
  private: number;
  trash: number;
  total: number;
}

export interface CommentCounts {
  approved: number;
  pending: number;
  spam: number;
  trash: number;
  total: number;
}

export interface AtAGlanceData {
  posts: PostCounts | null;
  pages: PageCounts | null;
  comments: CommentCounts | null;
  users: number | null;
}

// ─── Activity Feed Data ─────────────────────────────────────────────────────

export interface RecentPost {
  _id: string;
  title: string;
  publishedAt: number | undefined;
  authorName: string;
}

export interface RecentComment {
  _id: string;
  content: string;
  authorName: string;
  postTitle: string;
  postId: string;
  status: string;
  createdAt: number;
}

export interface ActivityFeedData {
  recentPosts: RecentPost[];
  recentComments: RecentComment[];
}

// ─── Quick Draft Data ───────────────────────────────────────────────────────

export interface QuickDraftItem {
  _id: string;
  title: string;
  excerpt: string;
  createdAt: number;
}

// ─── Widget Column Layout ───────────────────────────────────────────────────

export type WidgetColumn = "primary" | "secondary";
