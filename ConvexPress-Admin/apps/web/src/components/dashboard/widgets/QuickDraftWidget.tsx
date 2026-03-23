/**
 * Dashboard System - Quick Draft Widget
 *
 * Title + content form with Save Draft button.
 * Lists recent drafts below the form.
 *
 * Mirrors WordPress's "Quick Draft" dashboard widget.
 */

import { useCallback, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardData } from "@/hooks/dashboard/useDashboardData";

function QuickDraftWidget() {
  const { quickDrafts } = useDashboardData();
  const quickDraftMutation = useMutation(api.dashboard.mutations.quickDraft);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveDraft = useCallback(async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error("Title is required");
      return;
    }

    setIsSaving(true);
    try {
      await quickDraftMutation({
        title: trimmedTitle,
        content: content.trim() || undefined,
      });
      setTitle("");
      setContent("");
      toast.success("Draft saved");
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : (err as { data?: { message?: string } })?.data?.message ??
            "Failed to save draft";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }, [title, content, quickDraftMutation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSaveDraft();
      }
    },
    [handleSaveDraft],
  );

  return (
    <div>
      {/* Quick Draft Form */}
      <div className="p-4 space-y-2" onKeyDown={handleKeyDown}>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">
            Title
          </label>
          <Input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What's on your mind?"
            disabled={isSaving}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">
            Content
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What would you like to say?"
            disabled={isSaving}
            rows={3}
            className="dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 h-auto rounded-none border bg-transparent px-2.5 py-1.5 text-xs transition-colors focus-visible:ring-1 md:text-xs placeholder:text-muted-foreground w-full min-w-0 outline-hidden resize-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleSaveDraft}
            disabled={isSaving || !title.trim()}
          >
            {isSaving ? "Saving..." : "Save Draft"}
          </Button>
        </div>
      </div>

      {/* Recent Drafts */}
      <div className="border-t border-border p-4">
        <h4 className="text-xs font-semibold text-foreground mb-2">
          Your Recent Drafts
        </h4>

        {quickDrafts === undefined ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : quickDrafts === null || quickDrafts.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No drafts yet. Use the form above to create one.
          </p>
        ) : (
          <ul className="space-y-2">
            {quickDrafts.map((draft) => (
              <li key={draft._id}>
                <Link
                  to="/posts/$postId/edit"
                  params={{ postId: draft._id }}
                  className="text-xs text-primary hover:underline"
                >
                  {draft.title}
                </Link>
                {draft.excerpt && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                    {draft.excerpt}
                  </p>
                )}
                <span className="text-[10px] text-muted-foreground">
                  {formatDate(draft.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default QuickDraftWidget;
