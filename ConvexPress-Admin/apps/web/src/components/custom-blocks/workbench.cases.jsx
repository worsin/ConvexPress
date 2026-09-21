import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { act } from "react";
import { loadStaged } from "../blocks/schema-editor/test-harness";
const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");

test("source validation, approval, stale review and failed writes preserve exact versions", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://editor.example.invalid" });
  for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "Event", "MouseEvent"]) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const loaded = await loadStaged("../../custom-blocks/workbench.fixture.ts"), m = loaded.module, root = m.createRoot(document.getElementById("root"));
  const made = m.starterDefinition("Studio heading", "studio-heading");
  let current = { id: "definition", name: made.definition.spec.name, generation: 1, version: 1, lastVersion: 1, activeVersion: null, status: "draft", versionStatus: "draft", definitionJson: made.json, digest: made.digest };
  let savedWrites = 0, reviews = [], failSave = false, locked = false;
  const onLocked = value => { locked = value; };
  const client = { get: async () => current, history: async () => ({ versions: [{ version: current.version, digest: current.digest, versionStatus: current.versionStatus, createdAt: 1 }], nextBeforeVersion: null }),
    save: async args => {
      savedWrites++; if (failSave) throw Error("Lost acknowledgement");
      expect(args.expectedGeneration).toBe(current.generation);
      const next = m.checkedEdit(args.definitionJson, current);
      current = { ...current, generation: current.generation + 1, version: current.lastVersion + 1, lastVersion: current.lastVersion + 1, versionStatus: "draft", definitionJson: next.json, digest: next.digest };
      return { version: current.version };
    }, restore: async () => { throw Error("Unexpected restore"); },
    review: async args => {
      reviews.push(args);
      if (args.expectedGeneration !== current.generation || args.expectedDigest !== current.digest) throw Error("Review changed");
      current = { ...current, generation: current.generation + 1, activeVersion: args.enabled ? current.version : null, status: args.enabled ? "active" : "draft", versionStatus: args.enabled ? "active" : "revoked" };
      return { version: current.version };
    },
  };
  const button = text => [...document.querySelectorAll("button")].find(item => item.textContent === text);
  const click = async text => { expect(button(text)).toBeDefined(); await act(async () => button(text).click()); };
  const type = async value => { await act(async () => { const input = document.querySelector("textarea"); Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value").set.call(input, value);input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); }); };
  try {
    await act(async () => root.render(<m.DefinitionWorkbench id="definition" client={client} canEdit canRestore canApprove onLocked={onLocked} renderPreview={() => <form aria-label="Sample preview" onSubmit={event => event.preventDefault()}><input aria-label="Sample text" /></form>} />));
    expect(document.body.textContent).toContain("Studio heading");
    await click("Review approval"); expect(locked).toBe(true);
    current = { ...current, generation: 2 };
    await click("Confirm approval");
    expect(reviews[0].expectedGeneration).toBe(1); expect(reviews[0].expectedDigest).toBe(made.digest);
    expect(document.body.textContent).toContain("could not be confirmed"); expect(current.activeVersion).toBeNull();
    await click("Reload latest version"); await click("Review approval"); await click("Confirm approval");
    expect(current.activeVersion).toBe(1); expect(document.body.textContent).toContain("Version 1 approved.");
    await click("Edit as new version"); const sourceLabel = [...document.querySelectorAll("label")].find(label => label.textContent === "Definition source"); expect(sourceLabel).toBeDefined(); expect(sourceLabel.control).toBe(document.querySelector("textarea")); const original = document.querySelector("textarea").value;
    expect(document.querySelectorAll("form form")).toHaveLength(0);
    await act(async () => document.querySelector('form[aria-label="Sample preview"]').dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
    expect(savedWrites).toBe(0);
    await type("{}"); expect(button("Save new version").disabled).toBe(true); expect(savedWrites).toBe(0);
    const changed = JSON.parse(original); changed.spec.title = "Updated studio";
    await type(JSON.stringify(changed)); await click("Save new version");
    expect(current.version).toBe(2); expect(current.activeVersion).toBe(1); expect(current.versionStatus).toBe("draft"); expect(savedWrites).toBe(1);
    expect(document.body.textContent).toContain("Updated studio");
    await click("Review approval"); await click("Confirm approval"); expect(current.activeVersion).toBe(2);
    await click("Review revocation"); expect(document.body.textContent).toContain("no longer be eligible"); await click("Confirm revocation"); expect(current.versionStatus).toBe("revoked");
    await click("Edit as new version"); const retained = document.querySelector("textarea").value;
    failSave = true; await click("Save new version"); expect(document.querySelector("textarea").value).toBe(retained);expect(button("Save new version").disabled).toBe(true);expect(locked).toBe(true);
    await click("Save new version");expect(savedWrites).toBe(2);
    await click("Discard source changes");expect(document.querySelector("textarea")).toBeNull();
  } finally { await act(async () => root.unmount());dom.window.close();await loaded.cleanup(); }
});

test("a late definition read cannot replace a new workspace", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://editor.example.invalid" });
  for (const key of ["window", "document", "navigator", "HTMLElement", "Event"]) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const loaded = await loadStaged("../../custom-blocks/workbench.fixture.ts"), m = loaded.module, root = m.createRoot(document.getElementById("root"));
  let release, calls = 0;
  const saved = title => { const item = m.starterDefinition(title, "heading");return { id: title, name: item.definition.spec.name, generation: 1, version: 1, lastVersion: 1, activeVersion: null, status: "draft", versionStatus: "draft", definitionJson: item.json, digest: item.digest }; };
  const client = { get: ({ id }) => id === "old" && calls++ === 0 ? new Promise(resolve => { release = () => resolve(saved("Old response")); }) : Promise.resolve(saved("Current workspace")), history: async () => ({ versions: [], nextBeforeVersion: null }) };
  const onLocked = () => {};
  try {
    await act(async () => root.render(<m.DefinitionWorkbench key="old" id="old" client={client} onLocked={onLocked} />));
    const reload = [...document.querySelectorAll("button")].find(item => item.textContent === "Reload saved definition");
    await act(async () => reload.click());
    await act(async () => release());
    expect(document.body.textContent).toContain("Current workspace");expect(document.body.textContent).not.toContain("Old response");
    calls = 0;
    await act(async () => root.render(<m.DefinitionWorkbench key="old-again" id="old" client={client} onLocked={onLocked} />));
    await act(async () => root.render(<m.DefinitionWorkbench key="new" id="new" client={client} onLocked={onLocked} />));
    await act(async () => release());
    expect(document.body.textContent).toContain("Current workspace");expect(document.body.textContent).not.toContain("Old response");
  } finally { await act(async () => root.unmount());dom.window.close();await loaded.cleanup(); }
});


test("visual composition edits preserve content bindings, pack treatments and immutable identity", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://editor.example.invalid" });
  for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLSelectElement", "Event", "MouseEvent"]) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const loaded = await loadStaged("../../custom-blocks/workbench.fixture.ts"), m = loaded.module, root = m.createRoot(document.getElementById("root"));
  const made = m.starterDefinition("Visual study", "visual-study");
  const saved = { name: made.definition.spec.name, lastVersion: 1 };
  let source = JSON.stringify({ ...made.definition, spec: { ...made.definition.spec, version: 2 }, packTreatments: { journal: { version: 1, root: { el: "Text", bind: '"Journal original"' } } } });
  const render = () => root.render(<m.CompositionDesigner source={source} disabled={false} onChange={next => { source = next;render(); }} />);
  const button = name => [...document.querySelectorAll("button")].find(node => node.textContent === name);
  const click = async name => { expect(button(name)).toBeDefined();await act(async () => button(name).click()); };
  const label = name => [...document.querySelectorAll("label")].find(node => node.textContent === name)?.control;
  const input = async (element, value) => { expect(element).toBeTruthy();await act(async () => { const proto = element.tagName === "SELECT" ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value);element.dispatchEvent(new dom.window.Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }); };
  try {
    for (const name of m.primitiveNames) expect(m.primitiveProperties(name).properties).toBeDefined();
    await act(async () => render());
    await click("Wrap in stack");
    expect(JSON.parse(source).composition.root.children[0].bind).toBe("attrs.headline");
    await input(label("Add an element"), "Text");await click("Add child element");await click("Text");
    const field = label("Element text");field.focus();
    await input(field, "Designed for people");expect(document.activeElement).toBe(field);
    expect(label("Element text")).toBe(field);
    await click("Move up");expect(JSON.parse(source).composition.root.children[0].bind).toBe('"Designed for people"');
    await input(label("Text source"), "attrs.headline");
    expect(JSON.parse(source).composition.root.children[0].bind).toBe("attrs.headline");
    await click("Remove element");expect(JSON.parse(source).composition.root.children).toHaveLength(1);
    await input(label("Add an element"), "Button");await click("Add child element");await click("Button");
    const labelGroup = [...document.querySelectorAll('[role="group"]')].find(node => node.getAttribute("aria-label") === "Label");
    await input(labelGroup.querySelector('input[aria-label="Property value"]'), "Explore the collection");
    expect(JSON.parse(source).composition.root.children[1].props.label).toBe("Explore the collection");
    expect(m.checkedEdit(source, saved).definition.spec.name).toBe(saved.name);
    const defaultTree = JSON.parse(source).composition;
    const treatment = document.querySelector('select[id$="-treatment"]');await input(treatment, "journal");
    await input(label("Element text"), "Journal updated");
    expect(JSON.parse(source).composition).toEqual(defaultTree);
    expect(JSON.parse(source).packTreatments.journal.root.bind).toBe('"Journal updated"');
    expect(m.checkedEdit(source, saved).definition.spec.version).toBe(2);
    await input(label("Text source"), "expression");await input(label("Text expression"), "attrs.");
    expect(() => m.checkedEdit(source, saved)).toThrow();
    expect(label("Text expression").value).toBe("attrs.");
    expect(JSON.parse(source).composition).toEqual(defaultTree);
    expect(() => m.editComposition(source, "default", tree => { let nested=tree;for(let n=0;n<8;n++) nested={el:"Stack",children:[nested]};return nested; })).toThrow(/eight levels/);
    expect(() => m.editComposition(source, "default", () => ({el:"Stack",children:Array.from({length:300},()=>({el:"Text",bind:'"test"'}))}))).toThrow(/300 elements/);
    expect(() => m.visualDefinition(" ".repeat(480*1024+1))).toThrow(/too large/);
  } finally { await act(async () => root.unmount());dom.window.close();await loaded.cleanup(); }
});

