/**
 * PublishBox - Primary action metabox
 *
 * Contains status, visibility, schedule controls, and action buttons
 * (Publish/Update/Save Draft/Preview). Always first in sidebar, not
 * draggable, sticky on scroll.
 */

import { useCallback, useState } from "react";
import {
  Calendar,
  Eye,
  EyeOff,
  Globe,
  Lock,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  EditorContentType,
  PostStatus,
  PostVisibility,
} from "@/types/editor";

interface PublishBoxProps {
  contentType: EditorContentType;
  mode: "new" | "edit";
  postId?: string;
  userRole: string;
  // Form state values
  status: PostStatus;
  visibility: PostVisibility;
  password: string;
  scheduledFor: Date | null;
  isSticky: boolean;
  /** Actual published timestamp from the post record (ms since epoch) */
  publishedAt?: number | null;
  // Form setters
  onStatusChange: (status: PostStatus) => void;
  onVisibilityChange: (visibility: PostVisibility) => void;
  onPasswordChange: (password: string) => void;
  onScheduledForChange: (date: Date | null) => void;
  onStickyChange: (sticky: boolean) => void;
  // Action handlers
  onSaveDraft: () => void;
  onPublish: () => void;
  onUpdate: () => void;
  onSubmitForReview: () => void;
  onPreview: () => void;
  onTrash: () => void;
  onSwitchToDraft: () => void;
  // State
  isSubmitting: boolean;
  isDirty: boolean;
}

function getStatusLabel(status: PostStatus): string {
  switch (status) {
    case "auto-draft":
    case "draft":
      return "Draft";
    case "pending":
      return "Pending Review";
    case "publish":
      return "Published";
    case "future":
      return "Scheduled";
    case "private":
      return "Private";
    case "trash":
      return "Trashed";
    default:
      return status;
  }
}

function getVisibilityLabel(visibility: PostVisibility): string {
  switch (visibility) {
    case "public":
      return "Public";
    case "private":
      return "Private";
    case "password":
      return "Password Protected";
    default:
      return visibility;
  }
}

function getVisibilityIcon(visibility: PostVisibility) {
  switch (visibility) {
    case "public":
      return Globe;
    case "private":
      return Lock;
    case "password":
      return EyeOff;
    default:
      return Eye;
  }
}

function isEditorOrAbove(role: string): boolean {
  return role === "editor" || role === "administrator";
}

function isAuthorOrAbove(role: string): boolean {
  return (
    role === "author" || role === "editor" || role === "administrator"
  );
}

function isContributor(role: string): boolean {
  return role === "contributor";
}

