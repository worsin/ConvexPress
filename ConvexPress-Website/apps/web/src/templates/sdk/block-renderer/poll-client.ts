import { pollSnapshotSchema, type PollResult } from "../block-data/portable/pollDataContracts";
import { sha256Hex } from "../block-data/portable/shared/fingerprints";
import { parsePollDefinition, pollDefinitionVersion } from "../block-data/portable/pollContracts";
import { createPublicLeaseClock, publicLeaseTimers, type PublicLeaseTimers } from "../block-public/access-lease";
import type { PublicWatch } from "../block-public/subscription";
export type PollSnapshot = NonNullable<PollResult["poll"]>;
export type PollTarget = Pick<PollSnapshot, "postId" | "blockId" | "definitionVersion">;
export class PollInteractionError extends Error {}
/** Show only our closed, actionable messages, never raw server/provider text. */
export function pollResponseError(error: unknown): unknown {
  const data = error && typeof error === "object" && "data" in error ? error.data : null;
  const code = data && typeof data === "object" && "code" in data ? data.code : null;
  const messages: Record<string, string> = {
    POLL_VERIFICATION_REQUIRED: "Verification failed or expired. Complete the new challenge and try again.",
    POLL_VERIFICATION_UNAVAILABLE: "Verification is temporarily unavailable. Please try again later.",
    POLL_RATE_LIMIT: "This poll is receiving many responses. Please try again shortly.",
    POLL_UNAVAILABLE: "This poll has changed or is no longer available. Refresh the page before trying again.",
  };
  return typeof code === "string" && Object.hasOwn(messages, code) ? new PollInteractionError(messages[code]) : error;
}
export function pollStorageKey(installation: string, target: PollTarget): string {
  return `convexpress:poll:v1:${sha256Hex(JSON.stringify([installation, target.postId, target.blockId, target.definitionVersion]))}`;
}
/** Reading a saved ballot identity is inert. Creation happens only on an explicit
 * submit, before the server write, so failed attempts retry with the same token. */
export function readPollVisitor(storage: Pick<Storage, "getItem">, key: string): string | undefined {
  try { const value = storage.getItem(key); return value && /^[a-f0-9]{64}$/.test(value) ? value : undefined; } catch { return undefined; }
}
export function ensurePollVisitor(storage: Pick<Storage, "getItem" | "setItem">, key: string, random: Pick<Crypto, "getRandomValues">): string {
  const existing = readPollVisitor(storage, key); if (existing) return existing;
  const token = [...random.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, "0")).join("");
  try { storage.setItem(key, token); if (storage.getItem(key) === token) return token; } catch { /* Refuse before sending an unrepeatable response. */ }
  throw new PollInteractionError("Allow browser storage to save your response and prevent duplicate submissions.");
}
/** Tabs coordinate only identity creation, never hold a lock across a network
 * vote. IndexedDB read/write transactions provide the fallback when Web Locks
 * are unavailable; neither branch relies on a racy localStorage lease. */
export async function ensurePollVisitorAcrossTabs(storage: Pick<Storage, "getItem" | "setItem">, key: string, random: Pick<Crypto, "getRandomValues">, browser: { locks?: Pick<LockManager, "request">; indexedDB?: IDBFactory }): Promise<string> {
  if (browser.locks) return browser.locks.request(key, () => ensurePollVisitor(storage, key, random));
  if (!browser.indexedDB) throw new PollInteractionError("Allow browser storage to save your response and prevent duplicate submissions.");
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = () => { if (settled) return; settled = true; clearTimeout(timeout); reject(new PollInteractionError("Allow browser storage to save your response and prevent duplicate submissions.")); };
    const timeout = setTimeout(fail, 5000);
    let request: IDBOpenDBRequest;
    try { request = browser.indexedDB!.open("convexpress-poll-identities-v1", 1); } catch { fail(); return; }
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("identities")) request.result.createObjectStore("identities"); };
    request.onerror = fail; request.onblocked = fail;
    request.onsuccess = () => {
      const db = request.result; db.onversionchange = () => db.close();
      if (settled) { db.close(); return; }
      let tx: IDBTransaction;
      try { tx = db.transaction("identities", "readwrite"); } catch { db.close(); fail(); return; }
      const store = tx.objectStore("identities"), read = store.get(key);
      let token: string;
      read.onsuccess = () => {
        try {
        if (typeof read.result === "string" && /^[a-f0-9]{64}$/.test(read.result)) token = read.result;
        else {
          token = readPollVisitor(storage, key) ?? [...random.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, "0")).join("");
          store.put(token, key);
        }
        } catch { tx.abort(); fail(); }
      };
      tx.onerror = tx.onabort = () => { db.close(); fail(); };
      tx.oncomplete = () => {
        db.close(); if (settled) return;
        try { storage.setItem(key, token); if (storage.getItem(key) !== token) { fail(); return; } }
        catch { fail(); return; }
        settled = true; clearTimeout(timeout); resolve(token);
      };
    };
  });
}
export function subscribePoll(watch: PublicWatch, target: PollTarget, notify: (poll: PollSnapshot | null) => void, expired: () => void, timers: PublicLeaseTimers = publicLeaseTimers()): () => void {
  let active = true, lapsed = false;
  const expire = () => { if (!active || lapsed) return; lapsed = true; notify(null); expired(); };
  const lease = createPublicLeaseClock(timers, expire);
  const wake = () => lease.check();
  globalThis.document?.addEventListener("visibilitychange", wake);
  globalThis.window?.addEventListener("focus", wake);
  const update = () => {
    if (!active || lapsed) return;
    try {
      const raw = watch.localQueryResult(); if (raw === undefined) return;
      if (raw === null) { lease.install(null); notify(null); return; }
      const poll = pollSnapshotSchema.parse(raw);
      const definition = parsePollDefinition({ question: poll.question, options: poll.options.map(({ key, label }) => ({ key, label })), responsePolicy: poll.responsePolicy, showResults: poll.total !== null });
      if (pollDefinitionVersion(definition) !== poll.definitionVersion) { lease.install(null); notify(null); return; }
      if (poll.postId !== target.postId || poll.blockId !== target.blockId || poll.definitionVersion !== target.definitionVersion) { lease.install(null); notify(null); return; }
      // Recheck even when time changes no subscribed document. Monotonic elapsed
      // time and suspension-aware wall time cannot extend source authorization.
      const expiresAt = Math.min(poll.asOf + 60000, poll.nextChangeAt ?? Infinity);
      if (!lease.install({ evaluatedAt: poll.asOf, expiresAt })) { expire(); return; }
      notify(poll);
    } catch { lease.install(null); notify(null); }
  };
  const stop = watch.onUpdate(update); update();
  return () => { active = false; lease.dispose(); stop(); globalThis.document?.removeEventListener("visibilitychange", wake); globalThis.window?.removeEventListener("focus", wake); };
}
