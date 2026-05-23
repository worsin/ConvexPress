import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  Star,
  Clock,
  Check,
  X,
  Pencil,
  Trash2,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { useSettings } from "@/contexts/SettingsContext";

export const Route = createFileRoute("/dashboard/reviews")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  component: DashboardReviewsPage,
});

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
              ? "fill-primary text-primary"
              : "fill-none text-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );
}

// ─── Clickable Star Input ────────────────────────────────────────────────

function StarInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (rating: number) => void;
}) {
  const [hoverValue, setHoverValue] = useState(0);

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => {
        const starValue = i + 1;
        const filled = starValue <= (hoverValue || value);
        return (
          <button
            key={i}
            type="button"
            onClick={() => onChange(starValue)}
            onMouseEnter={() => setHoverValue(starValue)}
            onMouseLeave={() => setHoverValue(0)}
            className="rounded p-0.5 transition-colors hover:bg-primary/10"
          >
            <Star
              className={`h-5 w-5 ${
                filled
                  ? "fill-primary text-primary"
                  : "fill-none text-muted-foreground/40"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

// ─── Status Badge ────────────────────────────────────────────────────────

function ReviewStatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: typeof Clock; style: string; label: string }> = {
    pending: {
      icon: Clock,
      style: "bg-secondary text-secondary-foreground",
      label: "Pending Review",
    },
    approved: {
      icon: Check,
      style: "bg-primary/10 text-primary",
      label: "Published",
    },
    rejected: {
      icon: X,
      style: "bg-destructive/10 text-destructive",
      label: "Rejected",
    },
    spam: {
      icon: X,
      style: "bg-muted text-muted-foreground",
      label: "Removed",
    },
  };

  const c = config[status] ?? config.pending;
  const Icon = c.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${c.style}`}
    >
      <Icon className="h-3 w-3" />
      {c.label}
    </span>
  );
}

// ─── Edit Form ───────────────────────────────────────────────────────────

function EditReviewForm({
  review,
  onCancel,
  onSaved,
}: {
  review: {
    _id: string;
    rating: number;
    title?: string;
    content?: string;
  };
  onCancel: () => void;
  onSaved: () => void;
}) {
  const updateMutation = useMutation(
    (api as any).commerceReviews.mutations.update,
  );

  const [rating, setRating] = useState(review.rating);
  const [title, setTitle] = useState(review.title ?? "");
  const [content, setContent] = useState(review.content ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) {
      toast.error("Please select a rating");
      return;
    }

    setSaving(true);
    try {
      await updateMutation({
        reviewId: review._id as any,
        rating,
        title: title.trim(),
        content: content.trim(),
      });
      toast.success(
        "Review updated. Changes may require re-moderation.",
      );
      onSaved();
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to update review",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="mt-4 space-y-3 rounded-xl border border-border bg-muted/20 p-4"
    >
      <div>
        <label className="block text-xs font-medium text-muted-foreground">
          Rating
        </label>
        <div className="mt-1">
          <StarInput value={rating} onChange={setRating} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground">
          Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground">
          Review
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-4 py-1.5 text-xs font-medium text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Review Card ─────────────────────────────────────────────────────────

function ReviewCard({
  review,
}: {
  review: {
    _id: string;
    rating: number;
    title?: string;
    content?: string;
    status: string;
    isVerifiedPurchase: boolean;
    helpfulCount: number;
    productName: string;
    productSlug?: string;
    createdAt: number;
    rejectionReason?: string;
  };
}) {
  const removeMutation = useMutation(
    (api as any).commerceReviews.mutations.remove,
  );

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await removeMutation({ reviewId: review._id as any });
      toast.success("Review deleted");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to delete review",
      );
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {review.productName}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDate(review.createdAt)}
          </p>
        </div>
        <ReviewStatusBadge status={review.status} />
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        <div className="flex items-center gap-3">
          <StarRating rating={review.rating} />
          {review.isVerifiedPurchase && (
            <span className="inline-flex items-center gap-1 text-xs text-primary">
              <ShieldCheck className="h-3 w-3" />
              Verified
            </span>
          )}
        </div>
        {review.title && (
          <p className="mt-2 text-sm font-medium text-foreground">
            {review.title}
          </p>
        )}
        {review.content && (
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {review.content}
          </p>
        )}

        {/* Rejection reason */}
        {review.status === "rejected" && review.rejectionReason && (
          <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            Reason: {review.rejectionReason}
          </div>
        )}

        {/* Edit form */}
        {editing && (
          <EditReviewForm
            review={review}
            onCancel={() => setEditing(false)}
            onSaved={() => setEditing(false)}
          />
        )}

        {/* Delete confirmation */}
        {confirmDelete && (
          <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
            <p className="text-sm text-destructive">
              Delete this review permanently?
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 border-t border-border px-5 py-3">
        {!editing && !confirmDelete && (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────

function DashboardReviewsPage() {
  const settings = useSettings();
  const reviewsEnabled = settings?.plugins?.commerceReviewsEnabled === true;
  const reviews = useQuery(
    (api as any).commerceReviews.queries.getMyReviews,
    reviewsEnabled ? {} : "skip",
  ) as
    | Array<{
        _id: string;
        rating: number;
        title?: string;
        content?: string;
        status: string;
        isVerifiedPurchase: boolean;
        helpfulCount: number;
        productName: string;
        productSlug?: string;
        productImage?: string;
        createdAt: number;
        rejectionReason?: string;
      }>
    | undefined;

  const publishedCount =
    reviews?.filter((r) => r.status === "approved").length ?? 0;

  return (
    <PublicPluginGate pluginId="commerceReviews">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-sm font-medium text-foreground">My Reviews</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            View and manage your product reviews.
          </p>
        </div>

        {reviews === undefined ? (
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="h-40 animate-pulse rounded-2xl bg-muted"
              />
            ))}
          </div>
        ) : reviews.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              You haven't written any reviews yet.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Your reviews will appear here after you review a purchased
              product.
            </p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
              {publishedCount} published review
              {publishedCount === 1 ? "" : "s"} out of {reviews.length}{" "}
              total
            </div>

            {/* Review cards */}
            <div className="space-y-4">
              {reviews.map((review) => (
                <ReviewCard key={review._id} review={review} />
              ))}
            </div>
          </>
        )}
      </div>
    </PublicPluginGate>
  );
}
