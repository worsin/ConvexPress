import { openDocument, resumeDocument, type EditorSession, type Snapshot, type DocumentKey } from "./session";

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type PersistenceStatus = "memory" | "saved" | "failed" | "conflict";
const LIMIT = 4 * 1024 * 1024;
const identity = (key: DocumentKey) => JSON.stringify([key.websiteKey, key.instanceKey, key.documentId]);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
function decodeSession<T>(raw: string, snapshot: Snapshot<T>, decode: (value: unknown) => T): EditorSession<T> {
  if (new TextEncoder().encode(raw).length > LIMIT) throw Error("Draft is too large");
  const value: unknown = JSON.parse(raw);
  if (!record(value) || value.version !== 1 || !record(value.base) || !record(value.base.key)) throw Error("Invalid draft envelope");
  const key = value.base.key;
  for (const field of ["websiteKey", "instanceKey", "documentId", "generation"]) if (typeof key[field] !== "string") throw Error("Invalid draft identity");
  if (identity(key as unknown as DocumentKey) !== identity(snapshot.key) || !Number.isSafeInteger(value.base.revision) || (value.base.revision as number) < 0) throw Error("Wrong draft base");
  const base = { key: key as unknown as DocumentKey, revision: value.base.revision as number, value: decode(value.base.value) };
  const state = { ...openDocument(base), draft: decode(value.draft), dirty: true };
  if (value.pending !== null) {
    if (!record(value.pending) || value.pending.revision !== base.revision) throw Error("Invalid pending draft");
    state.pending = { ...base, operation: 1, value: decode(value.pending.value) };
  }
  return state;
}

/** A journal is input, never authority or a reusable save request. Call open only
 * after an authorized read, and decode persisted values with the editor adapter.
 * The scope includes operator, role, connection, origin, website and environment;
 * transient authentication generations and credentials are not storage keys. */
export function createEditorRecoveryStore(options?: { scope: string; storage: DraftStorage | null }) {
  let retained: EditorSession<unknown> | null = null;
  let retainedStorageKey: string | null = null;
  let retainedRaw: string | null = null;
  let lease: symbol | null = null;
  return {
    open<T>(snapshot: Snapshot<T>, decode?: (value: unknown) => T) {
      const owner = Symbol("editor");
      const storage = decode ? options?.storage : undefined;
      const storageKey = `convexpress:document-draft:v1:${JSON.stringify([options?.scope, identity(snapshot.key)])}`;
      let previous: string | null = null, readable = true, status: PersistenceStatus = options && decode ? "failed" : "memory";
      let restored: EditorSession<T> | null = null;
      if (storage && decode) {
        try {
          previous = storage.getItem(storageKey);
          if (previous !== null) restored = decodeSession(previous, snapshot, decode);
          status = previous === null ? "memory" : "saved";
        } catch { readable = false; status = "failed"; }
      }
      const inMemory = retained && identity(retained.base.key) === identity(snapshot.key) ? retained as EditorSession<T> : null;
      if (storage && inMemory && retainedStorageKey === storageKey && previous !== retainedRaw) {
        // Do not claim a newer journal just because this store still has an
        // older in-memory editor. Its callbacks remain fenced from that copy.
        previous = retainedRaw; status = "conflict";
      }
      const local = inMemory ?? restored;
      const state = local ? resumeDocument(local, snapshot) : openDocument(snapshot);
      return {
        state,
        fromDevice: !inMemory && restored !== null && state.dirty,
        activate() { lease = owner; },
        persistenceStatus() { return status; },
        retain(next: EditorSession<T>) {
          if (owner !== lease) return;
          retained = next.dirty || next.pending ? next : null;
          retainedStorageKey = storageKey;
          retainedRaw = previous;
          if (!storage || !decode) return;
          try {
            // A delayed callback from a retired renderer must not replace a
            // different draft written since this handle opened or last wrote.
            if (storage.getItem(storageKey) !== previous) { status = "conflict"; return; }
            if (!retained) {
              if (!readable) return; // Leave an unreadable copy available for recovery.
              if (previous !== null) storage.removeItem(storageKey);
              previous = null; status = "memory"; return;
            }
            const raw = JSON.stringify({ version: 1, base: next.base, draft: next.draft,
              pending: next.pending ? { revision: next.pending.revision, value: next.pending.value } : null });
            if (new TextEncoder().encode(raw).length > LIMIT) throw Error("Draft is too large");
            if (raw !== previous) storage.setItem(storageKey, raw);
            previous = raw; retainedRaw = raw; readable = true; status = "saved";
          } catch { status = "failed"; }
        },
      };
    },
  };
}
