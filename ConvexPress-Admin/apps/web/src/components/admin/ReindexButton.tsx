/**
 * Reindex Button
 *
 * Admin-only button to trigger a full content reindex.
 * Shows a confirmation dialog before starting, and displays
 * progress/results during the reindex operation.
 */

import * as React from "react";
import { useTransition } from "react";
import { useAction } from "convex/react";
import { RefreshCw, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import { cn } from "@/lib/utils";

interface ReindexButtonProps {
  className?: string;
}

interface ReindexResult {
  indexed: { post: number; page: number; media: number; comment: number };
  removed: number;
  errors: number;
  duration: number;
}

export function ReindexButton({ className }: ReindexButtonProps) {
  const reindex = useAction(api.search.actions.reindex);

  const [isRunning, startReindexTransition] = useTransition();
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [result, setResult] = React.useState<ReindexResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const handleReindex = () => {
    setShowConfirm(false);
    setResult(null);
    setError(null);

    startReindexTransition(async () => {
      try {
        const res = await reindex({ force: true }) as unknown as ReindexResult;
        setResult(res);
        const total =
          res.indexed.post + res.indexed.page + res.indexed.media + res.indexed.comment;
        toast.success(
          `Reindex complete: ${total} items indexed, ${res.removed} orphans removed (${Math.round(res.duration / 1000)}s)`,
        );
      } catch (err: unknown) {
        const convexError = err as { data?: { message?: string }; message?: string };
        const message = convexError?.data?.message ?? convexError?.message ?? "Reindex failed";
        setError(message);
        toast.error(message);
      }
    });
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-3">
        {showConfirm ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              This will reindex all content. Continue?
            </span>
            <button
              type="button"
              onClick={handleReindex}
              className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Yes, Reindex
            </button>
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              className="rounded-sm px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            disabled={isRunning}
            className={cn(
              "flex items-center gap-2 rounded-sm border border-border px-4 py-2 text-sm font-medium transition-colors",
              isRunning
                ? "cursor-not-allowed opacity-50"
                : "hover:bg-muted",
            )}
          >
            <RefreshCw
              className={cn("size-4", isRunning && "animate-spin")}
            />
            {isRunning ? "Reindexing..." : "Reindex All Content"}
          </button>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="flex items-start gap-2 rounded-sm border border-border bg-success/5 p-3">
          <Check className="mt-0.5 size-4 shrink-0 text-success" />
          <div className="text-xs">
            <p className="font-medium">Reindex completed successfully</p>
            <p className="mt-1 text-muted-foreground">
              Posts: {result.indexed.post} | Pages: {result.indexed.page} | Media:{" "}
              {result.indexed.media} | Comments: {result.indexed.comment}
            </p>
            <p className="text-muted-foreground">
              Orphans removed: {result.removed}
              {result.errors > 0 && ` | Errors: ${result.errors}`} | Duration:{" "}
              {(result.duration / 1000).toFixed(1)}s
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-sm border border-border bg-destructive/5 p-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="text-xs">
            <p className="font-medium">Reindex failed</p>
            <p className="mt-1 text-muted-foreground">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
