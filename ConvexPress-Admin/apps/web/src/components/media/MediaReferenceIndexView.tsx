import type { MediaIndexProgress } from "./media-reference-index-model";
const buttonClass = "rounded border border-border px-3 py-1.5 text-sm disabled:opacity-50";
export function MediaReferenceIndexView({ progress, busy, error, cleanupMessage, onContinue, onPause, onCleanup }: {
  progress: MediaIndexProgress | undefined; busy: boolean; error: string | null; cleanupMessage: string | null;
  onContinue: () => void; onPause: () => void; onCleanup: () => void;
}) {
  const status = progress?.status;
  const percent = progress && progress.totalOwners > 0 ? Math.floor(progress.completedOwners / progress.totalOwners * 100) : 0;
  return <details className="mb-3 rounded border border-border bg-card p-3" open={status === "building" || status === "blocked" || status === "stale"}>
    <summary className="cursor-pointer text-sm font-medium">Media deletion safety{status === "ready" ? " · Ready" : status === "building" ? " · Indexing" : ""}</summary>
    <div className="mt-3 space-y-2 text-sm">
      {!progress && <p role="status">Checking deletion safety…</p>}
      {status === "unconfigured" && <p>Existing reference checks remain active. To enable indexing for larger libraries, configure a media reference epoch in this site’s deployment, then return here to build the index.</p>}
      {status === "ready" && <p role="status">Index ready. Deletion checks include current attachments and retained history.</p>}
      {(status === "stale" || status === "building" || status === "blocked") && <>
        <p>Deletion is paused until this site’s media reference index is complete. Uploading and editing remain available.</p>
        {status !== "stale" && <><progress aria-label="Media reference indexing progress" max={100} value={percent} className="w-full" /><p role="status">{progress!.completedOwners} of {progress!.totalOwners} content groups checked · {progress!.documents} records indexed.</p></>}
        {status === "blocked" && <p role="alert">{progress?.errorCode === "MEDIA_INDEX_INVALIDATED" ? "Indexing must resume after site maintenance." : "Indexing stopped safely. An oversized or unsupported record may need repair before retrying."}</p>}
        {busy ? <button type="button" className={buttonClass} onClick={onPause}>Pause after current page</button> : <button type="button" className={buttonClass} onClick={onContinue}>{status === "stale" ? "Start indexing" : status === "blocked" ? "Retry indexing" : "Continue indexing"}</button>}
      </>}
      {status === "ready" && <button type="button" className={buttonClass} disabled={busy} onClick={onCleanup}>{busy ? "Cleaning index records…" : "Clean older index records"}</button>}
      {cleanupMessage && <p role="status">{cleanupMessage}</p>}
      {error && <p role="alert">{error}</p>}
      {progress?.generation && <details className="text-xs text-muted-foreground"><summary>Index details</summary><p className="mt-1 break-all">Generation: {progress.generation}</p><p>Completed pages: {progress.pages}</p>{progress.errorCode && <p>Reason: {progress.errorCode}</p>}</details>}
    </div>
  </details>;
}
