import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { act, useState } from "react";
import { ConvexError } from "convex/values";
import { loadStaged } from "../schema-editor/test-harness";
const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");

test("site drafts require review, serialize later typing and reconcile uncertain writes without replay", async () => {
  const dom = new JSDOM('<div id="app"></div>', { url: "https://native.test" });
  const names = ["window", "document", "HTMLElement", "HTMLInputElement", "Element", "Node", "MutationObserver", "IS_REACT_ACT_ENVIRONMENT"];
  const old = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] });
  const loaded = await loadStaged("../canonical-editor/site-draft.fixture.ts");
  const { useSiteDraft, openDocument, editDocument, decodeSiteDraft, CanonicalEditor, receiveDocument, keepDraftAgainstCurrent, beginSave, acceptSave } = loaded.module;
  const { createRoot } = await import("react-dom/client");
  const host = document.getElementById("app"); let root = createRoot(host);
  const key = { websiteKey: "site", instanceKey: "staging", documentId: "page", generation: "one" };
  const snapshot = { key, revision: 2, value: { title: "Saved", blocks: [] } };
  const value = title => ({ title, blocks: [{ id: "parent", children: [{ id: "nested", attrs: { unfinished: "" } }] }] });
  let record = { postId: "page", scope: { websiteKey: "site", instanceKey: "staging" }, generation: 1, baseRevision: 2, draft: value("Private"), updatedAt: 1 };
  let acceptedRevision = 2, reads = 0;
  let writes = [], clears = [], pending = null, failAfterWrite = false, retired = false, current;
  const client = {
    load: async () => { reads++; return structuredClone(record); },
    save: async args => {
      writes.push(structuredClone(args));
      if (args.expectedGeneration !== record.generation) throw new ConvexError({code:"DRAFT_CONFLICT"});
      if (pending) await pending.promise;
      if (args.baseRevision !== acceptedRevision) throw new ConvexError({code:"CONFLICT"});
      record = { ...record, generation: record.generation + 1, baseRevision: args.baseRevision, draft: structuredClone(args.draft), updatedAt: record.updatedAt + 1 };
      if (failAfterWrite) { failAfterWrite = false; throw Error("reply lost: CONFLICT diagnostic text is not a structured rejection"); }
      return structuredClone(record);
    },
    discard: async args => { clears.push(args); if (args.expectedGeneration !== record.generation) throw new ConvexError({code:"DRAFT_CONFLICT"}); record = { ...record, draft: null, generation: record.generation + 1 }; return structuredClone(record); },
  };
  function Harness() {
    const [session, setSession] = useState(() => openDocument(snapshot));
    const persistence = useSiteDraft({ client, session, paused: !!session.conflict || !!session.pending, delayMs: 5, restore: (draft, revision) => setSession(previous => ({ ...editDocument(openDocument(previous.base), draft), conflict: revision === previous.base.revision ? null : previous.base })) });
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
    const count = writes.length, uncertainReads = reads;
    await pause(); expect(reads).toBe(uncertainReads); expect(writes).toHaveLength(count);
    await act(async () => current.persistence.retry()); await pause();
    expect(writes).toHaveLength(count); expect(current.persistence.status).toBe("saved");
    record = { ...record, generation: record.generation + 1, draft: value("Other window") };
    await change("My retained work"); await pause();
    expect(current.persistence.offered.draft.title).toBe("Other window"); expect(current.session.draft.title).toBe("My retained work");
    const conflictedWrites = writes.length; await pause(); expect(writes).toHaveLength(conflictedWrites);
    await act(async () => current.persistence.choose("current")); await pause(); expect(record.draft.title).toBe("My retained work");
    acceptedRevision = 3;
    await act(async () => current.setSession(openDocument({ ...snapshot, revision: 3, value: value("My retained work") })));
    await pause(); expect(record.draft).toBeNull(); expect(clears).toHaveLength(1);
    record = { ...record, generation: record.generation + 1, draft: null };
    await change("Late draft after another discard"); await pause();
    expect(current.persistence.offered).not.toBeNull(); expect(current.persistence.offered.draft).toBeNull();
    const afterDiscardConflict = writes.length; await pause(); expect(writes).toHaveLength(afterDiscardConflict);
    await act(async () => current.persistence.choose("restore")); await pause();
    expect(current.session.draft.title).toBe("My retained work"); expect(record.draft).toBeNull();
    // Accepted revision arrives after the structured rejection. Re-reading the
    // unchanged private generation must not authorize repeated stale writes.
    acceptedRevision = 4;
    await change("Retained against older saved revision"); await pause();
    expect(current.persistence.status).toBe("revision-conflict");
    expect(current.persistence.locked).toBe(true);
    const staleWrites = writes.length, staleReads = reads;
    await pause(); await pause();
    expect(writes).toHaveLength(staleWrites); expect(reads).toBe(staleReads);
    const newer = {...snapshot,revision:4,value:value("Saved by other window")};
    await act(async () => current.setSession(previous => receiveDocument(previous,newer)));
    expect(current.session.conflict.revision).toBe(4);
    expect(current.persistence.locked).toBe(false); // The editor's explicit conflict choices stay usable.
    await act(async () => current.setSession(previous => keepDraftAgainstCurrent(previous)));
    await pause(); await pause();
    expect(record.baseRevision).toBe(4); expect(record.draft.title).toBe("Retained against older saved revision");
    expect(current.persistence.status).toBe("saved");

    // An already in-flight private save can lose to this window's ordinary
    // Save. Its late CONFLICT must settle after that exact Save receipt.
    pending = {promise:new Promise(resolve => {release=resolve;})};
    await change("Locally accepted edit"); await pause();
    await act(async () => current.setSession(previous => beginSave(previous)));
    const acceptedRequest = current.session.pending;
    acceptedRevision = 5;
    await act(async () => {release();pending=null;}); await pause();
    expect(current.persistence.status).toBe("revision-conflict");
    await act(async () => current.setSession(previous => acceptSave(previous,acceptedRequest,{...snapshot,revision:5,value:acceptedRequest.value})));
    await pause(); await pause();
    expect(current.session.dirty).toBe(false); expect(record.draft).toBeNull();
    expect(current.persistence.status).toBe("ready");

    // Both records can change together. Resolve the accepted document first,
    // then review the private draft without either choice locking the other.
    acceptedRevision = 6;
    record = {...record,generation:record.generation+1,baseRevision:6,draft:value("Other private version")};
    await change("Keep both-conflict input"); await pause();
    expect(current.persistence.offered.draft.title).toBe("Other private version");
    await act(async () => current.setSession(previous => receiveDocument(previous,{...snapshot,revision:6,value:value("New accepted document")})));
    expect(current.persistence.locked).toBe(false);
    await act(async () => current.setSession(previous => keepDraftAgainstCurrent(previous)));
    expect(current.persistence.locked).toBe(true);
    await act(async () => current.persistence.choose("current")); await pause();
    expect(record.baseRevision).toBe(6); expect(record.draft.title).toBe("Keep both-conflict input");

    const decode = input => { if (!input || typeof input.title !== "string") throw Error("bad"); return input; };
    expect(() => decodeSiteDraft({ ...record, scope: { ...record.scope, instanceKey: "live" } }, key, decode)).toThrow();
    expect(() => decodeSiteDraft({ ...record, generation: 1.5 }, key, decode)).toThrow();
    await change("Queued before leaving");
    await act(async () => root.unmount()); retired = true; const lastWrites = writes.length;
    await pause(); expect(writes).toHaveLength(lastWrites);

    acceptedRevision = 2;
    record = { ...record, generation: 20, baseRevision: 1, draft: { title: "Stale private draft", blocks: [] } };
    const adapter = { id: n => n.id, children: n => n.children ?? [], withChildren: (n, children) => ({ ...n, children }), nodes: v => v.blocks, withNodes: (v, blocks) => ({ ...v, blocks }), describe: n => n, attrs: n => n.attrs, withAttrs: (n, attrs) => ({ ...n, attrs }), title: v => v.title, withTitle: (v, title) => ({ ...v, title }) };
    let acceptedSaves = 0;
    root = createRoot(host); retired = false;
    await act(async () => root.render(<CanonicalEditor authorityReady snapshot={snapshot} adapter={adapter} siteDraft={client} save={async request => { acceptedSaves++; acceptedRevision = 3; return { ...snapshot, revision: 3, value: request.value }; }} pickResource={async () => null} publicationActions={({ disabled }) => <button data-testid="publish" disabled={disabled}>Publish</button>} />));
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
    // Immediate navigation after the accepted Save must not reoffer its older private draft.
    expect(record.draft).toBeNull();
  } finally {
    if (!retired) await act(async () => root.unmount());
    await loaded.cleanup(); dom.window.close();
    for (const [name, descriptor] of old) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  }
});

