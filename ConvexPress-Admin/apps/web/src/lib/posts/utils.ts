/**
 * Post System - Frontend Utilities
 *
 * Client-side helper functions for post data display and manipulation.
 */

import type { PostStatus } from "./types";
import { STATUS_LABELS, STATUS_TEXT_CLASSES, STATUS_BG_CLASSES } from "./constants";

// ─── Date Formatting ────────────────────────────────────────────────────────

/**
 * Format a timestamp for post display.
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @param options - Intl.DateTimeFormat options override
 * @returns Formatted date string (e.g., "Feb 8, 2026")
 */
export function formatPostDate(
  timestamp: number | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!timestamp) return "--";
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...options,
  });
}

/**
 * Format a timestamp with time for detailed views.
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted datetime string (e.g., "Feb 8, 2026 at 2:30 PM")
 */
export function formatPostDateTime(timestamp: number | undefined): string {
  if (!timestamp) return "--";
  const date = new Date(timestamp);
  const datePart = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const timePart = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart} at ${timePart}`;
}

// ─── Excerpt Generation ─────────────────────────────────────────────────────

/**
 * Generate an auto-excerpt from post content.
 *
 * Strips HTML/block tags and trims to the specified character limit.
 *
 * @param content - Raw post content (block editor JSON or HTML)
 * @param maxLength - Maximum character count (default: 150)
 * @returns Plain text excerpt
 */
export function generateExcerpt(content: string, maxLength: number = 150): string {
  if (!content) return "";

  // Try to parse as block editor JSON
  let plainText = content;
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      plainText = parsed
        .map((block: unknown) => {
          if (typeof block === "string") return block;
          const b = block as Record<string, unknown>;
          if (typeof b.text === "string") return b.text;
          if (b.content) {
            if (typeof b.content === "string") return b.content;
            if (Array.isArray(b.content)) {
              return b.content.map((c: Record<string, unknown>) => (typeof c.text === "string" ? c.text : "")).join("");
            }
          }
          return "";
        })
        .join(" ");
    }
  } catch {
    // Not JSON - treat as HTML/plain text
    plainText = content.replace(/<[^>]*>/g, " ");
  }

  // Clean up whitespace
  plainText = plainText.replace(/\s+/g, " ").trim();

  if (plainText.length <= maxLength) return plainText;
  return plainText.slice(0, maxLength).replace(/\s+\S*$/, "") + "...";
}

// ─── Read Time ──────────────────────────────────────────────────────────────

/**
 * Calculate estimated read time for a post.
 *
 * Uses average reading speed of 200 words per minute.
 *
 * @param content - Raw post content
 * @returns Read time string (e.g., "3 min read")
 */
export function calculateReadTime(content: string): string {
  if (!content) return "1 min read";

  // Strip HTML tags and count words
  const plainText = content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const wordCount = plainText.split(" ").filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(wordCount / 200));

  return `${minutes} min read`;
}

// ─── Status Helpers ─────────────────────────────────────────────────────────

/**
 * Get the human-readable label for a post status.
 */
export function getStatusLabel(status: PostStatus): string {
  return STATUS_LABELS[status] ?? status;
}

/**
 * Get CSS text color class for a post status.
 */
export function getStatusTextClass(status: PostStatus): string {
  return STATUS_TEXT_CLASSES[status] ?? "text-muted-foreground";
}

/**
 * Get CSS background color class for a post status.
 */
export function getStatusBgClass(status: PostStatus): string {
  return STATUS_BG_CLASSES[status] ?? "bg-muted";
}

// ─── Date Label ─────────────────────────────────────────────────────────────

/**
 * Get the contextual date label for a post's status.
 *
 * @returns "Published", "Scheduled", "Last Modified", etc.
 */
export function getDateLabel(status: PostStatus): string {
  switch (status) {
    case "publish":
      return "Published";
    case "future":
      return "Scheduled";
    case "trash":
      return "Trashed";
    default:
      return "Last Modified";
  }
}

/**
 * Get the most relevant date for a post based on its status.
 */
export function getRelevantDate(post: {
  status: string;
  publishedAt?: number;
  scheduledAt?: number;
  trashedAt?: number;
  updatedAt: number;
}): number {
  switch (post.status) {
    case "publish":
      return post.publishedAt ?? post.updatedAt;
    case "future":
      return post.scheduledAt ?? post.updatedAt;
    case "trash":
      return post.trashedAt ?? post.updatedAt;
    default:
      return post.updatedAt;
  }
}
