import { useEffect, useRef, useState } from "react";
import { sameDraft, type DocumentKey, type EditorSession } from "./session";

export interface SiteDraftRecord<V> {
  postId: string;
  scope: { websiteKey: string; instanceKey: string };
  generation: number;
  baseRevision: number | null;
  draft: V | null;
  updatedAt: number | null;
}
export interface SiteDraftClient<V> {
  load(): Promise<SiteDraftRecord<V>>;
  save(args: { expectedGeneration: number; baseRevision: number; draft: V }): Promise<SiteDraftRecord<V>>;
  discard(args: { expectedGeneration: number }): Promise<SiteDraftRecord<V>>;
}
export function decodeSiteDraft<V>(input: unknown, key: DocumentKey, decode: (value: unknown) => V): SiteDraftRecord<V> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("Invalid private draft response");
  const row = input as SiteDraftRecord<unknown>;
  if (row.postId !== key.documentId || row.scope?.websiteKey !== key.websiteKey || row.scope?.instanceKey !== key.instanceKey ||
    !Number.isSafeInteger(row.generation) || row.generation < 0 ||
    (row.baseRevision !== null && (!Number.isSafeInteger(row.baseRevision) || row.baseRevision < 0)) ||
    (row.updatedAt !== null && (!Number.isFinite(row.updatedAt) || row.updatedAt < 0)) ||
    (row.draft !== null && (row.generation === 0 || row.baseRevision === null || row.updatedAt === null)))
    throw Error("Private draft belongs to another document or has an invalid revision");
  return { ...row, draft: row.draft === null ? null : decode(row.draft) };
}

type Status = "disabled" | "loading" | "ready" | "saving" | "saved" | "error";
type View<V> = { status: Status; record: SiteDraftRecord<V> | null; offered: SiteDraftRecord<V> | null };
type Attempt<V> = { generation: number; baseRevision: number; draft: V | null };

/** Private drafts never call accepted Save. One request at a time; later input
 * stays in the editor/device journal until its own debounced request. */
export function useSiteDraft<V>({ client, session, paused, restore, delayMs = 1500 }: {
  client?: SiteDraftClient<V>; session: EditorSession<V>; paused: boolean;
  restore: (draft: V, baseRevision: number) => void; delayMs?: number;
}) {
  const [view, setView] = useState<View<V>>({ status: client ? "loading" : "disabled", record: null, offered: null });
  const current = useRef({ session, paused, restore }); current.current = { session, paused, restore };
  const state = useRef(view), epoch = useRef(0), active = useRef(false), busy = useRef(false);
  const uncertain = useRef<Attempt<V> | null>(null);
  const publish = (patch: Partial<View<V>>) => { state.current = { ...state.current, ...patch }; setView(state.current); };
  const load = async (initial = false) => {
    if (!client || !active.current || busy.current) return;
    const lease = epoch.current; busy.current = true;
    publish({ status: "loading" });
    try {
      const row = await client.load();
      if (!active.current || lease !== epoch.current) return;
      const attempt = uncertain.current, known = state.current.record;
      const confirmed = attempt && row.generation === attempt.generation + 1 &&
        (attempt.draft === null ? row.draft === null : row.baseRevision === attempt.baseRevision && sameDraft(row.draft, attempt.draft));
      const unchanged = !initial && row.generation === (attempt?.generation ?? known?.generation);
      const matchesInput = row.draft !== null && sameDraft(row.draft, current.current.session.draft);
      // A fresh exact read can settle a lost response. A different generation
      // needs review; merely loading it never grants overwrite permission.
      const approved = !!confirmed || unchanged || matchesInput || (row.draft === null && (initial || (!known && !attempt)));
      uncertain.current = null;
      busy.current = false;
      publish({ record: row, offered: approved ? null : row, status: matchesInput ? "saved" : "ready" });
    } catch {
      if (active.current && lease === epoch.current) { busy.current = false; publish({ status: "error" }); }
    } finally { if (lease === epoch.current) busy.current = false; }
  };
  useEffect(() => {
    active.current = true; epoch.current++; busy.current = false;
    if (client) void load(true);
    return () => { active.current = false; epoch.current++; };
  }, [client]);

  useEffect(() => {
    if (!client || paused || busy.current || view.offered || !view.record || view.status === "error" || view.status === "loading") return;
    const row = view.record;
    const needsSave = session.dirty && (!sameDraft(session.draft, row.draft) || session.base.revision !== row.baseRevision);
    const needsClear = !session.dirty && row.draft !== null;
    if (!needsSave && !needsClear) return;
    const timer = setTimeout(() => {
      const live = current.current, latest = state.current;
      if (!active.current || busy.current || live.paused || latest.offered || latest.record !== row) return;
      const lease = epoch.current;
      const attempt: Attempt<V> = { generation: row.generation, baseRevision: live.session.base.revision, draft: live.session.dirty ? live.session.draft : null };
      busy.current = true; uncertain.current = attempt; publish({ status: "saving" });
      const operation = attempt.draft === null
        ? client.discard({ expectedGeneration: attempt.generation })
        : client.save({ expectedGeneration: attempt.generation, baseRevision: attempt.baseRevision, draft: attempt.draft });
      void operation.then(receipt => {
        if (!active.current || lease !== epoch.current) return;
        if (![attempt.generation, attempt.generation + 1].includes(receipt.generation) ||
          (attempt.draft === null ? receipt.draft !== null : receipt.baseRevision !== attempt.baseRevision || !sameDraft(receipt.draft, attempt.draft)))
          throw Error("Private draft receipt mismatch");
        uncertain.current = null;
        busy.current = false;
        publish({ record: receipt, status: receipt.draft === null ? "ready" : "saved" });
      }).catch(() => {
        if (active.current && lease === epoch.current) { busy.current = false; publish({ status: "error" }); }
      }).finally(() => { if (lease === epoch.current) busy.current = false; });
    }, delayMs);
    return () => clearTimeout(timer);
  }, [client, session, paused, view.record, view.offered, view.status, delayMs]);

  const choose = (choice: "restore" | "current") => {
    const row = state.current.offered;
    if (!active.current || busy.current || current.current.paused || !row) return;
    if (choice === "restore") {
      const base = current.current.session.base;
      current.current.restore(row.draft ?? base.value, row.draft === null ? base.revision : row.baseRevision!);
    }
    publish({ offered: null, status: "ready" });
  };
  const waiting = session.dirty && view.record && !view.offered && ["ready", "saved"].includes(view.status) &&
    (!sameDraft(session.draft, view.record.draft) || session.base.revision !== view.record.baseRevision);
  return { status: waiting ? "waiting" as const : view.status, offered: view.offered,
    locked: view.status === "loading" || !!view.offered, choose, retry: () => load() };
}
