/**
 * SettingsPageLayout - Top-level wrapper for every settings page.
 *
 * Renders the page title, optional description, child sections,
 * and an autosave status row.
 */

import type * as React from "react";

import type { SettingsAutosaveStatus } from "@/hooks/useSettingsForm";

interface SettingsPageLayoutProps {
  /** Page title (e.g., "General Settings") */
  title: string;
  /** Optional description text below the title */
  description?: string;
  /** Child content: SettingsSection components */
  children: React.ReactNode;
  /** Whether the form has unsaved changes */
  isDirty: boolean;
  /** Whether the form is currently saving */
  isSubmitting: boolean;
  /** Kept for backwards compatibility; settings now autosave. */
  onSave?: () => Promise<void>;
  /** Called when Reset is clicked (optional) */
  onReset?: () => void;
  /** Autosave status */
  autoSaveStatus?: SettingsAutosaveStatus;
  /** Autosave error text (if any) */
  autoSaveError?: string | null;
  /** Last updated metadata */
  lastUpdated?: { at: number; by: string };
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function getAutosaveMessage({
  isDirty,
  isSubmitting,
  autoSaveStatus,
  autoSaveError,
}: {
  isDirty: boolean;
  isSubmitting: boolean;
  autoSaveStatus?: SettingsAutosaveStatus;
  autoSaveError?: string | null;
}) {
  if (isSubmitting || autoSaveStatus === "saving") {
    return { text: "Saving changes...", className: "text-muted-foreground" };
  }
  if (autoSaveStatus === "blocked") {
    return {
      text: autoSaveError ?? "Autosave paused until validation errors are fixed.",
      className: "text-warning",
    };
  }
  if (autoSaveStatus === "error") {
    return {
      text: autoSaveError ?? "Autosave failed. Try editing again.",
      className: "text-destructive",
    };
  }
  if (autoSaveStatus === "pending" || isDirty) {
    return { text: "Saving shortly...", className: "text-muted-foreground" };
  }
  if (autoSaveStatus === "saved") {
    return { text: "All changes saved.", className: "text-success" };
  }
  return { text: "All changes saved.", className: "text-success" };
}

export function SettingsPageLayout({
  title,
  description,
  children,
  isDirty,
  isSubmitting,
  onSave,
  autoSaveStatus,
  autoSaveError,
  lastUpdated,
}: SettingsPageLayoutProps) {
  const saveState = getAutosaveMessage({
    isDirty,
    isSubmitting,
    autoSaveStatus,
    autoSaveError,
  });

  return (
    <div className="flex flex-col gap-6 pb-8">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      {/* Settings sections */}
      <div className="flex flex-col gap-6">{children}</div>

      {/* Autosave status area / manual save button */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs">
        <div className="flex items-center gap-3">
          {onSave ? (
            <button
              type="button"
              onClick={onSave}
              disabled={!isDirty || isSubmitting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </button>
          ) : null}
          <span className={saveState.className}>{saveState.text}</span>
        </div>
        {lastUpdated && (
          <span className="text-muted-foreground">
            Last saved {formatRelativeTime(lastUpdated.at)} by {lastUpdated.by}
          </span>
        )}
      </div>
    </div>
  );
}
