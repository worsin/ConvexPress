import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createEditorRecoveryStore } from "./recovery-store";
import { beginSave, editDocument, openDocument, acceptSave } from "./session";

const key = { websiteKey: "site", instanceKey: "staging", documentId: "page", generation: "old-session" };
const saved = { key, revision: 4, value: { title: "Saved", blocks: [{ id: "nested", children: [{ id: "field", value: "original" }] }] } };
const next = { ...saved, key: { ...key, generation: "fresh-session" } };
const changed = { ...saved.value, title: "Unsaved", blocks: [{ id: "nested", children: [{ id: "field", value: "local" }] }] };

test("reconnect preserves the whole draft under a fresh key and fences retired callbacks", () => {
  const store = createEditorRecoveryStore(), first = store.open(saved); first.activate();
  const editing = editDocument(first.state, changed); first.retain(editing);
  const reopened = store.open(next); reopened.activate();
  expect(reopened.state.draft).toEqual(changed);
  expect(reopened.state.base.key).toEqual(next.key);
  expect(reopened.state.conflict).toBeNull();
  expect(reopened.state.dirty).toBe(true);
  expect(editDocument(reopened.state, structuredClone(changed))).toBe(reopened.state);
  expect(reopened.state.recoveryNotice).toContain("recovered");
  first.retain(openDocument(saved));
  expect(store.open(next).state.draft).toEqual(changed);
});

test("remote edits and restored older revisions require conflict resolution without discarding local changes", () => {
  for (const revision of [2, 4, 5]) {
    const store = createEditorRecoveryStore(), first = store.open(saved); first.activate();
    first.retain(editDocument(first.state, changed));
    const remote = { ...next, revision, value: { ...saved.value, title: "Remote" } };
    const restored = store.open(remote).state;
    expect(restored.draft).toEqual(changed);
    expect(restored.conflict).toEqual(remote);
    expect(beginSave(restored).pending).toBeNull();
  }
});

test("an uncertain save is not replayed and a fresh matching read preserves subsequent typing", () => {
  const store = createEditorRecoveryStore(), first = store.open(saved); first.activate();
  const pending = beginSave(editDocument(first.state, changed));
  const newer = { ...changed, title: "Typed while saving" };
  first.retain(editDocument(pending, newer));
  const reopened = store.open({ ...next, revision: 5, value: changed }).state;
  expect(reopened.pending).toBeNull();
  expect(reopened.base.revision).toBe(5);
  expect(reopened.draft).toEqual(newer);
  expect(reopened.conflict).toBeNull();
  expect(beginSave(reopened).pending?.revision).toBe(5);
  expect(acceptSave(reopened, pending.pending!, { ...saved, revision: 5, value: changed })).toBe(reopened);
});

test("clean reads clear retained drafts and document/environment changes cannot inherit them", () => {
  for (const nextKey of [{ ...next.key, documentId: "other" }, { ...next.key, instanceKey: "live" }, { ...next.key, websiteKey: "foreign" }]) {
    const store = createEditorRecoveryStore(), first = store.open(saved); first.activate(); first.retain(editDocument(first.state, changed));
    const other = store.open({ ...next, key: nextKey }); other.activate(); other.retain(other.state);
    expect(other.state.draft).toEqual(saved.value);
    expect(store.open(next).state.dirty).toBe(false);
  }
  const store = createEditorRecoveryStore(), first = store.open(saved); first.activate(); first.retain(editDocument(first.state, changed));
  const match = store.open({ ...next, revision: 5, value: changed }); match.activate(); match.retain(match.state);
  expect(match.state.dirty).toBe(false);
  expect(store.open(next).state.dirty).toBe(false);
});

test("recovery provider preserves drafts across unmounts but resets across operator scopes in StrictMode", () => {
  const result = spawnSync(process.execPath, ["test", fileURLToPath(new URL("./recovery.cases.jsx", import.meta.url))], { encoding: "utf8", timeout: 30000 });
  if (result.status !== 0) throw Error(result.stdout + result.stderr);
  expect(result.status).toBe(0);
});

function durableFixture(scope = "operator-a/site/staging/admin") {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const decode = (value: unknown): typeof saved.value => {
    if (!value || typeof value !== "object" || !("title" in value) || typeof value.title !== "string" || !("blocks" in value) || !Array.isArray(value.blocks)) throw Error("Invalid local draft");
    return value as typeof saved.value;
  };
  const create = (nextScope = scope) => createEditorRecoveryStore({ storage, scope: nextScope });
  return { values, storage, decode, create };
}

