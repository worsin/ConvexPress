/**
 * Depot · dashboard.reviews — the member's product reviews as dense boxes:
 * product, date and status badge on the header row, stars, title, body,
 * rejection notice, inline edit form (Depot fields) and the delete
 * confirmation. Edit / confirm state is local; mutations come from the
 * loader, as in Core.
 */
import { Pencil, ShieldCheck, Star, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { cn } from "@/lib/utils";
import type { DashboardReview, DashboardReviewUpdate, DashboardReviewsSurfaceData } from "@/templates/packs/core/surfaces/dashboard.reviews";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button, Card, EmptyState, Skeleton } from "../parts";
import { Notice } from "../parts/extra-commerce";
import { Field, Input, Textarea } from "../parts/extra-plugins";
import { DashboardPageHeader, StatusBadge, dateOrDash } from "../parts/extra-dashboard";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending review",
  approved: "Published",
  rejected: "Rejected",
  spam: "Removed",
};

export default function DepotDashboardReviews({ data }: SurfaceProps<DashboardReviewsSurfaceData>) {
  const { reviews, actions } = data;
  const publishedCount = reviews?.filter((review) => review.status === "approved").length ?? 0;

  return (
    <div data-slot="dashboard-reviews" data-pack="depot" className="flex flex-col gap-4">
      <DashboardPageHeader eyebrow="Shop" title="My reviews" description="View and manage your product reviews." meta={reviews ? `${publishedCount} published of ${reviews.length} total` : undefined} />

      {reviews === undefined ? (
        <div className="flex flex-col gap-3" aria-hidden="true">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : reviews.length === 0 ? (
        <EmptyState title="You haven't written any reviews yet." description="Your reviews will appear here after you review a purchased product." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {reviews.map((review) => (
            <ReviewCard key={review._id} review={review} actions={actions} />
          ))}
        </div>
      )}
    </div>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star key={index} className={cn("size-3.5", index < rating ? "fill-primary text-primary" : "fill-none text-muted-foreground/30")} aria-hidden="true" />
      ))}
    </span>
  );
}

function StarInput({ value, onChange }: { value: number; onChange: (rating: number) => void }) {
  const [hoverValue, setHoverValue] = useState(0);
  return (
    <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Rating">
      {Array.from({ length: 5 }).map((_, index) => {
        const starValue = index + 1;
        const filled = starValue <= (hoverValue || value);
        return (
          <button
            key={index}
            type="button"
            role="radio"
            aria-checked={value === starValue}
            aria-label={`${starValue} star${starValue === 1 ? "" : "s"}`}
            onClick={() => onChange(starValue)}
            onMouseEnter={() => setHoverValue(starValue)}
            onMouseLeave={() => setHoverValue(0)}
            className="rounded-md p-0.5 transition-colors hover:bg-primary/10"
          >
            <Star className={cn("size-5", filled ? "fill-primary text-primary" : "fill-none text-muted-foreground/40")} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

function EditReviewForm({ review, onCancel, onSaved, onSave }: { review: DashboardReview; onCancel: () => void; onSaved: () => void; onSave: (reviewId: string, input: DashboardReviewUpdate) => Promise<boolean> }) {
  const [rating, setRating] = useState(review.rating);
  const [title, setTitle] = useState(review.title ?? "");
  const [content, setContent] = useState(review.content ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const ok = await onSave(review._id, { rating, title: title.trim(), content: content.trim() });
      if (ok) onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3 rounded-md border border-border bg-muted/30 p-3">
      <Field label="Rating">
        <StarInput value={rating} onChange={setRating} />
      </Field>
      <Field label="Title" htmlFor={`review-title-${review._id}`}>
        <Input id={`review-title-${review._id}`} type="text" value={title} onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <Field label="Review" htmlFor={`review-content-${review._id}`}>
        <Textarea id={`review-content-${review._id}`} value={content} onChange={(event) => setContent(event.target.value)} rows={3} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ReviewCard({ review, actions }: { review: DashboardReview; actions: DashboardReviewsSurfaceData["actions"] }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await actions.remove(review._id);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <Card as="article" className="flex flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">{review.productName}</h2>
          <p className="text-xs tabular-nums text-muted-foreground">{dateOrDash(review.createdAt)}</p>
        </div>
        <StatusBadge status={review.status} label={STATUS_LABEL[review.status] ?? STATUS_LABEL.pending} />
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-center gap-3">
          <StarRating rating={review.rating} />
          {review.isVerifiedPurchase ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
              <ShieldCheck className="size-3" aria-hidden="true" />
              Verified
            </span>
          ) : null}
        </div>
        {review.title ? <p className="text-sm font-semibold text-foreground">{review.title}</p> : null}
        {review.content ? <p className="text-[13px] leading-5 text-muted-foreground">{review.content}</p> : null}

        {review.status === "rejected" && review.rejectionReason ? <Notice tone="danger">Reason: {review.rejectionReason}</Notice> : null}

        {editing ? <EditReviewForm review={review} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} onSave={actions.update} /> : null}

        {confirmDelete ? (
          <Notice
            tone="danger"
            title="Delete this review permanently?"
            action={
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void handleDelete()} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {deleting ? "Deleting..." : "Delete"}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </div>
            }
          />
        ) : null}
      </div>

      {!editing && !confirmDelete ? (
        <div className="flex items-center gap-2 border-t border-border px-3 py-2">
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" aria-hidden="true" />
            Edit
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(true)} className="border-destructive/30 text-destructive hover:bg-destructive/10">
            <Trash2 className="size-3.5" aria-hidden="true" />
            Delete
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
