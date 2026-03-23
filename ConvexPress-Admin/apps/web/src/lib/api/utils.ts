/**
 * API System - Frontend Utility Functions
 *
 * Shared formatting and helper functions used across the API Keys
 * and Webhooks admin pages.
 */

/**
 * Format a timestamp as a human-readable relative time string.
 *
 * Examples:
 *   - "just now" (< 60 seconds)
 *   - "5m ago" (minutes)
 *   - "3h ago" (hours)
 *   - "12d ago" (days < 30)
 *   - "Jan 15, 2026" (30+ days, falls back to locale date)
 */
export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
