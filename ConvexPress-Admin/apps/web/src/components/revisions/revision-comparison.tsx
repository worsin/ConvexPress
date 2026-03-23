/**
 * RevisionComparison - Shared revision comparison page content
 *
 * Extracted from posts/$postId/revisions.tsx and pages/$pageId/revisions.tsx
 * to eliminate near-identical code duplication (issue #61).
 *
 * Renders the full revision comparison experience:
 *   - Slider navigation through all revisions
 *   - Side-by-side diff for title, content, excerpt
 *   - "Compare any two revisions" toggle
 *   - Restore button (for users with restore + edit capabilities)
 *   - Keyboard navigation (Left/Right arrows)
 *   - Real-time updates via Convex subscriptions
 */

import { useCallback, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RevisionSlider } from "@/components/revisions/revision-slider";
import { RevisionMeta } from "@/components/revisions/revision-meta";
import { DiffViewer } from "@/components/revisions/diff-viewer";
import { RestoreDialog } from "@/components/revisions/restore-dialog";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RevisionComparisonProps {
  /** The content type being compared. */
  contentType: "post" | "page";
  /** The ID of the parent content item. */
  contentId: string;
  /** Whether the current user can restore revisions. */
  canRestore: boolean;
}

// ─── Route Link Helpers ──────────────────────────────────────────────────────

/** Type-safe back link to list page */
function BackToListLink({
  contentType,
  label,
}: {
  contentType: "post" | "page";
  label: string;
}) {
  return contentType === "post" ? (
    <Link to="/posts" className="text-sm text-primary hover:underline">
      Back to All {label}s
    </Link>
  ) : (
    <Link to="/pages" className="text-sm text-primary hover:underline">
      Back to All {label}s
    </Link>
  );
}

