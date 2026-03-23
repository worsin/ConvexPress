/**
 * Shared formatting utilities for the SmithHarper website app.
 * Centralized to avoid duplication across dashboard components.
 */

/**
 * Extracts a user-facing message from a Convex or standard error.
 * Handles the Convex ConvexError shape `{ data: { message: string } }`
 * as well as standard Error instances and unknown throws.
 *
 * @param error - The caught error value (unknown type)
 * @param fallback - Fallback message when no message can be extracted
 * @returns A user-displayable error string
 */
export function extractErrorMessage(
  error: unknown,
  fallback = "An unexpected error occurred",
): string {
  if (error instanceof Error) return error.message;
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

/**
 * Formats a timestamp to a compact relative time string.
 * Used in dashboard widgets, notification items, and comment items.
 *
 * Output format:
 * - Less than 1 minute: "Just now"
 * - Less than 1 hour: "Xm ago"
 * - Less than 1 day: "Xh ago"
 * - 1+ days: "Xd ago"
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Compact relative time string
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "Just now";
}

/**
 * Formats a timestamp to a longer relative time string with units spelled out.
 * Used where more readable output is preferred (e.g., password last changed).
 *
 * Output format:
 * - Less than 1 minute: "just now"
 * - Less than 1 hour: "X minute(s) ago"
 * - Less than 1 day: "X hour(s) ago"
 * - Less than 7 days: "X day(s) ago"
 * - 7+ days: Full date (e.g., "February 5, 2026")
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Human-readable relative or absolute date string
 */
export function formatRelativeDate(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60)
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  if (diffHours < 24)
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays < 7)
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;

  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