export function PublishBox({
  contentType,
  mode,
  postId,
  userRole,
  status,
  visibility,
  password,
  scheduledFor,
  isSticky,
  publishedAt,
  onStatusChange,
  onVisibilityChange,
  onPasswordChange,
  onScheduledForChange,
  onStickyChange,
  onSaveDraft,
  onPublish,
  onUpdate,
  onSubmitForReview,
  onPreview,
  onTrash,
  onSwitchToDraft,
  isSubmitting,
  isDirty,
}: PublishBoxProps) {
  const [editingStatus, setEditingStatus] = useState(false);
  const [editingVisibility, setEditingVisibility] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(false);

  const isPublished = status === "publish";
  const isScheduled = status === "future";
  const isDraft = status === "draft" || status === "auto-draft";
  const isPending = status === "pending";

  const VisibilityIcon = getVisibilityIcon(visibility);

  const handlePublishOrUpdate = useCallback(() => {
    if (isPublished || isScheduled) {
      onUpdate();
    } else {
      onPublish();
    }
  }, [isPublished, isScheduled, onUpdate, onPublish]);

  return (
    <div className="border border-border bg-card rounded-none">
      {/* Title bar */}
      <div className="bg-muted/50 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
          Publish
        </span>
      </div>

      {/* Content */}
      <div className="px-3 py-3 space-y-3">
        {/* Status row */}
        <div className="flex items-start gap-1 text-xs">
          <span className="text-muted-foreground shrink-0">Status:</span>
          {!editingStatus ? (
            <div className="flex items-center gap-1">
              <span className="font-medium text-foreground">
                {getStatusLabel(status)}
              </span>
              <button
                type="button"
                onClick={() => setEditingStatus(true)}
                className="text-primary hover:underline text-xs"
              >
                Edit
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <select
                value={isDraft ? "draft" : isPending ? "pending" : "draft"}
                onChange={(e) => {
                  onStatusChange(e.target.value as PostStatus);
                }}
                className="h-6 rounded-none border border-border bg-transparent px-1.5 text-xs w-full"
                aria-label="Post status"
              >
                <option value="draft">Draft</option>
                <option value="pending">Pending Review</option>
              </select>
              <div className="flex gap-1">
                <Button
                  size="xs"
                  onClick={() => setEditingStatus(false)}
                >
                  OK
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setEditingStatus(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Visibility row */}
        <div className="flex items-start gap-1 text-xs">
          <span className="text-muted-foreground shrink-0 flex items-center gap-1">
            <VisibilityIcon className="size-3" />
            Visibility:
          </span>
          {!editingVisibility ? (
            <div className="flex items-center gap-1">
              <span className="font-medium text-foreground">
                {getVisibilityLabel(visibility)}
              </span>
              {isAuthorOrAbove(userRole) && (
                <button
                  type="button"
                  onClick={() => setEditingVisibility(true)}
                  className="text-primary hover:underline text-xs"
                >
                  Edit
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="visibility"
                    value="public"
                    checked={visibility === "public"}
                    onChange={() => onVisibilityChange("public")}
                    className="accent-primary"
                  />
                  Public
                </label>

                {isEditorOrAbove(userRole) && visibility === "public" && (
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer ml-4">
                    <input
                      type="checkbox"
                      checked={isSticky}
                      onChange={(e) => onStickyChange(e.target.checked)}
                      className="accent-primary"
                    />
                    Stick this post to the front page
                  </label>
                )}

                {isAuthorOrAbove(userRole) && (
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="visibility"
                      value="password"
                      checked={visibility === "password"}
                      onChange={() => onVisibilityChange("password")}
                      className="accent-primary"
                    />
                    Password Protected
                  </label>
                )}

                {visibility === "password" && (
                  <div className="ml-4">
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => onPasswordChange(e.target.value)}
                      placeholder="Enter password"
                      className="h-6 text-xs"
                    />
                  </div>
                )}

                {isAuthorOrAbove(userRole) && (
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="visibility"
                      value="private"
                      checked={visibility === "private"}
                      onChange={() => onVisibilityChange("private")}
                      className="accent-primary"
                    />
                    Private
                  </label>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  size="xs"
                  onClick={() => setEditingVisibility(false)}
                >
                  OK
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setEditingVisibility(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Schedule row */}
        <div className="flex items-start gap-1 text-xs">
          <span className="text-muted-foreground shrink-0 flex items-center gap-1">
            <Calendar className="size-3" />
            Publish:
          </span>
          {!editingSchedule ? (
            <div className="flex items-center gap-1">
              <span className="font-medium text-foreground">
                {scheduledFor
                  ? scheduledFor.toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : isPublished
                    ? "Published"
                    : "Immediately"}
              </span>
              <button
                type="button"
                onClick={() => setEditingSchedule(true)}
                className="text-primary hover:underline text-xs"
              >
                Edit
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex gap-1">
                <input
                  type="date"
                  value={
                    scheduledFor
                      ? scheduledFor.toISOString().split("T")[0]
                      : ""
                  }
                  onChange={(e) => {
                    if (e.target.value) {
                      const currentTime = scheduledFor ?? new Date();
                      const [year, month, day] = e.target.value
                        .split("-")
                        .map(Number);
                      const newDate = new Date(
                        year,
                        month - 1,
                        day,
                        currentTime.getHours(),
                        currentTime.getMinutes(),
                      );
                      onScheduledForChange(newDate);
                    } else {
                      onScheduledForChange(null);
                    }
                  }}
                  className="h-6 rounded-none border border-border bg-transparent px-1.5 text-xs"
                />
                <input
                  type="time"
                  value={
                    scheduledFor
                      ? `${String(scheduledFor.getHours()).padStart(2, "0")}:${String(scheduledFor.getMinutes()).padStart(2, "0")}`
                      : ""
                  }
                  onChange={(e) => {
                    if (e.target.value && scheduledFor) {
                      const [hours, minutes] = e.target.value
                        .split(":")
                        .map(Number);
                      const newDate = new Date(scheduledFor);
                      newDate.setHours(hours, minutes);
                      onScheduledForChange(newDate);
                    }
                  }}
                  className="h-6 rounded-none border border-border bg-transparent px-1.5 text-xs"
                />
              </div>
              <div className="flex gap-1">
                <Button
                  size="xs"
                  onClick={() => setEditingSchedule(false)}
                >
                  OK
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    onScheduledForChange(null);
                    setEditingSchedule(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Published/Scheduled date info */}
        {isPublished && publishedAt && (
          <p className="text-xs text-muted-foreground">
            Published on:{" "}
            {new Date(publishedAt).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        )}

        {/* Separator */}
        <div className="border-t border-border" />

        {/* Action buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1.5">
            {/* Save Draft - visible for draft/auto-draft */}
            {(isDraft || status === "auto-draft") && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onSaveDraft}
                disabled={isSubmitting}
              >
                Save Draft
              </Button>
            )}

            {/* Preview */}
            <Button
              variant="outline"
              size="sm"
              onClick={onPreview}
              disabled={isSubmitting}
            >
              Preview
            </Button>
          </div>

          <div>
            {/* Contributor: Submit for Review */}
            {isContributor(userRole) && !isPublished && (
              <Button
                size="sm"
                onClick={onSubmitForReview}
                disabled={isSubmitting}
                aria-label="Submit for review"
              >
                {isSubmitting ? "Submitting..." : "Submit for Review"}
              </Button>
            )}

            {/* Author+: Publish or Update */}
            {isAuthorOrAbove(userRole) && (
              <Button
                size="sm"
                onClick={handlePublishOrUpdate}
                disabled={isSubmitting || (!isDirty && isPublished)}
                aria-label={
                  isPublished || isScheduled ? "Update post" : "Publish post"
                }
              >
                {isSubmitting
                  ? "Saving..."
                  : isPublished || isScheduled
                    ? "Update"
                    : scheduledFor
                      ? "Schedule"
                      : "Publish"}
              </Button>
            )}
          </div>
        </div>

        {/* Switch to Draft (for published posts) */}
        {isPublished && isAuthorOrAbove(userRole) && (
          <button
            type="button"
            onClick={onSwitchToDraft}
            className="text-xs text-primary hover:underline"
          >
            Switch to Draft
          </button>
        )}

        {/* Move to Trash */}
        {mode === "edit" && postId && (
          <button
            type="button"
            onClick={onTrash}
            className="text-xs text-destructive hover:underline"
          >
            Move to Trash
          </button>
        )}
      </div>
    </div>
  );
}