test("visual fields preserve bindings, edit nested choices, and keep invalid drafts unsavable", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://editor.example.invalid" });
  for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLSelectElement", "HTMLTextAreaElement", "Event", "MouseEvent"]) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const loaded = await loadStaged("../../custom-blocks/workbench.fixture.ts"), m = loaded.module, root = m.createRoot(document.getElementById("root"));
  const made = m.starterDefinition("Field study", "field-study");
  const saved = { name: made.definition.spec.name, lastVersion: 1 };
  let source = JSON.stringify({ ...made.definition, spec: { ...made.definition.spec, version: 2 } }), disabled = false;
  const render = () => root.render(<m.FieldDesigner source={source} disabled={disabled} onChange={next => { source = next;render(); }} />);
  const button = name => [...document.querySelectorAll("button")].find(node => node.textContent === name);
  const click = async name => { expect(button(name)).toBeDefined();await act(async () => button(name).click()); };
  const label = name => [...document.querySelectorAll("label")].find(node => [...node.childNodes].filter(child => child.nodeType === 3).map(child => child.textContent).join("") === name)?.control;
  const input = async (element, value) => { expect(element).toBeTruthy();await act(async () => { const proto = element.tagName === "SELECT" ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value);element.dispatchEvent(new dom.window.Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }); };
  try {
    await act(async () => render());
    const originalComposition = JSON.parse(source).composition;
    const fieldLabel = label("Field label");fieldLabel.focus();await input(fieldLabel, "Intro headline");expect(document.activeElement).toBe(fieldLabel);
    await input(label("Field key"), "otherHeadline");expect(() => m.checkedEdit(source, saved)).toThrow();
    expect(JSON.parse(source).composition).toEqual(originalComposition);
    await input(label("Field key"), "headline");expect(m.checkedEdit(source, saved).definition.spec.fields[0].title).toBe("Intro headline");
    await input(label("New field type"), "repeater");await click("Add field");
    await input(label("Field key"), "cards");await input(label("Field label"), "Cards");
    await input(label("Maximum"), "5");await input(label("New field type"), "select");await click("Add nested field");
    await input(label("Field key"), "tone");await input(label("Field label"), "Tone");await input(label("Choice 1"), "quiet");await input(label("Choice 2"), "bold");
    await click("Move field up");
    const fields = m.checkedEdit(source, saved).definition.spec.fields;
    expect(fields[1].id).toBe("cards");expect(fields[1].max).toBe(5);expect(fields[1].fields[0]).toMatchObject({ id: "tone", type: "select", options: ["quiet", "bold"] });
    expect(JSON.parse(source).composition).toEqual(originalComposition);
    await click("Remove field");expect(JSON.parse(source).spec.fields[1].fields).toHaveLength(1);
    await input(label("Repeated item structure"), "item");
    await act(async () => document.querySelector('nav[aria-label="Field outline"] button:last-child').click());
    await input(label("Field type"), "number");await input(label("Minimum"), "1");await input(label("Maximum"), "4");
    expect(m.checkedEdit(source, saved).definition.spec.fields[1].item).toMatchObject({ id: "value", type: "number", min: 1, max: 4 });
    const before = source;disabled=true;await act(async () => render());await click("Add field");expect(source).toBe(before);
    for (const type of m.fieldTypes) {
      expect(m.newField(type, [{id:"field1"}]).id).toBe("field2");
      const added=m.editFields(JSON.stringify({...made.definition,spec:{...made.definition.spec,version:2}}), list=>list.push(m.newField(type,list)));
      expect(m.checkedEdit(added,saved).definition.spec.fields[1].type).toBe(type);
    }
    expect(() => m.editFields(source, list => { list.push({id:"bad",type:"select"}); })).toThrow();
    expect(() => m.editFields(source, list => { let field={id:"child",type:"text"};for(let n=0;n<9;n++) field={id:"child",type:"object",fields:[field]};list.push(field); })).toThrow();
  } finally { await act(async () => root.unmount());dom.window.close();await loaded.cleanup(); }
});

