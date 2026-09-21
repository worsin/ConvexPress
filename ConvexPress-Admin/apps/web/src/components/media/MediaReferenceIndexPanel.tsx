import { useEffect, useRef, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { useAuth } from "@/lib/auth-context";
import { MediaReadBoundary } from "./MediaPagination";
import { MediaReferenceIndexView } from "./MediaReferenceIndexView";
import { continueMediaIndex, type MediaIndexProgress } from "./media-reference-index-model";

export function MediaReferenceIndexPanel() {
  const { user, can } = useAuth();
  const client = useConvex();
  if (!user || !can("manage_options")) return null;
  return <MediaReadBoundary key={`${client.url}:${user._id}`}><IndexController /></MediaReadBoundary>;
}
function IndexController() {
  const progress = useQuery(api.media.reverseBackfill.status, {});
  const begin = useMutation(api.media.reverseBackfill.begin);
  const step = useMutation(api.media.reverseBackfill.step);
  const cleanup = useMutation(api.media.reverseBackfill.cleanupObsolete);
  const [latest, setLatest] = useState<MediaIndexProgress>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);
  const running = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; running.current = false; }; }, []);
  useEffect(() => { setLatest(progress); }, [progress]);
  async function run() {
    if (running.current) return;
    running.current = true; setBusy(true); setError(null); setCleanupMessage(null);
    try { await continueMediaIndex({ begin: () => begin({}), step, active: () => mounted.current && running.current, onProgress: setLatest }); }
    catch { if (mounted.current) setError("Indexing could not continue. Your access or the site generation may have changed. Refresh and try again."); }
    finally { running.current = false; if (mounted.current) setBusy(false); }
  }
  async function clean() {
    if (running.current || latest?.status !== "ready" || !latest.generation) return;
    running.current = true; setBusy(true); setError(null);
    try {
      const result = await cleanup({ generation: latest.generation });
      if (mounted.current) setCleanupMessage(result.remaining ? `${result.deleted} older index records removed. Continue cleaning to check for more.` : "Older index records are cleared.");
    } catch { if (mounted.current) setError("Cleanup could not continue. Refresh current index progress before retrying."); }
    finally { running.current = false; if (mounted.current) setBusy(false); }
  }
  return <MediaReferenceIndexView progress={latest} busy={busy} error={error} cleanupMessage={cleanupMessage} onContinue={() => void run()} onPause={() => { running.current = false; }} onCleanup={() => void clean()} />;
}