/** Type-safe back link to editor page */
function BackToEditorLink({
  contentType,
  contentId,
  className,
  children,
}: {
  contentType: "post" | "page";
  contentId: string;
  className?: string;
  children: React.ReactNode;
}) {
  return contentType === "post" ? (
    <Link
      to="/posts/$postId/edit"
      params={{ postId: contentId }}
      className={className}
    >
      {children}
    </Link>
  ) : (
    <Link
      to="/pages/$pageId/edit"
      params={{ pageId: contentId }}
      className={className}
    >
      {children}
    </Link>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function RevisionComparison({
  contentType,
  contentId,
  canRestore,
}: RevisionComparisonProps) {
  const label = contentType === "post" ? "Post" : "Page";
  const pluralPath = contentType === "post" ? "posts" : "pages";
  const idParam = contentType === "post" ? "postId" : "pageId";

  // ─── Data ──────────────────────────────────────────────────────────────
  const post = useQuery(api.posts.queries.get, {
    postId: contentId as Id<"posts">,
  });

  const revisionsData = useQuery(api.revisions.queries.listByPost, {
    parentId: contentId as Id<"posts">,
    limit: 200,
  });

  // ─── State ─────────────────────────────────────────────────────────────
  const [userSelectedIndex, setUserSelectedIndex] = useState<number | null>(null);
  const [userLeftIndex, setUserLeftIndex] = useState<number | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);

  // Sort revisions by revisionNumber ascending (oldest first) for the slider
  const sortedRevisions = useMemo(() => {
    if (!revisionsData?.revisions) return [];
    return [...revisionsData.revisions].sort(
      (a, b) => a.revisionNumber - b.revisionNumber,
    );
  }, [revisionsData?.revisions]);

  // Derive effective indices
  const selectedIndex = userSelectedIndex !== null
    ? Math.min(userSelectedIndex, sortedRevisions.length - 1)
    : Math.max(0, sortedRevisions.length - 1);
  const leftIndex = userLeftIndex !== null
    ? Math.min(userLeftIndex, sortedRevisions.length - 1)
    : Math.max(0, sortedRevisions.length - 2);

  const setSelectedIndex = useCallback((idx: number) => {
    setUserSelectedIndex(idx);
  }, []);
  const setLeftIndex = useCallback((idx: number) => {
    setUserLeftIndex(idx);
  }, []);

  // ─── Current comparison pair ───────────────────────────────────────────
  const rightRevision = sortedRevisions[selectedIndex] ?? null;
  const leftRevision = compareMode
    ? sortedRevisions[leftIndex] ?? null
    : sortedRevisions[Math.max(0, selectedIndex - 1)] ?? null;

  const compareData = useQuery(
    api.revisions.queries.compare,
    rightRevision && leftRevision && rightRevision._id !== leftRevision._id
      ? {
          leftRevisionId: leftRevision._id as Id<"revisions">,
          rightRevisionId: rightRevision._id as Id<"revisions">,
        }
      : "skip",
  );

  // ─── Compare mode toggle ──────────────────────────────────────────────
  const handleCompareModeToggle = useCallback(() => {
    setCompareMode((prev) => {
      if (!prev) {
        setLeftIndex(Math.max(0, selectedIndex - 1));
      }
      return !prev;
    });
  }, [selectedIndex]);

  const handleSelectLeftIndex = useCallback(
    (idx: number) => {
      if (idx < selectedIndex) {
        setLeftIndex(idx);
      }
    },
    [selectedIndex],
  );

  const handleRestored = useCallback(() => {
    setRestoreDialogOpen(false);
  }, []);

  // ─── Loading states ────────────────────────────────────────────────────
  if (post === undefined || revisionsData === undefined) {
    return <RevisionsPageSkeleton />;
  }

  if (post === null) {
    return (
      <div className="py-12 text-center">
        <h1 className="text-lg font-semibold text-foreground mb-2">
          {label} Not Found
        </h1>
        <p className="text-sm text-muted-foreground mb-4">
          The {contentType} you are looking for does not exist or has been deleted.
        </p>
        <BackToListLink contentType={contentType} label={label} />
      </div>
    );
  }

  // ─── Empty state ───────────────────────────────────────────────────────
  if (sortedRevisions.length === 0) {
    return (
      <div className="space-y-6">
        <ComparisonHeader
          contentType={contentType}
          contentId={contentId}
          contentTitle={post.title}
        />
        <div className="py-12 text-center border border-border bg-card">
          <p className="text-sm text-muted-foreground mb-3">
            No revisions yet. Revisions are created each time you save the {contentType}.
          </p>
          <BackToEditorLink
            contentType={contentType}
            contentId={contentId}
            className="text-sm text-primary hover:underline"
          >
            Back to editor
          </BackToEditorLink>
        </div>
      </div>
    );
  }

  // Single revision
  if (sortedRevisions.length === 1) {
    return (
      <div className="space-y-6">
        <ComparisonHeader
          contentType={contentType}
          contentId={contentId}
          contentTitle={post.title}
        />
        <div className="py-12 text-center border border-border bg-card">
          <p className="text-sm text-muted-foreground mb-3">
            Only one revision exists. Save the {contentType} again to create another
            revision for comparison.
          </p>
          <BackToEditorLink
            contentType={contentType}
            contentId={contentId}
            className="text-sm text-primary hover:underline"
          >
            Back to editor
          </BackToEditorLink>
        </div>
      </div>
    );
  }

  const isSameRevision =
    leftRevision && rightRevision && leftRevision._id === rightRevision._id;

  return (
    <div className="space-y-5">
      {/* ─── Page Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <ComparisonHeader
          contentType={contentType}
          contentId={contentId}
          contentTitle={post.title}
        />
        {canRestore && rightRevision && !isSameRevision && (
          <Button
            onClick={() => setRestoreDialogOpen(true)}
            className="shrink-0"
          >
            <RotateCcw className="size-3.5 mr-1.5" />
            Restore This Revision
          </Button>
        )}
      </div>

      {/* ─── Compare Mode Toggle ──────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={compareMode}
            onChange={handleCompareModeToggle}
            className="size-3.5 accent-primary"
          />
          <span className="text-xs text-muted-foreground">
            Compare any two revisions
          </span>
        </label>
      </div>

      {/* ─── Revision Slider ──────────────────────────────────────────── */}
      <RevisionSlider
        revisions={sortedRevisions}
        selectedIndex={selectedIndex}
        onSelectIndex={setSelectedIndex}
        compareMode={compareMode}
        leftIndex={compareMode ? leftIndex : undefined}
        onSelectLeftIndex={compareMode ? handleSelectLeftIndex : undefined}
      />

      {/* ─── Revision Metadata (Two Columns) ──────────────────────────── */}
      {leftRevision && rightRevision && !isSameRevision && (
        <div className="grid grid-cols-2">
          <RevisionMeta
            revisionNumber={leftRevision.revisionNumber}
            authorName={leftRevision.authorName}
            authorAvatar={leftRevision.authorAvatar}
            createdAt={leftRevision.createdAt}
            type={leftRevision.type as "manual" | "autosave"}
            changedFields={leftRevision.changedFields}
            side="left"
          />
          <RevisionMeta
            revisionNumber={rightRevision.revisionNumber}
            authorName={rightRevision.authorName}
            authorAvatar={rightRevision.authorAvatar}
            createdAt={rightRevision.createdAt}
            type={rightRevision.type as "manual" | "autosave"}
            changedFields={rightRevision.changedFields}
            side="right"
          />
        </div>
      )}

      {/* ─── Diff Viewer ──────────────────────────────────────────────── */}
      {isSameRevision ? (
        <div className="py-8 text-center border border-border bg-card">
          <p className="text-sm text-muted-foreground">
            Select two different revisions to compare.
          </p>
        </div>
      ) : compareData ? (
        <DiffViewer
          left={{
            title: compareData.left.title,
            content: compareData.left.content,
            excerpt: compareData.left.excerpt,
          }}
          right={{
            title: compareData.right.title,
            content: compareData.right.content,
            excerpt: compareData.right.excerpt,
          }}
        />
      ) : leftRevision && rightRevision ? (
        <DiffViewer
          left={{
            title: leftRevision.title,
            content: leftRevision.content,
            excerpt: leftRevision.excerpt,
          }}
          right={{
            title: rightRevision.title,
            content: rightRevision.content,
            excerpt: rightRevision.excerpt,
          }}
        />
      ) : null}

      {/* ─── Restore Dialog ───────────────────────────────────────────── */}
      {rightRevision && (
        <RestoreDialog
          open={restoreDialogOpen}
          onClose={() => setRestoreDialogOpen(false)}
          revisionId={rightRevision._id as Id<"revisions">}
          revisionNumber={rightRevision.revisionNumber}
          onRestored={handleRestored}
        />
      )}
    </div>
  );
}

// ─── Comparison Header ──────────────────────────────────────────────────────

function ComparisonHeader({
  contentType,
  contentId,
  contentTitle,
}: {
  contentType: "post" | "page";
  contentId: string;
  contentTitle: string;
}) {
  const label = contentType === "post" ? "Post" : "Page";

  return (
    <div>
      <BackToEditorLink
        contentType={contentType}
        contentId={contentId}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
      >
        <ArrowLeft className="size-3" />
        Back to Edit {label}: &ldquo;{contentTitle}&rdquo;
      </BackToEditorLink>
      <h1 className="text-lg font-semibold text-foreground">
        Revisions for &ldquo;{contentTitle}&rdquo;
      </h1>
    </div>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────────────────────

function RevisionsPageSkeleton() {
  return (
    <div className="space-y-5">
      <div>
        <Skeleton className="h-4 w-48 mb-2" />
        <Skeleton className="h-7 w-80" />
      </div>
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-10 w-full" />
      <div className="grid grid-cols-2 gap-0">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
