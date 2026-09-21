import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { Button } from "@/components/ui/button";

export function SyncedConsumerIndex() {
  const progress = useQuery(api.syncedBlocks.consumerIndex.status, {});
  const blocked = useQuery(api.syncedBlocks.consumerIndex.blockedDocument, progress?.status === "blocked" ? {} : "skip");
  const begin = useMutation(api.syncedBlocks.consumerIndex.begin), step = useMutation(api.syncedBlocks.consumerIndex.step);
  const active = useRef(true), stopped = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { active.current = true; return () => { active.current = false; stopped.current = true; }; }, []);
  async function run() {
    if (busy) return;
    setBusy(true); setError(""); stopped.current = false;
    try {
      let current = await begin({});
      // Each call rechecks the actual current session and processes one record.
      // Closing/changing environments stops dispatch; committed progress stays.
      while (active.current && !stopped.current && current.generation && current.status !== "ready" && current.status !== "unconfigured") {
        current = await step({ generation: current.generation, expectedSequence: current.sequence });
        if (current.status === "blocked") break;
      }
    } catch { if (active.current) setError("Indexing could not be confirmed. Resume to check saved progress and continue safely."); }
    finally { if (active.current) setBusy(false); }
  }
  if (!progress) return null;
  const ready = progress.status === "ready";
  return <section aria-label="Reusable page index" className="space-y-3 rounded-lg border border-border bg-card p-4">
    <div><h2 className="text-sm font-semibold">Reusable page index</h2><p role="status" aria-live="polite" className="mt-1 text-sm text-muted-foreground">{ready ? "Page dependencies and reusable forms are verified." : progress.status === "unconfigured" ? "Complete website setup or the current restore before indexing pages." : progress.status === "blocked" ? "A document needs attention before verification can finish." : progress.status === "stale" ? "Existing pages need to be checked for reusable content." : progress.phase === "forms" ? "Verifying reusable forms on existing pages." : "Checking page dependencies."} {progress.documents > 0 && `${progress.documents} records checked.`}</p></div>
    {progress.errorCode && <p className="text-sm text-destructive">{progress.errorCode === "SYNCED_FORMS_REQUIRES_REFRESH" ? "Refresh the reusable content’s linked pages or save the affected page, then resume verification." : "Repair the affected document, then resume verification."}</p>}
    {blocked && <a className="inline-block text-sm font-medium underline underline-offset-4" href={`#/${blocked.type === "page" ? "pages" : "posts"}/${blocked.id}/edit`}>Open {blocked.title}</a>}
    {!ready && progress.status !== "unconfigured" && <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void run()}>{busy ? "Indexing pages…" : progress.status === "stale" ? "Index existing pages" : "Resume indexing"}</Button>
      {busy && <Button size="sm" variant="ghost" onClick={() => { stopped.current = true; }}>Pause after this record</Button>}
    </div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
