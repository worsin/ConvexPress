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
