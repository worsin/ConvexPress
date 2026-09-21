/**
 * Aster · dashboard.reviews — the member's product reviews as
 * rule-separated rows with inline edit (underline inputs, pill save) and an
 * inline delete confirmation. Edit / confirm state is local; the mutations
 * (with validation and toasts) come from the loader.
 */
import { useState } from "react";
import { Star } from "lucide-react";

import { cn } from "@/lib/utils";
import type { DashboardReview, DashboardReviewUpdate, DashboardReviewsSurfaceData } from "@/templates/packs/core/surfaces/dashboard.reviews";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button, EmptyState, SmallCaps, UnderlineInput } from "../parts";
import { Notice } from "../parts/extra-commerce";
import { PageHeading, Row, RowList, RowSkeleton, StatusPill, TextAction, UnderlineTextarea, dashDate, type StatusTone } from "../parts/extra-dashboard";

const REVIEW_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  pending: { label: "Pending review", tone: "muted" },
  approved: { label: "Published", tone: "primary" },
  rejected: { label: "Rejected", tone: "destructive" },
  spam: { label: "Removed", tone: "muted" },
};

export default function AsterDashboardReviews({ data }: SurfaceProps<DashboardReviewsSurfaceData>) {
  const { reviews, actions } = data;
  const publishedCount = reviews?.filter((review) => review.status === "approved").length ?? 0;

  return (
    <div data-slot="dashboard-reviews" className="flex flex-col gap-10">
      <PageHeading eyebrow="Activity" title="My reviews" lede="View and manage your product reviews." />

      {reviews === undefined ? (
        <RowSkeleton rows={2} />
      ) : reviews.length === 0 ? (
        <EmptyState eyebrow="No reviews yet" title="Your reviews will appear here after you review a purchased product." />
      ) : (
        <div className="flex flex-col gap-6">
          <SmallCaps as="p" className="tabular-nums">
            {publishedCount} published review{publishedCount === 1 ? "" : "s"} of {reviews.length} total
          </SmallCaps>
          <RowList aria-label="Your reviews">
            {reviews.map((review) => (
              <ReviewRow key={review._id} review={review} actions={actions} />
            ))}
          </RowList>
        </div>
      )}
    </div>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star key={index} className={cn("size-3.5", index < rating ? "fill-primary text-primary" : "fill-none text-muted-foreground/30")} aria-hidden="true" />
      ))}
    </span>
  );
}

function StarInput({ value, onChange }: { value: number; onChange: (rating: number) => void }) {
  const [hoverValue, setHoverValue] = useState(0);
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
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
            className="rounded-full p-0.5 transition-colors hover:bg-primary/10"
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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const ok = await onSave(review._id, { rating, title: title.trim(), content: content.trim() });
      if (ok) onSaved();
    } finally {
      setSaving(false);
    }
  }

  const titleId = `review-title-${review._id}`;
  const contentId = `review-content-${review._id}`;

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-5 border-t border-border pt-5">
      <div className="flex flex-col gap-1.5">
        <SmallCaps as="span">Rating</SmallCaps>
        <StarInput value={rating} onChange={setRating} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={titleId} className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Title
        </label>
        <UnderlineInput id={titleId} type="text" value={title} onChange={(event) => setTitle(event.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={contentId} className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Review
        </label>
        <UnderlineTextarea id={contentId} value={content} onChange={(event) => setContent(event.target.value)} rows={3} />
      </div>
      <div className="flex flex-wrap items-center gap-5">
        <Button type="submit" variant="primary" className="h-10 px-5" disabled={saving}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
        <TextAction onClick={onCancel}>Cancel</TextAction>
      </div>
    </form>
  );
}

function ReviewRow({ review, actions }: { review: DashboardReview; actions: DashboardReviewsSurfaceData["actions"] }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const status = REVIEW_STATUS[review.status] ?? REVIEW_STATUS.pending;

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
    <Row className="gap-4 py-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="font-display text-xl leading-snug text-foreground">{review.productName}</p>
          <SmallCaps as="time" className="tabular-nums" {...({ dateTime: new Date(review.createdAt).toISOString() } as object)}>
            {dashDate(review.createdAt)}
          </SmallCaps>
        </div>
        <StatusPill tone={status.tone} label={status.label} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <StarRating rating={review.rating} />
        {review.isVerifiedPurchase ? <SmallCaps className="text-primary">Verified purchase</SmallCaps> : null}
      </div>

      {review.title ? <p className="text-base font-medium text-foreground">{review.title}</p> : null}
      {review.content ? <p className="text-base leading-7 text-muted-foreground">{review.content}</p> : null}

      {review.status === "rejected" && review.rejectionReason ? <Notice tone="destructive" title="Reason">{review.rejectionReason}</Notice> : null}

      {editing ? <EditReviewForm review={review} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} onSave={actions.update} /> : null}

      {confirmDelete ? (
        <Notice
          tone="destructive"
          title="Delete this review permanently?"
          action={
            <div className="flex flex-wrap items-center gap-5">
              <Button variant="primary" className="h-10 bg-destructive px-5 text-destructive-foreground hover:bg-destructive/90" disabled={deleting} onClick={() => void handleDelete()}>
                {deleting ? "Deleting..." : "Delete"}
              </Button>
              <TextAction tone="foreground" onClick={() => setConfirmDelete(false)}>
                Cancel
              </TextAction>
            </div>
          }
        />
      ) : null}

      {!editing && !confirmDelete ? (
        <div className="flex flex-wrap items-center gap-5">
          <TextAction tone="foreground" onClick={() => setEditing(true)}>
            Edit
          </TextAction>
          <TextAction tone="destructive" onClick={() => setConfirmDelete(true)}>
            Delete
          </TextAction>
        </div>
      ) : null}
    </Row>
  );
}
