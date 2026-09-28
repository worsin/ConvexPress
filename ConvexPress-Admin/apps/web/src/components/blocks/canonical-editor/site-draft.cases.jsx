import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { act, useState } from "react";
import { loadStaged } from "../schema-editor/test-harness";
const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");

test("site drafts require review, serialize later typing and reconcile uncertain writes without replay", async () => {
  const dom = new JSDOM('<div id="app"></div>', { url: "https://native.test" });
  const names = ["window", "document", "HTMLElement", "HTMLInputElement", "Element", "Node", "MutationObserver", "IS_REACT_ACT_ENVIRONMENT"];
  const old = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] });
  const loaded = await loadStaged("../canonical-editor/site-draft.fixture.ts");
  const { useSiteDraft, openDocument, editDocument, decodeSiteDraft, CanonicalEditor } = loaded.module;
  const { createRoot } = await import("react-dom/client");
  const host = document.getElementById("app"); let root = createRoot(host);
  const key = { websiteKey: "site", instanceKey: "staging", documentId: "page", generation: "one" };
  const snapshot = { key, revision: 2, value: { title: "Saved", blocks: [] } };
  const value = title => ({ title, blocks: [{ id: "parent", children: [{ id: "nested", attrs: { unfinished: "" } }] }] });
  let record = { postId: "page", scope: { websiteKey: "site", instanceKey: "staging" }, generation: 1, baseRevision: 2, draft: value("Private"), updatedAt: 1 };
  let writes = [], clears = [], pending = null, failAfterWrite = false, retired = false, current;
  const client = {
    load: async () => structuredClone(record),
    save: async args => {
      writes.push(structuredClone(args));
      if (args.expectedGeneration !== record.generation) throw Error("DRAFT_CONFLICT");
      if (pending) await pending.promise;
      record = { ...record, generation: record.generation + 1, baseRevision: args.baseRevision, draft: structuredClone(args.draft), updatedAt: record.updatedAt + 1 };
      if (failAfterWrite) { failAfterWrite = false; throw Error("reply lost"); }
      return structuredClone(record);
    },
    discard: async args => { clears.push(args); if (args.expectedGeneration !== record.generation) throw Error("DRAFT_CONFLICT"); record = { ...record, draft: null, generation: record.generation + 1 }; return structuredClone(record); },
  };
  function Harness() {
    const [session, setSession] = useState(() => openDocument(snapshot));
    const persistence = useSiteDraft({ client, session, paused: !!session.conflict, delayMs: 5, restore: (draft, revision) => setSession(previous => ({ ...editDocument(openDocument(previous.base), draft), conflict: revision === previous.base.revision ? null : previous.base })) });
    current = { session, persistence, setSession };
    return <><input value={session.draft.title} onChange={e => setSession(editDocument(session, value(e.target.value)))} /><p>{persistence.status}</p></>;
  }
  const pause = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
  const change = async title => act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(host.querySelector("input"), title);
    host.querySelector("input").dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  try {
    await act(async () => root.render(<Harness />)); await pause();
    expect(current.persistence.offered.draft.title).toBe("Private"); expect(current.session.draft.title).toBe("Saved"); expect(writes).toHaveLength(0);
    await act(async () => current.persistence.choose("restore")); await pause();
    expect(current.session.draft).toEqual(value("Private")); expect(writes).toHaveLength(0);
    let release; pending = { promise: new Promise(resolve => { release = resolve; }) };
    await change("First edit"); await pause(); expect(writes).toHaveLength(1);
    await change("Typed during autosave"); await pause(); expect(writes).toHaveLength(1);
    await act(async () => { release(); pending = null; }); await pause();
    expect(writes).toHaveLength(2); expect(record.draft).toEqual(value("Typed during autosave"));
    failAfterWrite = true; await change("Uncertain save"); await pause(); expect(current.persistence.status).toBe("error");
    const count = writes.length;
    await act(async () => current.persistence.retry()); await pause();
    expect(writes).toHaveLength(count); expect(current.persistence.status).toBe("saved");
    record = { ...record, generation: record.generation + 1, draft: value("Other window") };
    await change("My retained work"); await pause();
    await act(async () => current.persistence.retry()); await pause();
    expect(current.persistence.offered.draft.title).toBe("Other window"); expect(current.session.draft.title).toBe("My retained work");
    const conflictedWrites = writes.length; await pause(); expect(writes).toHaveLength(conflictedWrites);
    await act(async () => current.persistence.choose("current")); await pause(); expect(record.draft.title).toBe("My retained work");
    await act(async () => current.setSession(openDocument({ ...snapshot, revision: 3, value: value("My retained work") })));
    await pause(); expect(record.draft).toBeNull(); expect(clears).toHaveLength(1);
    record = { ...record, generation: record.generation + 1, draft: null };
    await change("Late draft after another discard"); await pause();
    await act(async () => current.persistence.retry()); await pause();
    expect(current.persistence.offered).not.toBeNull(); expect(current.persistence.offered.draft).toBeNull();
    const afterDiscardConflict = writes.length; await pause(); expect(writes).toHaveLength(afterDiscardConflict);
    await act(async () => current.persistence.choose("restore")); await pause();
    expect(current.session.draft.title).toBe("My retained work"); expect(record.draft).toBeNull();
    const decode = input => { if (!input || typeof input.title !== "string") throw Error("bad"); return input; };
    expect(() => decodeSiteDraft({ ...record, scope: { ...record.scope, instanceKey: "live" } }, key, decode)).toThrow();
    expect(() => decodeSiteDraft({ ...record, generation: 1.5 }, key, decode)).toThrow();
    await change("Queued before leaving");
    await act(async () => root.unmount()); retired = true; const lastWrites = writes.length;
    await pause(); expect(writes).toHaveLength(lastWrites);

    record = { ...record, generation: 20, baseRevision: 1, draft: { title: "Stale private draft", blocks: [] } };
    const adapter = { id: n => n.id, children: n => n.children ?? [], withChildren: (n, children) => ({ ...n, children }), nodes: v => v.blocks, withNodes: (v, blocks) => ({ ...v, blocks }), describe: n => n, attrs: n => n.attrs, withAttrs: (n, attrs) => ({ ...n, attrs }), title: v => v.title, withTitle: (v, title) => ({ ...v, title }) };
    let acceptedSaves = 0;
    root = createRoot(host); retired = false;
    await act(async () => root.render(<CanonicalEditor authorityReady snapshot={snapshot} adapter={adapter} siteDraft={client} save={async request => { acceptedSaves++; return { ...snapshot, revision: 3, value: request.value }; }} pickResource={async () => null} publicationActions={({ disabled }) => <button data-testid="publish" disabled={disabled}>Publish</button>} />));
    const button = name => [...host.querySelectorAll('button')].find(item => item.textContent === name);
    expect(host.querySelector('[data-testid="publish"]').disabled).toBe(true);
    expect(host.querySelector('input').value).toBe('Saved');
    await act(async () => button('Restore Website draft').click());
    expect(host.querySelector('input').value).toBe('Stale private draft');
    expect(button('Save changes').disabled).toBe(true); expect(acceptedSaves).toBe(0);
    expect(button('Keep my changes against the saved revision')).toBeDefined();
    await act(async () => button('Keep my changes against the saved revision').click());
    expect(acceptedSaves).toBe(0); expect(button('Save changes').disabled).toBe(false);
    await act(async () => button('Save changes').click()); expect(acceptedSaves).toBe(1);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1550)); });
    expect(record.draft).toBeNull();
  } finally {
    if (!retired) await act(async () => root.unmount());
    await loaded.cleanup(); dom.window.close();
    for (const [name, descriptor] of old) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  }
});