test("accepted Save settles owned private writes, preserves remote generations and retains later typing", async () => {
  const dom = new JSDOM('<div id="app"></div>', { url: "https://native.test" });
  const names = ["window", "document", "HTMLElement", "HTMLInputElement", "Element", "Node", "MutationObserver", "IS_REACT_ACT_ENVIRONMENT"];
  const old = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] });
  const loaded = await loadStaged("../canonical-editor/site-draft.fixture.ts");
  const { useSiteDraft, openDocument, editDocument, beginSave, acceptSave } = loaded.module;
  const { createRoot } = await import("react-dom/client");
  const key = { websiteKey: "site", instanceKey: "staging", documentId: "page", generation: "one" };
  const value = title => ({ title, blocks: [] });
  const snapshot = { key, revision: 2, value: value("Saved") };
  const pause = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
  let root;
  try {
    for (const mode of ["late-ack", "late-conflict", "remote", "remote-identical", "lost-private-ack", "discard-failure", "rejected-save", "retired"]) {
      let record = { postId: "page", scope: { websiteKey: "site", instanceKey: "staging" }, generation: 5, baseRevision: 2, draft: value("Private"), updatedAt: 1 };
      let acceptedRevision = 2, current, release, held = false, failClear = mode === "discard-failure";
      const writes = [], clears = [], gate = new Promise(resolve => { release = resolve; });
      const client = {
        load: async () => structuredClone(record),
        save: async args => {
          writes.push(structuredClone(args));
          const delaying = !held && ["late-ack", "late-conflict", "lost-private-ack", "retired"].includes(mode); held = true;
          if (delaying && mode === "late-conflict") await gate;
          if (args.expectedGeneration !== record.generation) throw new ConvexError({code:"DRAFT_CONFLICT"});
          if (args.baseRevision !== acceptedRevision) throw new ConvexError({code:"CONFLICT"});
          record = {...record, generation:record.generation+1, baseRevision:args.baseRevision, draft:structuredClone(args.draft), updatedAt:record.updatedAt+1};
          const receipt = structuredClone(record);
          if (delaying && mode !== "late-conflict") await gate;
          if (delaying && mode === "lost-private-ack") throw Error("Lost private receipt");
          return receipt;
        },
        discard: async args => {
          clears.push(args);
          if (failClear) { failClear = false; throw Error("Connection failed before discard"); }
          if (args.expectedGeneration !== record.generation) throw new ConvexError({code:"DRAFT_CONFLICT"});
          record = {...record, generation:record.generation+1, baseRevision:acceptedRevision, draft:null};
          return structuredClone(record);
        },
      };
      function Harness() {
        const [session,setSession] = useState(() => editDocument(openDocument(snapshot),value("Private")));
        const persistence = useSiteDraft({client,session,paused:!!session.pending,delayMs:5,restore:()=>{}});
        current = {session,setSession,persistence}; return <p>{persistence.status}</p>;
      }
      root = createRoot(document.getElementById("app")); await act(async()=>root.render(<Harness/>)); await pause();
      expect(current.persistence.offered).toBeNull();
      await act(async()=>current.setSession(previous=>editDocument(previous,value("Accepted edit"))));
      if (["late-ack", "late-conflict", "lost-private-ack", "retired"].includes(mode)) { await pause(); expect(writes).toHaveLength(1); }
      let request,settle;
      await act(async()=>{const next=beginSave(current.session);request=next.pending;settle=current.persistence.acceptedSave(request);current.setSession(next);});
      if(mode==="rejected-save") {
        await act(async()=>settle(null));expect(clears).toHaveLength(0);
        await act(async()=>current.setSession(editDocument(openDocument(snapshot),value("Retry retained"))));await pause();expect(record.draft.title).toBe("Retry retained");
      } else {
        acceptedRevision=3;const receipt={...snapshot,revision:3,value:request.value};
        if(mode.startsWith("remote"))record={...record,generation:record.generation+1,baseRevision:3,draft:mode==="remote"?value("Other device"):request.value};
        if(mode==="late-ack")await act(async()=>current.setSession(previous=>editDocument(previous,value("Typed during Save"))));
        let finishing,finished=false;await act(async()=>{finishing=settle(receipt).then(()=>{finished=true;});});
        if(["late-ack","late-conflict","lost-private-ack","retired"].includes(mode)) {
          expect(finished).toBe(false);expect(clears).toHaveLength(0);
          if(mode==="retired"){await act(async()=>root.unmount());root=null;}
          await act(async()=>{release();await finishing;});
        }else await act(async()=>finishing);
        if(mode==="retired"){expect(clears).toHaveLength(0);expect(record.draft.title).toBe("Accepted edit");continue;}
        await act(async()=>current.setSession(previous=>acceptSave(previous,request,receipt)));
        expect(current.session.base.revision).toBe(3);expect(current.session.pending).toBeNull();
        if(mode.startsWith("remote")) {
          expect(record.generation).toBe(6);expect(current.persistence.offered?.generation).toBe(6);
          const remote=structuredClone(record);await pause();expect(record).toEqual(remote);expect(clears).toHaveLength(1);
        } else if(mode==="discard-failure") {
          expect(current.session.dirty).toBe(false);expect(current.persistence.status).toBe("error");expect(record.draft.title).toBe("Private");
          await pause();expect(clears).toHaveLength(1);await act(async()=>current.persistence.retry());await pause();expect(record.draft).toBeNull();
        } else {
          expect(record.draft).toBeNull();expect(clears).toHaveLength(1);
          if(mode==="late-ack") {expect(current.session.dirty).toBe(true);expect(current.session.draft.title).toBe("Typed during Save");await pause();expect(record.draft.title).toBe("Typed during Save");expect(record.baseRevision).toBe(3);}
          else expect(current.session.dirty).toBe(false);
        }
      }
      await act(async()=>root.unmount());root=null;
    }
  } finally {
    if(root)await act(async()=>root.unmount());await loaded.cleanup();dom.window.close();
    for(const[name,descriptor]of old){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
  }
});
