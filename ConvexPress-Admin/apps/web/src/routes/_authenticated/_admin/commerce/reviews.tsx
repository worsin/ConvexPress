import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { toast } from "sonner";
import {
  Star,
  Check,
  X,
  Trash2,
  AlertTriangle,
  Clock,
  MessageSquare,
  ThumbsUp,
  ShieldCheck,
  Filter,
} from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import { PluginGuard } from "@/components/plugins/PluginGuard";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/reviews",
)({
  component: CommerceReviewsRoute,
});

function CommerceReviewsRoute() {
  return (
    <PluginGuard pluginId="commerceReviews">
      <CommerceReviewsPage />
    </PluginGuard>
  );
}

// ─── Formatters ────────────────────────────────────────────────────────────

function formatDate(ts: number | undefined) {
  if (!ts) return "--";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Star Rating Display ─────────────────────────────────────────────────

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${
            i < rating
              ? "fill-amber-400 text-amber-400"
              : "fill-none text-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );
}

// ─── Status Badge ────────────────────────────────────────────────────────

function ReviewStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    approved: "bg-emerald-100 text-emerald-800",
    rejected: "bg-red-100 text-red-800",
    spam: "bg-muted text-muted-foreground",
    deleted: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {status}
    </span>
  );
}

// ─── Stats Cards ─────────────────────────────────────────────────────────

