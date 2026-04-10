import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  Star,
  ThumbsUp,
  ShieldCheck,
  MessageSquare,
  ChevronDown,
} from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";

// ─── Star Rating Display ─────────────────────────────────────────────────

function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "lg" ? "h-5 w-5" : size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`${sizeClass} ${
            i < rating
              ? "fill-amber-400 text-amber-400"
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
            className="rounded p-0.5 transition-colors hover:bg-amber-50"
          >
            <Star
              className={`h-6 w-6 ${
                filled
                  ? "fill-amber-400 text-amber-400"
                  : "fill-none text-muted-foreground/40"
              }`}
            />
          </button>
        );
      })}
      {value > 0 && (
        <span className="ml-2 text-sm text-muted-foreground">
          {value} / 5
        </span>
      )}
    </div>
  );
}

// ─── Rating Distribution Bar ─────────────────────────────────────────────

function RatingBar({
  star,
  count,
  total,
}: {
  star: number;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-8 text-right text-muted-foreground">{star}</span>
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-amber-400 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-xs text-muted-foreground">{count}</span>
    </div>
  );
}

// ─── Aggregate Rating Summary ────────────────────────────────────────────

function RatingSummary({
  productId,
}: {
  productId: string;
}) {
  const ratingData = useQuery(
    (api as any).commerceReviews.queries.getProductRating,
    { productId: productId as any },
  ) as
    | {
        averageRating: number;
        totalReviews: number;
        distribution: Record<number, number>;
      }
    | undefined;

  if (!ratingData) {
    return <div className="h-32 animate-pulse rounded-xl bg-muted" />;
  }

  if (ratingData.totalReviews === 0) {
    return null;
  }

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      {/* Average rating */}
      <div className="text-center">
        <p className="text-4xl font-bold text-foreground">
          {ratingData.averageRating.toFixed(1)}
        </p>
        <StarRating rating={Math.round(ratingData.averageRating)} size="md" />
        <p className="mt-1 text-xs text-muted-foreground">
          {ratingData.totalReviews} review{ratingData.totalReviews === 1 ? "" : "s"}
        </p>
      </div>

      {/* Distribution */}
      <div className="w-full max-w-xs space-y-1">
        {[5, 4, 3, 2, 1].map((star) => (
          <RatingBar
            key={star}
            star={star}
            count={ratingData.distribution[star] || 0}
            total={ratingData.totalReviews}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Helpful Button ──────────────────────────────────────────────────────

function HelpfulButton({
  reviewId,
  helpfulCount,
}: {
  reviewId: string;
  helpfulCount: number;
}) {
  const hasVoted = useQuery(
    (api as any).commerceReviews.queries.hasVoted,
    { reviewId: reviewId as any },
  ) as boolean | undefined;

  const voteHelpful = useMutation(
    (api as any).commerceReviews.mutations.voteHelpful,
  );

  const [busy, setBusy] = useState(false);

  async function handleVote() {
    setBusy(true);
    try {
      await voteHelpful({ reviewId: reviewId as any });
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Please sign in to vote",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleVote()}
      disabled={busy || hasVoted === undefined}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
        hasVoted
          ? "border-primary/30 bg-primary/5 text-primary"
          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <ThumbsUp className="h-3.5 w-3.5" />
      Helpful{helpfulCount > 0 ? ` (${helpfulCount})` : ""}
    </button>
  );
}

// ─── Single Review Card ──────────────────────────────────────────────────

function ReviewCard({
  review,
}: {
  review: {
    _id: string;
    rating: number;
    title?: string;
    content?: string;
    isVerifiedPurchase: boolean;
    helpfulCount: number;
    userName: string;
    userAvatar?: string;
    createdAt: number;
  };
}) {
  return (
    <div className="border-b border-border py-5 last:border-b-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {review.userAvatar ? (
            <img
              src={review.userAvatar}
              alt={review.userName}
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
              {review.userName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">
                {review.userName}
              </p>
              {review.isVerifiedPurchase && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                  <ShieldCheck className="h-3 w-3" />
                  Verified Purchase
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {new Date(review.createdAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
        </div>
        <StarRating rating={review.rating} />
      </div>

      {/* Content */}
      <div className="mt-3">
        {review.title && (
          <h4 className="text-sm font-semibold text-foreground">
            {review.title}
          </h4>
        )}
        {review.content && (
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {review.content}
          </p>
        )}
      </div>

      {/* Helpful */}
      <div className="mt-3">
        <HelpfulButton
          reviewId={review._id}
          helpfulCount={review.helpfulCount}
        />
      </div>
    </div>
  );
}

// ─── Review Form ─────────────────────────────────────────────────────────

function WriteReviewForm({
  productId,
  onSuccess,
}: {
  productId: string;
  onSuccess: () => void;
}) {
  const submitMutation = useMutation(
    (api as any).commerceReviews.mutations.submit,
  );

  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (rating === 0) {
      toast.error("Please select a rating");
      return;
    }

    setSubmitting(true);
    try {
      await submitMutation({
        productId: productId as any,
        rating,
        ...(title.trim() ? { title: title.trim() } : {}),
        ...(content.trim() ? { content: content.trim() } : {}),
      });
      toast.success("Review submitted! It will appear after moderation.");
      setRating(0);
      setTitle("");
      setContent("");
      onSuccess();
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to submit review",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      {/* Rating */}
      <div>
        <label className="block text-sm font-medium text-foreground">
          Rating
        </label>
        <div className="mt-1">
          <StarInput value={rating} onChange={setRating} />
        </div>
      </div>

      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-foreground">
          Title (optional)
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Summarize your experience"
          className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm"
        />
      </div>

      {/* Content */}
      <div>
        <label className="block text-sm font-medium text-foreground">
          Review (optional)
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Tell others about your experience with this product..."
          rows={4}
          className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting || rating === 0}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Submitting..." : "Submit Review"}
      </button>
    </form>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────

export function ProductReviews({ productId }: { productId: string }) {
  const [sortBy, setSortBy] = useState<string>("newest");
  const [showForm, setShowForm] = useState(false);

  const canReviewResult = useQuery(
    (api as any).commerceReviews.queries.canReview,
    { productId: productId as any },
  ) as
    | {
        canReview: boolean;
        reason?: string;
        isVerifiedPurchase?: boolean;
        existingReviewId?: string;
      }
    | undefined;

  const reviewsData = useQuery(
    (api as any).commerceReviews.queries.getByProduct,
    {
      productId: productId as any,
      sortBy,
      limit: 20,
    },
  ) as
    | {
        reviews: Array<{
          _id: string;
          rating: number;
          title?: string;
          content?: string;
          isVerifiedPurchase: boolean;
          helpfulCount: number;
          userName: string;
          userAvatar?: string;
          createdAt: number;
        }>;
        total: number;
        hasMore: boolean;
      }
    | undefined;

  return (
    <div className="space-y-6">
      {/* Section heading */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">
          Customer Reviews
        </h2>
        {canReviewResult?.canReview && (
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            <Star className="h-4 w-4" />
            Write a Review
          </button>
        )}
      </div>

      {/* Rating summary */}
      <RatingSummary productId={productId} />

      {/* Write review form */}
      {showForm && canReviewResult?.canReview && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold text-foreground">
            Write Your Review
          </h3>
          <WriteReviewForm
            productId={productId}
            onSuccess={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Cannot review message */}
      {canReviewResult && !canReviewResult.canReview && canReviewResult.reason && (
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          {canReviewResult.reason}
        </div>
      )}

      {/* Sort controls */}
      {reviewsData && reviewsData.total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {reviewsData.total} review{reviewsData.total === 1 ? "" : "s"}
          </p>
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="appearance-none rounded-lg border border-border bg-background py-1.5 pl-3 pr-8 text-sm"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="highest">Highest Rated</option>
              <option value="lowest">Lowest Rated</option>
              <option value="helpful">Most Helpful</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>
      )}

      {/* Reviews list */}
      {reviewsData === undefined ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl bg-muted"
            />
          ))}
        </div>
      ) : reviewsData.reviews.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            No reviews yet. Be the first to review this product!
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card px-5">
          {reviewsData.reviews.map((review) => (
            <ReviewCard key={review._id} review={review} />
          ))}
        </div>
      )}
    </div>
  );
}