test("structured defaults report invalid local input without overwriting the draft", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://editor.example.invalid" });
  for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "Event"]) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const loaded = await loadStaged("../../custom-blocks/workbench.fixture.ts"), m = loaded.module, root = m.createRoot(document.getElementById("root"));
  const definition = m.starterDefinition("Defaults", "defaults").definition;
  definition.spec.fields=[{id:"settings",title:"Settings",type:"object",default:{},fields:[{id:"note",type:"text"}]}];
  let source=JSON.stringify(definition), invalid=false;
  const report=value=>{invalid=value;};
  const render=()=>root.render(<m.FieldDesigner source={source} disabled={false} onInvalidChange={report} onChange={next=>{source=next;render();}} />);
  const type=async value=>{await act(async()=>{const input=document.querySelector("textarea");Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,"value").set.call(input,value);input.dispatchEvent(new dom.window.Event("input",{bubbles:true}));});};
  try {
    await act(async()=>render());const original=source;
    await type("{");expect(invalid).toBe(true);expect(source).toBe(original);expect(document.querySelector("textarea").checkValidity()).toBe(false);
    await type('{"note":"A useful default"}');expect(invalid).toBe(false);expect(document.querySelector("textarea").checkValidity()).toBe(true);expect(JSON.parse(source).spec.fields[0].default).toEqual({note:"A useful default"});
    await type("{");expect(invalid).toBe(true);await act(async()=>root.unmount());expect(invalid).toBe(false);
  } finally { dom.window.close();await loaded.cleanup(); }
});