test("a new renderer recovers the complete durable draft only after a fresh scoped read", () => {
  const f = durableFixture();
  const old = f.create().open(saved, f.decode); old.activate(); old.retain(editDocument(old.state, changed));
  expect(f.values.size).toBe(1);
  const restored = f.create().open(next, f.decode);
  expect(restored.state.draft).toEqual(changed);
  expect(restored.state.base.key).toEqual(next.key);
  expect(restored.state.pending).toBeNull();
  expect(restored.state.dirty).toBe(true);
  for (const scope of ["operator-b/site/staging/admin", "operator-a/site/live/admin", "operator-a/site/staging/subscriber"])
    expect(f.create(scope).open(next, f.decode).state.draft).toEqual(saved.value);
  const other = f.create().open({ ...next, key: { ...next.key, documentId: "other" } }, f.decode); other.activate(); other.retain(other.state);
  expect(f.create().open(next, f.decode).state.draft).toEqual(changed);
});

test("durable recovery resolves uncertain saves from current content without replay and retains later edits", () => {
  const f = durableFixture(); const old = f.create().open(saved, f.decode); old.activate();
  const pending = beginSave(editDocument(old.state, changed));
  const later = { ...changed, title: "Typed after request" };old.retain(editDocument(pending, later));
  const restored = f.create().open({ ...next, revision: 5, value: changed }, f.decode).state;
  expect(restored.draft).toEqual(later);expect(restored.base.revision).toBe(5);expect(restored.pending).toBeNull();expect(restored.conflict).toBeNull();
  const conflicting = f.create().open({ ...next, revision: 5, value: { ...saved.value, title: "Other editor" } }, f.decode).state;
  expect(conflicting.draft).toEqual(later);expect(conflicting.conflict?.revision).toBe(5);expect(beginSave(conflicting).pending).toBeNull();
});

test("retired renderer callbacks cannot overwrite or clear a newer durable draft", () => {
  const f = durableFixture();const old = f.create().open(saved, f.decode);old.activate();old.retain(editDocument(old.state, changed));
  const newer = f.create().open(next, f.decode);newer.activate();const latest = { ...changed, title: "Latest local draft" };newer.retain(editDocument(newer.state, latest));
  old.retain(openDocument(saved));expect(f.create().open(next, f.decode).state.draft).toEqual(latest);
  old.retain(editDocument(old.state, { ...changed, title: "Stale callback" }));expect(f.create().open(next, f.decode).state.draft).toEqual(latest);
  expect(old.persistenceStatus()).toBe("conflict");
  const confirmed = f.create().open({ ...next, revision: 5, value: latest }, f.decode);confirmed.activate();confirmed.retain(confirmed.state);
  expect(f.values.size).toBe(0);
});

test("corrupt or unavailable durable storage does not break editing or silently discard its old copy", () => {
  const f = durableFixture();const old = f.create().open(saved, f.decode);old.activate();old.retain(editDocument(old.state, changed));
  const storageKey = [...f.values.keys()][0]!; f.values.set(storageKey, '{broken');
  const corrupt = f.create().open(next, f.decode);corrupt.activate();corrupt.retain(corrupt.state);
  expect(corrupt.state.draft).toEqual(saved.value);expect(corrupt.persistenceStatus()).toBe("failed");expect(f.values.get(storageKey)).toBe('{broken');
  const store = createEditorRecoveryStore({ scope: "operator", storage: { ...f.storage, setItem() { throw Error("Quota"); } } });
  const unavailable = store.open(saved, f.decode);unavailable.activate();unavailable.retain(editDocument(unavailable.state, changed));
  expect(unavailable.persistenceStatus()).toBe("failed");expect(store.open(next, f.decode).state.draft).toEqual(changed);
});

test("reopening an older in-memory editor cannot clear another window's newer journal", () => {
  const f=durableFixture(), firstStore=f.create();const first=firstStore.open(saved,f.decode);first.activate();first.retain(editDocument(first.state,changed));
  const second=f.create().open(next,f.decode);second.activate();const otherDraft={...changed,title:'Other window draft'};second.retain(editDocument(second.state,otherDraft));
  // The server has confirmed the first window's content, while the other window
  // still has a newer, separate local draft. Clearing the first must retain it.
  const confirmed=firstStore.open({...next,revision:5,value:changed},f.decode);confirmed.activate();confirmed.retain(confirmed.state);
  expect(f.create().open({...next,revision:5,value:changed},f.decode).state.draft).toEqual(otherDraft);
});
