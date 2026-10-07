import { useEffect, useRef, useState } from "react";
import { useAction, useConvex, useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { continueReindex, indexedTotal, type ReindexProgress } from "./reindex-model";
import { ReindexView } from "./ReindexView";

export function ReindexButton({ className }: { className?: string }) {
  const client = useConvex(), { user, can } = useAuth();
  if (!user || (!can("search.reindex") && !can("manage_options"))) return null;
  return <ReindexController key={`${client.url}:${user._id}`} className={className} />;
}
function ReindexController({ className }: { className?: string }) {
  const current = useQuery(api.search.reindex.current, {});
  const reindex = useAction(api.search.actions.reindex);
  const [latest, setLatest] = useState<ReindexProgress | null>();
  const [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false), [error, setError] = useState<string | null>(null);
  const mounted = useRef(true), running = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; running.current = false; }; }, []);
  useEffect(() => { setLatest(current); }, [current]);
  async function run() {
    if (running.current || current === undefined) return;
    running.current = true; setBusy(true); setConfirm(false); setError(null);
    try {
      const result = await continueReindex({ initial: latest, run: async args => {
        const response = await reindex(args);
        if ("updated" in response) throw Error("Expected full reindex progress");
        return response;
      }, active: () => mounted.current && running.current, onProgress: setLatest });
      if (mounted.current && result?.status === "completed" && result.errors === 0) toast.success(`Reindex complete: ${indexedTotal(result)} items indexed.`);
      else if (mounted.current && result?.status === "failed") toast.error("Reindex stopped. Progress is saved for retry.");
    } catch (caught) {
      if (mounted.current) { const e = caught as { data?: { message?: string }; message?: string }; setError(e.data?.message ?? "Reindex could not continue. Refresh and retry; completed work is saved."); }
    } finally { running.current = false; if (mounted.current) setBusy(false); }
  }
  return <ReindexView className={className} progress={latest} busy={busy} confirm={confirm} error={error} onConfirm={() => setConfirm(true)} onCancel={() => setConfirm(false)} onRun={() => void run()} onPause={() => { running.current = false; }} />;
}
