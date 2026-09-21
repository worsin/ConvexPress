import { useLiveConnection } from "../../hooks/useLiveConnection";
import { useId, useState, type ReactNode } from "react";
import { usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";

type Entry = FunctionReturnType<typeof api.commerceReviews.queries.getByProduct>["page"][number];
type Review = Extract<Entry, { state: "review" }>;
type Sort = "newest" | "oldest" | "highest" | "lowest" | "helpful";
const sorts: { value: Sort; label: string }[] = [
  { value: "newest", label: "Newest" }, { value: "oldest", label: "Oldest" },
  { value: "highest", label: "Highest rated" }, { value: "lowest", label: "Lowest rated" },
  { value: "helpful", label: "Most helpful" },
];

export function ProductReviewFeed({ productId, instanceKey, renderReview }: {
  productId: string; instanceKey: string; renderReview: (review: Review) => ReactNode;
}) {
  const [sortBy, setSortBy] = useState<Sort>("newest");
  const selectId = useId();
  const connection = useLiveConnection();
  const { results, status, loadMore } = usePaginatedQuery(api.commerceReviews.queries.getByProduct,
    { productId: productId as Id<"commerce_products">, instanceKey, sortBy }, { initialNumItems: 12 });
  if (!connection.isWebSocketConnected) return <p role="status">Reconnecting to reviews…</p>;
  if (results.some(entry => entry.state === "unavailable")) return <p role="status">Reviews are unavailable.</p>;
  const reviews = results.filter((entry): entry is Review => entry.state === "review");
  const loading = status === "LoadingFirstPage" || status === "LoadingMore";
  return <section aria-label="Customer reviews" className="space-y-5" aria-busy={loading}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {status === "LoadingFirstPage" ? "Loading reviews…" : `${reviews.length} ${reviews.length === 1 ? "review" : "reviews"} shown`}
      </p>
      <div className="flex items-center gap-2 text-sm">
        <label htmlFor={selectId}>Sort reviews</label>
        <select id={selectId} value={sortBy} onChange={event => {
          const next = sorts.find(sort => sort.value === event.target.value); if (next) setSortBy(next.value);
        }} className="min-h-11 rounded-lg border border-border bg-background px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          {sorts.map(sort => <option key={sort.value} value={sort.value}>{sort.label}</option>)}
        </select>
      </div>
    </div>
    {reviews.length > 0 && <div className="rounded-2xl border border-border bg-card px-5">{reviews.map(review => <div key={review._id}>{renderReview(review)}</div>)}</div>}
    {status === "Exhausted" && reviews.length === 0 && <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">No reviews yet.</p>}
    {status !== "Exhausted" && status !== "LoadingFirstPage" && <button type="button" disabled={loading} onClick={() => loadMore(12)}
      className="min-h-11 rounded-lg border border-border px-5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none">
      {loading ? "Loading reviews…" : "Load more reviews"}
    </button>}
  </section>;
}
