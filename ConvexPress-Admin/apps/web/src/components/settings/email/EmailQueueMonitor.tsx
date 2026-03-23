/**
 * EmailQueueMonitor - Delivery queue list with filtering.
 *
 * Shows recent email queue items with status, template, recipient,
 * and timing information. Clicking a row navigates to the full-page
 * queue detail view.
 *
 * Wired to: api.emails.queries.listQueue
 */

import { useState, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Inbox,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  XCircle,
  RotateCcw,
} from "lucide-react";

import { api } from "@backend/convex/_generated/api";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, getErrorMessage } from "@/lib/utils";

import { EMAIL_STATUS_CONFIG, STATUS_OPTIONS } from "@/lib/email/constants";
import type { EmailStatus, EmailQueueListItem } from "@/lib/email/types";
import type { Id } from "@backend/convex/_generated/dataModel";

export function EmailQueueMonitor() {
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 20;

  const queueData = useQuery(api.emails.queries.listQueue, {
    status: (statusFilter as EmailStatus) || undefined,
    page,
    perPage,
  });

  const retryEmail = useMutation(api.emails.mutations.retryEmail);
  const cancelEmail = useMutation(api.emails.mutations.cancelEmail);

  const handleRetry = useCallback(
    async (queueId: Id<"emailQueue">) => {
      try {
        await retryEmail({ queueId });
        toast.success("Email queued for retry.");
      } catch (error: unknown) {
        toast.error(
          error instanceof Error ? error.message : "Failed to retry email.",
        );
      }
    },
    [retryEmail],
  );

  const handleCancel = useCallback(
    async (queueId: Id<"emailQueue">) => {
      try {
        await cancelEmail({ queueId });
        toast.success("Email cancelled.");
      } catch (error: unknown) {
        toast.error(
          error instanceof Error ? error.message : "Failed to cancel email.",
        );
      }
    },
    [cancelEmail],
  );

  if (queueData === undefined) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Inbox className="size-4 text-muted-foreground" />
            <CardTitle>Delivery Queue</CardTitle>
            <span className="text-xs text-muted-foreground">
              ({queueData.total.toLocaleString()} total)
            </span>
          </div>

          {/* Status filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-7 appearance-none border border-input bg-transparent pl-2 pr-7 text-xs text-foreground focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring/50"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_140px_100px_80px_120px_80px] gap-2 border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>Recipient</span>
          <span>Template</span>
          <span>Status</span>
          <span className="text-center">Attempts</span>
          <span>Created</span>
          <span className="text-right">Actions</span>
        </div>

        {/* Queue rows */}
        {queueData.emails.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            No emails in queue.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {queueData.emails.map((email: EmailQueueListItem) => (
              <QueueRow
                key={email._id}
                email={email}
                onRetry={handleRetry}
                onCancel={handleCancel}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {queueData.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-2">
            <span className="text-xs text-muted-foreground">
              Page {queueData.page} of {queueData.totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-6 w-6 p-0"
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= queueData.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="h-6 w-6 p-0"
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QueueRow({
  email,
  onRetry,
  onCancel,
}: {
  email: EmailQueueListItem;
  onRetry: (id: Id<"emailQueue">) => void;
  onCancel: (id: Id<"emailQueue">) => void;
}) {
  const statusConfig = EMAIL_STATUS_CONFIG[email.status as EmailStatus];

  const timeAgo = formatTimeAgo(email.createdAt);

  return (
    <div className="grid grid-cols-[1fr_140px_100px_80px_120px_80px] items-center gap-2 px-4 py-2 text-xs transition-colors hover:bg-muted/50">
      {/* Recipient */}
      <div className="flex flex-col gap-0.5 min-w-0">
        <Link
          to="/settings/email/queue/$queueId"
          params={{ queueId: email._id }}
          className="font-medium text-foreground hover:text-primary truncate"
        >
          {email.toName || email.to}
        </Link>
        {email.toName && (
          <span className="text-muted-foreground truncate">{email.to}</span>
        )}
      </div>

      {/* Template slug */}
      <div className="truncate text-muted-foreground">{email.templateSlug}</div>

      {/* Status badge */}
      <div>
        {statusConfig && (
          <span
            className={cn(
              "inline-flex items-center border px-1.5 py-0.5 text-[10px] font-medium",
              statusConfig.className,
            )}
          >
            {statusConfig.label}
          </span>
        )}
      </div>

      {/* Attempts */}
      <div className="text-center text-muted-foreground">{email.attempts}</div>

      {/* Created timestamp */}
      <div className="text-muted-foreground" title={new Date(email.createdAt).toLocaleString()}>
        {timeAgo}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-1">
        {email.status === "failed" && (
          <button
            onClick={() => onRetry(email._id as Id<"emailQueue">)}
            className="inline-flex size-6 items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            title="Retry"
          >
            <RotateCcw className="size-3" />
          </button>
        )}
        {email.status === "queued" && (
          <button
            onClick={() => onCancel(email._id as Id<"emailQueue">)}
            className="inline-flex size-6 items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
            title="Cancel"
          >
            <XCircle className="size-3" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Format a timestamp as a relative "time ago" string.
 */
function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString();
}
