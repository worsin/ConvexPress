import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { indexedTotal, type ReindexProgress } from "./reindex-model";
export function ReindexView({ className, progress, busy, confirm, error, onConfirm, onCancel, onRun, onPause }: {
  className?: string; progress?: ReindexProgress | null; busy: boolean; confirm: boolean; error: string | null;
  onConfirm(): void; onCancel(): void; onRun(): void; onPause(): void;
}) {
  const complete = progress?.status === "completed" && progress.errors === 0;
  const resumable = progress && !complete && !progress.needsRestart;
  return <div className={cn("flex flex-col gap-3", className)}>
    <div className="flex items-center gap-2">
      {busy ? <button type="button" className="rounded-sm border border-border px-4 py-2 text-sm" onClick={onPause}>Pause after current batch</button>
        : confirm ? <><span className="text-xs text-muted-foreground">{progress?.needsRestart ? "Restart this reindex from the beginning?" : "Reindex all searchable content?"}</span><button type="button" className="rounded-sm bg-primary px-3 py-1.5 text-xs text-primary-foreground" onClick={onRun}>Yes, Reindex</button><button type="button" className="px-3 py-1.5 text-xs" onClick={onCancel}>Cancel</button></>
        : <button type="button" className="flex items-center gap-2 rounded-sm border border-border px-4 py-2 text-sm disabled:opacity-50" disabled={progress === undefined} onClick={resumable ? onRun : onConfirm}><RefreshCw className="size-4" />{progress?.needsRestart ? "Restart reindex" : resumable ? "Resume reindex" : "Reindex All Content"}</button>}
    </div>
    {progress?.needsRestart && <p className="text-xs">Installed search sources changed. Restart to include the current sources.</p>}
    {progress && <div role="status" aria-live="polite" className="rounded-sm border border-border p-3 text-xs">
      <p className="font-medium">{complete ? "Reindex completed successfully" : progress.status === "failed" ? "Reindex stopped before completion" : busy ? "Reindex in progress" : "Reindex progress saved"}</p>
      <p className="mt-1 text-muted-foreground">{progress.processed} source items processed · {indexedTotal(progress)} indexed · {progress.removed} stale entries removed</p>
      <p className="text-muted-foreground">Posts: {progress.indexed.post} | Pages: {progress.indexed.page} | Media: {progress.indexed.media} | Comments: {progress.indexed.comment} | Courses: {progress.indexed.course} | Products: {progress.indexed.product} | Events: {progress.indexed.event}</p>
      {progress.contentType && !complete && <p>Current scope: {progress.contentType}. Finish this scope before starting a full reindex.</p>}
      {progress.status === "failed" && <p className="mt-2">An item could not be indexed. Correct the cause and resume; completed work is saved. {progress.failure && (progress.failure.contentType === "page" || progress.failure.contentType === "post") && <a className="underline" href={`/#/${progress.failure.contentType === "page" ? "pages" : "posts"}/${encodeURIComponent(progress.failure.contentId)}/edit`}>Review {progress.failure.contentType}</a>}</p>}
      {!complete && progress.status !== "failed" && <p className="mt-2">You can leave this page and resume from saved progress.</p>}
    </div>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}
