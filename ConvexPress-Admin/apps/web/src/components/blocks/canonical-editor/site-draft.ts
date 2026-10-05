import { useEffect, useRef, useState } from "react";
import { sameDraft, sameDocument, type SaveRequest, type Snapshot, type DocumentKey, type EditorSession } from "./session";

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

type Status = "disabled" | "loading" | "ready" | "saving" | "saved" | "error" | "revision-conflict";
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
  const inFlight = useRef<Promise<void> | null>(null);
  const saveBarrier = useRef<object | null>(null);
  const rejectedRevision = useRef<number | null>(null);
  const publish = (patch: Partial<View<V>>) => { state.current = { ...state.current, ...patch }; setView(state.current); };
  const load = async (initial = false) => {
    if (!client || !active.current || busy.current) return;
    if (rejectedRevision.current !== null &&
      (current.current.paused || current.current.session.base.revision <= rejectedRevision.current)) return;
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
      rejectedRevision.current = null;
      busy.current = false;
      publish({ record: row, offered: approved ? null : row, status: matchesInput ? "saved" : "ready" });
    } catch {
      if (active.current && lease === epoch.current) { busy.current = false; publish({ status: "error" }); }
    } finally { if (lease === epoch.current) busy.current = false; }
  };
  const write = (attempt: Attempt<V>): Promise<void> => {
    if (!client) return Promise.resolve();
    const lease = epoch.current;
    busy.current = true; uncertain.current = attempt; publish({ status: "saving" });
    const operation = attempt.draft === null
      ? client.discard({ expectedGeneration: attempt.generation })
      : client.save({ expectedGeneration: attempt.generation, baseRevision: attempt.baseRevision, draft: attempt.draft });
    const pending: Promise<void> = operation.then(receipt => {
      if (!active.current || lease !== epoch.current) return;
      if (![attempt.generation, attempt.generation + 1].includes(receipt.generation) ||
        (attempt.draft === null ? receipt.draft !== null : receipt.baseRevision !== attempt.baseRevision || !sameDraft(receipt.draft, attempt.draft)))
        throw Error("Private draft receipt mismatch");
      uncertain.current = null;
      busy.current = false;
      publish({ record: receipt, status: receipt.draft === null ? "ready" : "saved" });
    }).catch((error: unknown) => {
      if (!active.current || lease !== epoch.current) return;
      busy.current = false;
      const code = error && typeof error === "object" && "data" in error && error.data &&
        typeof error.data === "object" && "code" in error.data ? error.data.code : null;
      // A structured rejection is safe to reconcile by reading. Transport
      // failures remain uncertain and require the existing explicit retry.
      if (code === "DRAFT_CONFLICT") return load();
      if (code === "CONFLICT") {
        uncertain.current = null;
        rejectedRevision.current = attempt.baseRevision;
        publish({ status: "revision-conflict" });
        return;
      }
      publish({ status: "error" });
    }).finally(() => {
      if (lease === epoch.current) busy.current = false;
      if (inFlight.current === pending) inFlight.current = null;
    });
    inFlight.current = pending;
    return pending;
  };
  useEffect(() => {
    active.current = true; epoch.current++; busy.current = false; inFlight.current = null; saveBarrier.current = null;
    if (client) void load(true);
    return () => { active.current = false; epoch.current++; };
  }, [client]);

  useEffect(() => {
    if (!client || paused || saveBarrier.current || busy.current || view.offered || !view.record || view.status === "error" || view.status === "loading") return;
    if (view.status === "revision-conflict") {
      // Only an accepted local Save receipt or an explicit resolution of the
      // subscribed saved revision advances this base. A private read cannot.
      if (rejectedRevision.current !== null && session.base.revision > rejectedRevision.current) void load();
      return;
    }
    const row = view.record;
    const needsSave = session.dirty && (!sameDraft(session.draft, row.draft) || session.base.revision !== row.baseRevision);
    const needsClear = !session.dirty && row.draft !== null;
    if (!needsSave && !needsClear) return;
    const timer = setTimeout(() => {
      const live = current.current, latest = state.current;
      if (!active.current || saveBarrier.current || busy.current || live.paused || latest.offered || latest.record !== row) return;
      const attempt: Attempt<V> = { generation: row.generation, baseRevision: live.session.base.revision, draft: live.session.dirty ? live.session.draft : null };
      void write(attempt);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [client, session, paused, view.record, view.offered, view.status, delayMs]);

  /** Capture ownership before Save starts. Its pending private request may
   * finish later, but a different remote generation never becomes ours merely
   * because a conflict read observes it. Release the barrier even on rejection. */
  const acceptedSave = (request: SaveRequest<V>) => {
    const lease = epoch.current, known = state.current.record, attempt = uncertain.current;
    const flight = inFlight.current, token = {};
    saveBarrier.current = token;
    return async (receipt: Snapshot<V> | null) => {
      try {
        if (!client || !receipt || !sameDocument(request.key, receipt.key) ||
          receipt.revision <= request.revision || !sameDraft(request.value, receipt.value)) return;
        if (flight) await flight;
        if (!active.current || lease !== epoch.current || saveBarrier.current !== token) return;
        // This exact accepted receipt settles any old-base private rejection.
        rejectedRevision.current = null;
        if (uncertain.current) await load();
        if (!active.current || lease !== epoch.current || busy.current || state.current.offered || uncertain.current) return;
        const row = state.current.record;
        const ownAcknowledgement = attempt && row && row.generation === attempt.generation + 1 &&
          row.baseRevision === attempt.baseRevision && sameDraft(row.draft, attempt.draft);
        if (!row || !known || row.draft === null) return;
        if (row.baseRevision! > request.revision || (row.generation !== known.generation && !ownAcknowledgement)) {
          publish({offered: row, status: "ready"});
          return;
        }
        // CAS preserves a private write that another window commits after our
        // last read. The ordinary conflict path offers it for explicit review.
        await write({generation: row.generation, baseRevision: receipt.revision, draft: null});
        const latest = state.current.record;
        // A conflict read may find identical text from another device. Its new
        // generation still requires a choice rather than an automatic clear.
        if (active.current && lease === epoch.current && latest?.draft !== null && latest && latest.generation !== row.generation)
          publish({offered: latest, status: "ready"});
      } finally {
        if (saveBarrier.current === token) saveBarrier.current = null;
      }
    };
  };

  const choose = (choice: "restore" | "current") => {
    const row = state.current.offered;
    if (!active.current || saveBarrier.current || busy.current || current.current.paused || !row) return;
    if (choice === "restore") {
      const base = current.current.session.base;
      current.current.restore(row.draft ?? base.value, row.draft === null ? base.revision : row.baseRevision!);
    }
    publish({ offered: null, status: "ready" });
  };
  const waiting = session.dirty && view.record && !view.offered && ["ready", "saved"].includes(view.status) &&
    (!sameDraft(session.draft, view.record.draft) || session.base.revision !== view.record.baseRevision);
  return { status: waiting ? "waiting" as const : view.status, offered: view.offered,
    // A simultaneous accepted-document conflict must remain resolvable before
    // reviewing the private draft; its own conflict guard still prevents Save.
    acceptedSave, locked: !session.conflict && (view.status === "loading" || view.status === "revision-conflict" || !!view.offered), choose, retry: () => load() };
}
