import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";

export function SyncedRefreshStatus({ id, generation, published, canRetry, disabled }: { id: Id<"syncedBlocks">; generation: number; published: boolean; canRetry: boolean; disabled: boolean }) {
  const progress = useQuery(api.syncedBlocks.refresh.status, { id });
  const retry = useMutation(api.syncedBlocks.refresh.retry);
  const start = useMutation(api.syncedBlocks.refresh.start);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  if (progress === undefined || progress === null && (!published || !canRetry)) return null;
  if (progress === null) return <section aria-label="Linked page refresh" className="space-y-2 rounded-lg border border-border bg-card p-4">
    <p className="text-sm font-medium">Linked pages have not been refreshed.</p>
    <p className="text-sm text-muted-foreground">For imported content, finish page discovery, then refresh reusable forms using your current publishing and Forms permissions.</p>
    <Button size="sm" variant="outline" disabled={disabled || busy} onClick={async () => {
      if (busy) return;
      setBusy(true); setError("");
      try { await start({ id, expectedGeneration: generation }); }
      catch { setError("The refresh could not be confirmed. Check the page index, your permissions, and the current publication before trying again."); }
      finally { setBusy(false); }
    }}>{busy ? "Requesting refresh…" : "Refresh linked pages"}</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
  const count = `${progress.processed} ${progress.processed === 1 ? "page" : "pages"} checked`;
  const interrupted = progress.errorCode === "SYNCED_REFRESH_CALLBACK_FAILED" || progress.errorCode === "SYNCED_REFRESH_RECOVERY_REQUIRED";
  const message = interrupted ? `Refresh interrupted. ${count}.` : progress.errorCode ? `Refresh paused. ${count}.`
    : progress.status === "pending" ? `Updating linked pages… ${count}.`
    : progress.status === "failed" ? `${count}. ${progress.failed} ${progress.failed === 1 ? "page needs" : "pages need"} another refresh.`
      : progress.status === "completed" ? `Linked page refresh complete. ${count}.`
        : "A newer publication has replaced this refresh.";
  return <section aria-label="Linked page refresh" className="space-y-2 rounded-lg border border-border bg-card p-4">
    <p role="status" aria-live="polite" className="text-sm font-medium">{message}</p>
    {progress.status === "failed" && <p className="text-sm text-muted-foreground">{interrupted ? "The background refresh stopped before it finished. Retry to check all linked pages using your current permissions." : "Finish page discovery and check your publishing and Forms permissions, then retry."} Forms awaiting an update remain unavailable until their current definitions are verified.</p>}
    {canRetry && progress.status !== "superseded" && <Button size="sm" variant="outline" disabled={disabled || busy} onClick={async () => {
      if (busy) return;
      setBusy(true); setError("");
      try { await retry({ id, jobId: progress.jobId, expectedAttempt: progress.attempt }); }
      catch (failure) {
        const data = failure && typeof failure === "object" && "data" in failure ? failure.data : null;
        const code = data && typeof data === "object" && "code" in data ? data.code : null;
        setError(code === "SYNCED_REFRESH_INDEX" || code === "SYNCED_REFRESH_INDEX_CHANGED"
          ? "Index existing pages in the Reusable page index above, then retry the refresh."
          : "The retry could not be confirmed. Check the current refresh status before trying again.");
      }
      finally { setBusy(false); }
    }}>{busy ? "Requesting refresh…" : progress.status === "failed" ? "Retry refresh" : progress.status === "completed" ? "Refresh linked pages" : "Restart refresh"}</Button>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
