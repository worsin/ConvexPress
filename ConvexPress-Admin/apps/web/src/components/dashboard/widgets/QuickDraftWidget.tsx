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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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

  const canDiscard = title.length > 0 || content.length > 0;

  return (
    <div>
      {/* Quick Draft Form */}
      <div className="space-y-3 px-[18px] pb-4" onKeyDown={handleKeyDown}>
        <div className="space-y-1.5">
          <Label htmlFor="quick-draft-title" className="text-[12.5px] text-ink-2">
            Title
          </Label>
          <Input
            id="quick-draft-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What's on your mind?"
            disabled={isSaving}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="quick-draft-content" className="text-[12.5px] text-ink-2">
            Content
          </Label>
          <Textarea
            id="quick-draft-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What would you like to say?"
            disabled={isSaving}
            rows={3}
            className="min-h-16 text-[13.5px]"
          />
        </div>
        <div className="flex justify-end gap-2">
          {canDiscard && (
            <Button
              variant="ghost"
              disabled={isSaving}
              onClick={() => {
                setTitle("");
                setContent("");
              }}
            >
              Discard
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleSaveDraft}
            disabled={isSaving || !title.trim()}
          >
            {isSaving ? "Saving…" : "Save draft"}
          </Button>
        </div>
      </div>

      {/* Recent Drafts */}
      <div className="border-t border-border px-[18px] py-4">
        <h4 className="eyebrow mb-2">Your recent drafts</h4>

        {quickDrafts === undefined ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : quickDrafts === null || quickDrafts.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            No drafts yet. Use the form above to create one.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {quickDrafts.map((draft) => (
              <li key={draft._id}>
                <Link
                  to="/posts/$postId/edit"
                  params={{ postId: draft._id }}
                  className="text-[13.5px] font-medium text-foreground hover:text-primary"
                >
                  {draft.title}
                </Link>
                {draft.excerpt && (
                  <p className="mt-0.5 line-clamp-1 text-[12.5px] text-muted-foreground">
                    {draft.excerpt}
                  </p>
                )}
                <span className="text-[12px] text-muted-foreground">
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