test("template generation produces an editable unsaved treatment; save and approval remain separate", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://editor.example.invalid" });
  for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLSelectElement", "HTMLTextAreaElement", "Event", "MouseEvent"]) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const loaded = await loadStaged("../../custom-blocks/workbench.fixture.ts"), m = loaded.module, root = m.createRoot(document.getElementById("root"));
  const made = m.starterDefinition("Studio heading", "studio-heading");
  let current = { id: "definition", name: made.definition.spec.name, generation: 1, version: 1, lastVersion: 1, activeVersion: 1, status: "active", versionStatus: "active", definitionJson: made.json, digest: made.digest };
  let calls = [], writes = 0, locked = false, release;
  const onLocked = value => { locked = value; };
  const client = { get: async () => current, history: async () => ({ versions: [], nextBeforeVersion: null }),
    styleForPack: args => { calls.push(args);return new Promise(resolve => { release = () => {
      const draft = JSON.parse(m.nextDefinition(current));draft.packTreatments = { journal: { version: 1, root: { el: "Stack", props: { gap: "lg" }, children: [draft.composition.root] } } };
      const checked = m.checkedEdit(JSON.stringify(draft), current);
      resolve({ definitionJson: checked.json, digest: checked.digest, fingerprint: "context", packId: args.packId });
    }; }); },
    save: async args => { writes++;const checked = m.checkedEdit(args.definitionJson, current);current = { ...current, version: 2, lastVersion: 2, generation: 2, versionStatus: "draft", definitionJson: checked.json, digest: checked.digest };return { version: 2 }; },
  };
  const button = name => [...document.querySelectorAll("button")].find(item => item.textContent === name);
  const label = name => [...document.querySelectorAll("label")].find(item => item.textContent === name)?.control;
  const input = async (element, value) => { expect(element).toBeTruthy();await act(async () => { const proto = element.tagName === "SELECT" ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLTextAreaElement.prototype;Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value);element.dispatchEvent(new dom.window.Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }); };
  const click = async name => { expect(button(name)).toBeDefined();await act(async () => button(name).click()); };
  try {
    await act(async () => root.render(<m.DefinitionWorkbench id="definition" client={client} canAi canEdit onLocked={onLocked} />));
    expect(button("Generate treatment proposal").disabled).toBe(true);
    await input(label("Treatment template"), "journal");await input(label("Styling request"), "Make it editorial");
    await click("Generate treatment proposal");
    expect(locked).toBe(true);expect(button("Edit as new version").disabled).toBe(true);expect(button("Generating treatment…").disabled).toBe(true);
    expect(calls).toHaveLength(1);expect(calls[0]).toEqual({ id: "definition", version: 1, expectedGeneration: 1, expectedDigest: made.digest, packId: "journal", prompt: "Make it editorial" });
    await act(async () => release());
    expect(writes).toBe(0);expect(current.version).toBe(1);expect(document.body.textContent).toContain("Nothing has been saved or approved");
    const source = JSON.parse(label("Definition source").value);
    expect(source.composition).toEqual(made.definition.composition);expect(source.spec.fields).toEqual(made.definition.spec.fields);
    expect(source.packTreatments.journal.root.el).toBe("Stack");
    expect([...document.querySelectorAll("select")].find(el => el.id.endsWith("-treatment")).value).toBe("journal");
    await act(async () => label("Definition source").closest("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
    expect(writes).toBe(1);expect(current.version).toBe(2);expect(current.activeVersion).toBe(1);expect(current.versionStatus).toBe("draft");
  } finally { await act(async () => root.unmount());dom.window.close();await loaded.cleanup(); }
});

test("late styling proposals are discarded when AI permission is lost or the workspace changes", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://editor.example.invalid" });
  for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLTextAreaElement", "Event", "MouseEvent"]) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const loaded = await loadStaged("../../custom-blocks/workbench.fixture.ts"), m = loaded.module, root = m.createRoot(document.getElementById("root"));
  const made = m.starterDefinition("Studio heading", "studio-heading");
  const current = { id: "definition", name: made.definition.spec.name, generation: 1, version: 1, lastVersion: 1, activeVersion: null, status: "draft", versionStatus: "draft", definitionJson: made.json, digest: made.digest };
  let release;const onLocked = () => {};
  const client = { get: async () => current, history: async () => ({ versions: [], nextBeforeVersion: null }), styleForPack: () => new Promise(resolve => { release = () => resolve({ definitionJson: m.nextDefinition(current), digest: "intentionally-invalid", fingerprint: "context", packId: "core" }); }) };
  const render = (key, allowed) => root.render(<m.DefinitionWorkbench key={key} id="definition" client={client} canAi={allowed} canEdit onLocked={onLocked} />);
  try {
    for (const mode of ["revoked", "replaced"]) {
      await act(async () => render(mode, true));
      await act(async () => { const input = document.querySelector('textarea');Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value").set.call(input, "Restyle");input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
      await act(async () => [...document.querySelectorAll("button")].find(item => item.textContent === "Generate treatment proposal").click());
      await act(async () => render(mode === "replaced" ? "new" : mode, false));
      await act(async () => release());
      expect(document.body.textContent).not.toContain("Save new version");
      expect(document.body.textContent).not.toContain("could not be confirmed");
      expect(document.body.textContent).not.toContain("Generated a treatment");
    }
  } finally { await act(async () => root.unmount());dom.window.close();await loaded.cleanup(); }
});
