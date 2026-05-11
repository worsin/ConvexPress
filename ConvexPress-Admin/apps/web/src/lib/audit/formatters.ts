/**
 * Audit Log System - Formatters
 *
 * Date, time, severity, and other formatting utilities
 * used across audit log UI components.
 */

import type { AuditSeverity, AuditObjectType } from "./types";
import { SEVERITY_MAP, OBJECT_TYPE_LABELS, SYSTEM_LABELS } from "./constants";

// ─── Date Formatting ────────────────────────────────────────────────────────

/**
 * Format a timestamp as a locale-aware date string.
 * Example: "Feb 8, 2026, 3:45 PM"
 */
export function formatAuditDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Format a timestamp as a short date (no year).
 * Example: "Feb 8, 3:45 PM"
 */
export function formatAuditDateShort(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Format a timestamp as an ISO date string for inputs.
 * Example: "2026-02-08"
 */
export function formatDateInput(timestamp: number): string {
  return new Date(timestamp).toISOString().split("T")[0];
}

/**
 * Parse a date input string to a timestamp.
 */
export function parseDateInput(dateStr: string): number | undefined {
  if (!dateStr) return undefined;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? undefined : d.getTime();
}

// ─── Relative Time ──────────────────────────────────────────────────────────

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Format a timestamp as a relative time string.
 * Examples: "Just now", "2 minutes ago", "Yesterday at 3:45 PM", "Feb 6 at 10:30 AM"
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < MINUTE) {
    return "Just now";
  }

  if (diff < HOUR) {
    const minutes = Math.floor(diff / MINUTE);
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  }

  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }

  if (diff < 2 * DAY) {
    const time = new Date(timestamp).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    return `Yesterday at ${time}`;
  }

  if (diff < 7 * DAY) {
    const days = Math.floor(diff / DAY);
    return `${days} days ago`;
  }

  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── Date Grouping ──────────────────────────────────────────────────────────

/**
 * Get a group label for a timestamp (for timeline grouping).
 * Returns: "Today", "Yesterday", or a formatted date.
 */
export function getDateGroup(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - DAY);

  if (timestamp >= todayStart.getTime()) {
    return "Today";
  }

  if (timestamp >= yesterdayStart.getTime()) {
    return "Yesterday";
  }

  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: now.getFullYear() !== date.getFullYear() ? "numeric" : undefined,
  });
}

// ─── Severity Label ─────────────────────────────────────────────────────────

/**
 * Get the display label for a severity level.
 */
export function formatSeverityLabel(severity: AuditSeverity): string {
  return SEVERITY_MAP[severity]?.label ?? severity;
}

// ─── Object Type Label ──────────────────────────────────────────────────────

/**
 * Get the display label for an object type.
 */
export function formatObjectTypeLabel(objectType: AuditObjectType): string {
  return OBJECT_TYPE_LABELS[objectType] ?? objectType;
}

// ─── System Label ───────────────────────────────────────────────────────────

/**
 * Get the display label for a system slug.
 */
export function formatSystemLabel(system: string): string {
  return SYSTEM_LABELS[system] ?? system;
}

// ─── File Size ──────────────────────────────────────────────────────────────

/**
 * Format a file size in bytes to a human-readable string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Export File Name ───────────────────────────────────────────────────────

/**
 * Generate an export file name.
 * Example: "audit-log-2026-02-08.csv"
 */
export function formatExportFileName(
  format: "csv" | "json",
  date?: Date,
): string {
  const d = date ?? new Date();
  const dateStr = d.toISOString().split("T")[0];
  return `audit-log-${dateStr}.${format}`;
}
