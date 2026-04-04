import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Id, TableNames } from "@backend/convex/_generated/dataModel";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Type-safe cast for Convex ID strings.
 * Use this instead of `as any` when passing string IDs to Convex mutations/queries.
 *
 * @example
 * // Instead of: commentId as any
 * asId<"comments">(commentId)
 */
export function asId<T extends TableNames>(id: string): Id<T> {
  return id as Id<T>;
}

/**
 * Extract an error message from an unknown error.
 * Handles standard Error objects, Convex error objects with data.message,
 * and falls back to a default message.
 */
export function getErrorMessage(error: unknown, fallback = "An error occurred"): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    typeof (error as { data?: { message?: string } }).data?.message === "string"
  ) {
    return (error as { data: { message: string } }).data.message;
  }
  return fallback;
}

// ─── Date Formatting Utilities ───────────────────────────────────────────────

/**
 * Format a timestamp as a compact relative time string (e.g., "5m ago", "2h ago").
 * Consolidated from multiple duplicate implementations across route files.
 */
export function formatTimeAgo(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Format a timestamp as a short date string (e.g., "Feb 15, 2026").
 * Returns "--" if the timestamp is undefined or falsy.
 */
export function formatDate(ts: number | undefined): string {
  if (!ts) return "--";
  return new Date(ts).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a timestamp as a date + time string (e.g., "Feb 15, 2026, 02:30 PM").
 * Returns "--" if the timestamp is undefined or falsy.
 */
export function formatDateTime(ts: number | undefined): string {
  if (!ts) return "--";
  return new Date(ts).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format a duration in milliseconds as a human-readable string.
 * Examples: "2m 30s", "1h 15m", "45s"
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return "< 1s";

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMins = minutes % 60;
    return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
  }

  if (minutes > 0) {
    const remainingSecs = seconds % 60;
    return remainingSecs > 0 ? `${minutes}m ${remainingSecs}s` : `${minutes}m`;
  }

  return `${seconds}s`;
}
