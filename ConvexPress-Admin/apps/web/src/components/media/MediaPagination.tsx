import { Component, type ReactNode } from "react";
import { mediaProgressText, type MediaPageStatus } from "./media-pagination";

export function MediaContinuation({ status, count, loadMore, pageSize = 40, counting = false, disabled = false }: {
  status: MediaPageStatus; count: number; loadMore: (count: number) => void; pageSize?: number; counting?: boolean; disabled?: boolean;
}) {
  return <div className="flex flex-wrap items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
    <span role="status" aria-live="polite">{mediaProgressText(count, status, counting)}</span>
    {status !== "Exhausted" && <button type="button" className="rounded border border-border px-3 py-1.5 text-foreground disabled:opacity-50" disabled={disabled || status !== "CanLoadMore"} onClick={() => loadMore(pageSize)}>
      {status === "LoadingMore" ? "Loading…" : counting ? "Continue counting" : "Load more media"}
    </button>}
  </div>;
}

/** Keep a bounded-read refusal local to this library/picker, not the Admin app. */
export class MediaReadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div role="alert" className="rounded border border-border p-3 text-sm">
      <p>Media could not be loaded. Your access may have changed, or this media page exceeded its read budget.</p>
      <button type="button" className="mt-2 rounded border border-border px-3 py-1" onClick={() => this.setState({ failed: false })}>Retry media</button>
    </div>;
  }
}