function StatsCards({
  stats,
}: {
  stats: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    spam: number;
    averageRating: number;
    recentReviews: number;
  };
}) {
  const cards = [
    {
      label: "Total Reviews",
      value: stats.total,
      icon: MessageSquare,
      accent: "text-foreground",
    },
    {
      label: "Pending",
      value: stats.pending,
      icon: Clock,
      accent: "text-amber-600",
    },
    {
      label: "Approved",
      value: stats.approved,
      icon: Check,
      accent: "text-emerald-600",
    },
    {
      label: "Rejected",
      value: stats.rejected,
      icon: X,
      accent: "text-red-600",
    },
    {
      label: "Avg Rating",
      value: stats.averageRating.toFixed(1),
      icon: Star,
      accent: "text-amber-500",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-2xl border border-border bg-card p-4 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <card.icon className={`h-4 w-4 ${card.accent}`} />
          </div>
          <p className={`mt-2 text-2xl font-semibold ${card.accent}`}>
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Review Row ──────────────────────────────────────────────────────────

function ReviewRow({
  review,
  isSelected,
  onToggleSelect,
  onApprove,
  onReject,
  onMarkSpam,
  onDelete,
}: {
  review: {
    _id: string;
    productId: string;
    rating: number;
    title?: string;
    content?: string;
    status: string;
    isVerifiedPurchase: boolean;
    helpfulCount: number;
    userName: string;
    userEmail?: string;
    productName: string;
    createdAt: number;
  };
  isSelected: boolean;
  onToggleSelect: () => void;
  onApprove: () => void;
  onReject: () => void;
  onMarkSpam: () => void;
  onDelete: () => void;
}) {
  const excerpt =
    review.content && review.content.length > 120
      ? `${review.content.slice(0, 120)}...`
      : review.content;

  return (
    <tr className="border-b border-border transition-colors hover:bg-muted/30">
      {/* Checkbox */}
      <td className="w-10 px-4 py-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          className="h-4 w-4 rounded border-border"
        />
      </td>

      {/* Product */}
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-foreground">
          {review.productName}
        </p>
      </td>

      {/* Rating */}
      <td className="px-4 py-3">
        <StarRating rating={review.rating} />
      </td>

      {/* Review */}
      <td className="max-w-xs px-4 py-3">
        <div className="space-y-0.5">
          {review.title && (
            <p className="text-sm font-medium text-foreground">
              {review.title}
            </p>
          )}
          {excerpt && (
            <p className="text-xs text-muted-foreground">{excerpt}</p>
          )}
          <div className="flex items-center gap-2">
            {review.isVerifiedPurchase && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                <ShieldCheck className="h-3 w-3" />
                Verified
              </span>
            )}
            {review.helpfulCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <ThumbsUp className="h-3 w-3" />
                {review.helpfulCount}
              </span>
            )}
          </div>
        </div>
      </td>

      {/* Author */}
      <td className="px-4 py-3">
        <p className="text-sm text-foreground">{review.userName}</p>
        {review.userEmail && (
          <p className="text-xs text-muted-foreground">{review.userEmail}</p>
        )}
      </td>

      {/* Date */}
      <td className="px-4 py-3">
        <p className="text-sm text-muted-foreground">
          {formatDate(review.createdAt)}
        </p>
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <ReviewStatusBadge status={review.status} />
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          {review.status !== "approved" && (
            <button
              type="button"
              onClick={onApprove}
              title="Approve"
              className="rounded-lg p-1.5 text-emerald-600 transition-colors hover:bg-emerald-50"
            >
              <Check className="h-4 w-4" />
            </button>
          )}
          {review.status !== "rejected" && (
            <button
              type="button"
              onClick={onReject}
              title="Reject"
              className="rounded-lg p-1.5 text-amber-600 transition-colors hover:bg-amber-50"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {review.status !== "spam" && (
            <button
              type="button"
              onClick={onMarkSpam}
              title="Mark as spam"
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted"
            >
              <AlertTriangle className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            title="Delete"
            className="rounded-lg p-1.5 text-red-600 transition-colors hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────

function CommerceReviewsPage() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(
    undefined,
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const stats = useQuery(
    (api as any).commerceReviews.queries.getStats,
    {},
  ) as
    | {
        total: number;
        pending: number;
        approved: number;
        rejected: number;
        spam: number;
        averageRating: number;
        recentReviews: number;
      }
    | undefined;

  const reviews = useQuery(
    (api as any).commerceReviews.queries.listAll,
    statusFilter ? { status: statusFilter } : {},
  ) as
    | {
        reviews: Array<{
          _id: string;
          productId: string;
          rating: number;
          title?: string;
          content?: string;
          status: string;
          isVerifiedPurchase: boolean;
          helpfulCount: number;
          userName: string;
          userEmail?: string;
          productName: string;
          productSlug?: string;
          createdAt: number;
        }>;
        total: number;
        hasMore: boolean;
      }
    | undefined;

  const approveMutation = useMutation(
    (api as any).commerceReviews.mutations.approve,
  );
  const rejectMutation = useMutation(
    (api as any).commerceReviews.mutations.reject,
  );
  const markSpamMutation = useMutation(
    (api as any).commerceReviews.mutations.markSpam,
  );
  const deleteMutation = useMutation(
    (api as any).commerceReviews.mutations.adminDelete,
  );
  const bulkApproveMutation = useMutation(
    (api as any).commerceReviews.mutations.bulkApprove,
  );
  const bulkRejectMutation = useMutation(
    (api as any).commerceReviews.mutations.bulkReject,
  );

  // ── Single Actions ─────────────────────────────────────────

  async function handleApprove(reviewId: string) {
    try {
      await approveMutation({ reviewId: reviewId as any });
      toast.success("Review approved");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to approve review",
      );
    }
  }

  async function handleReject(reviewId: string) {
    try {
      await rejectMutation({ reviewId: reviewId as any });
      toast.success("Review rejected");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to reject review",
      );
    }
  }

  async function handleMarkSpam(reviewId: string) {
    try {
      await markSpamMutation({ reviewId: reviewId as any });
      toast.success("Review marked as spam");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to mark as spam",
      );
    }
  }

  async function handleDelete(reviewId: string) {
    try {
      await deleteMutation({ reviewId: reviewId as any });
      setConfirmDelete(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(reviewId);
        return next;
      });
      toast.success("Review deleted");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to delete review",
      );
    }
  }

  // ── Bulk Actions ───────────────────────────────────────────

  async function handleBulkApprove() {
    if (selectedIds.size === 0) return;
    try {
      await bulkApproveMutation({
        reviewIds: Array.from(selectedIds) as any,
      });
      setSelectedIds(new Set());
      toast.success(`${selectedIds.size} review(s) approved`);
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to bulk approve",
      );
    }
  }

  async function handleBulkReject() {
    if (selectedIds.size === 0) return;
    try {
      await bulkRejectMutation({
        reviewIds: Array.from(selectedIds) as any,
      });
      setSelectedIds(new Set());
      toast.success(`${selectedIds.size} review(s) rejected`);
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to bulk reject",
      );
    }
  }

  // ── Select All Toggle ──────────────────────────────────────

  function toggleSelectAll() {
    if (!reviews) return;
    if (selectedIds.size === reviews.reviews.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(reviews.reviews.map((r) => r._id)));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // ── Status filter tabs ─────────────────────────────────────

  const filterTabs = [
    { label: "All", value: undefined, count: stats?.total },
    { label: "Pending", value: "pending", count: stats?.pending },
    { label: "Approved", value: "approved", count: stats?.approved },
    { label: "Rejected", value: "rejected", count: stats?.rejected },
    { label: "Spam", value: "spam", count: stats?.spam },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reviews</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Moderate customer product reviews.
        </p>
      </div>

      {/* Stats */}
      {stats === undefined ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl bg-muted"
            />
          ))}
        </div>
      ) : (
        <StatsCards stats={stats} />
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/30 p-1">
        <Filter className="ml-2 h-4 w-4 text-muted-foreground" />
        {filterTabs.map((tab) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => {
              setStatusFilter(tab.value);
              setSelectedIds(new Set());
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === tab.value
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 text-xs opacity-60">({tab.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <span className="text-sm text-muted-foreground">
            {selectedIds.size} selected
          </span>
          <button
            type="button"
            onClick={() => void handleBulkApprove()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
          >
            <Check className="h-3.5 w-3.5" />
            Approve Selected
          </button>
          <button
            type="button"
            onClick={() => void handleBulkReject()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50"
          >
            <X className="h-3.5 w-3.5" />
            Reject Selected
          </button>
        </div>
      )}

      {/* Reviews table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {reviews === undefined ? (
          <div className="space-y-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse border-b border-border bg-muted/30"
              />
            ))}
          </div>
        ) : reviews.reviews.length === 0 ? (
          <div className="p-10 text-center">
            <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              {statusFilter
                ? `No ${statusFilter} reviews found.`
                : "No reviews yet."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={
                        reviews.reviews.length > 0 &&
                        selectedIds.size === reviews.reviews.length
                      }
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-border"
                    />
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Product
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Rating
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Review
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Author
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Date
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {reviews.reviews.map((review) => (
                  <ReviewRow
                    key={review._id}
                    review={review}
                    isSelected={selectedIds.has(review._id)}
                    onToggleSelect={() => toggleSelect(review._id)}
                    onApprove={() => void handleApprove(review._id)}
                    onReject={() => void handleReject(review._id)}
                    onMarkSpam={() => void handleMarkSpam(review._id)}
                    onDelete={() => setConfirmDelete(review._id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary */}
      {reviews && reviews.reviews.length > 0 && (
        <div className="text-xs text-muted-foreground">
          Showing {reviews.reviews.length} of {reviews.total} review
          {reviews.total === 1 ? "" : "s"}
          {reviews.hasMore && " -- load more by increasing the page size"}
        </div>
      )}

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground">
              Delete Review
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to permanently delete this review? This
              action cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(confirmDelete)}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
