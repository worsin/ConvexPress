import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { act } from "react";
import { loadStaged } from "../schema-editor/test-harness";
const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");
test("native layout controls preview, undo, save with CAS and refuse changes while locked", async () => {
	const dom = new JSDOM('<div id="app"></div>', { url: "https://native.test" });
	const names = [
		"window",
		"document",
		"HTMLElement",
		"HTMLInputElement",
		"HTMLTextAreaElement",
		"Element",
		"Node",
		"MutationObserver",
		"getComputedStyle",
		"IS_REACT_ACT_ENVIRONMENT",
	];
	const old = names.map((name) => [
		name,
		Object.getOwnPropertyDescriptor(globalThis, name),
	]);
	for (const name of names)
		Object.defineProperty(globalThis, name, {
			configurable: true,
			writable: true,
			value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name],
		});
	const loaded = await loadStaged(
		"../canonical-editor/presentation.fixture.ts",
	);
	const { CanonicalEditor, canonicalEditorAdapter } = loaded.module;
	const { createRoot } = await import("react-dom/client");
	const host = document.getElementById("app"),
		root = createRoot(host),
		saves = [],
		previews = [];
	const adapter = canonicalEditorAdapter(
		{ enabledPlugins: [], capabilities: [], disabledBlocks: [] },
		"core",
	);
	const key = {
		websiteKey: "study",
		instanceKey: "staging",
		documentId: "layout",
		generation: "operator",
	};
	const value = {
		title: "Space",
		blocks: [adapter.createBlock("core/spacer")],
	};
	let props = {
		authorityReady: true,
		snapshot: { key, revision: 3, value },
		adapter,
		pickResource: async () => null,
		livePreview: (state) => {
			previews.push(state);
			return null;
		},
		save: async (request) => {
			saves.push(request);
			return { key, revision: request.revision + 1, value: request.value };
		},
	};
	const render = () =>
		act(async () => root.render(<CanonicalEditor {...props} />));
	const field = (name) =>
		host.querySelector(`select[aria-label="Block ${name}"]`);
	const choose = (name, value) =>
		act(async () => {
			field(name).value = value;
			field(name).dispatchEvent(
				new dom.window.Event("change", { bubbles: true }),
			);
		});
	const button = (text) =>
		[...host.querySelectorAll("button")].find(
			(node) => node.textContent === text,
		);
	try {
		await render();
		const treatment = () => host.querySelector('select[aria-label="Block treatment"]');
		const size = () => host.querySelector('select[aria-label="Treatment Size"]');
		const setSelect = (input, value) => act(async () => {
			input.value = value;
			input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
		});
		expect(treatment().value).toBe("");
		await setSelect(treatment(), "original");
		expect(size().value).toBe("medium");
		await setSelect(size(), "xlarge");
		expect(previews.at(-1).draft.blocks[0].treatment.values.size).toBe("xlarge");
		await act(async () => button("Undo").click());
		expect(size().value).toBe("medium");
		await act(async () => button("Redo").click());
		expect(size().value).toBe("xlarge");
		expect(field("spacing").value).toBe("");
		await choose("spacing", "none");
		expect(previews.at(-1).draft.blocks[0].layout).toEqual({ spacing: "none" });
		expect(saves).toHaveLength(0);
		await act(async () => button("Undo").click());
		expect(field("spacing").value).toBe("");
		await act(async () => button("Redo").click());
		expect(field("spacing").value).toBe("none");
		await choose("tone", "muted");
		const anchorInput = host.querySelector('input[maxlength="101"]');
		const editAnchor = (value) =>
			act(async () => {
				Object.getOwnPropertyDescriptor(
					dom.window.HTMLInputElement.prototype,
					"value",
				).set.call(anchorInput, value);
				anchorInput.dispatchEvent(
					new dom.window.Event("input", { bubbles: true }),
				);
			});
		await editAnchor("1 invalid");
		expect(button("Save changes").disabled).toBe(true);
		expect(previews.at(-1).available).toBe(false);
		await editAnchor("breathing-room");
		expect(button("Save changes").disabled).toBe(false);
		await act(async () => button("Save changes").click());
		expect(saves).toHaveLength(1);
		expect(saves[0].revision).toBe(3);
		expect(saves[0].value.blocks[0].layout).toEqual({
			spacing: "none",
			tone: "muted",
		});
		expect(saves[0].value.blocks[0].anchor).toBe("breathing-room");
		expect(saves[0].value.blocks[0].treatment.values.size).toBe("xlarge");
		props = {
			...props,
			snapshot: { key, revision: 4, value: saves[0].value },
			contentLocked: true,
		};
		await render();
		expect(field("spacing").closest("fieldset").disabled).toBe(true);
		expect(treatment().closest("fieldset").disabled).toBe(true);
		await setSelect(size(), "small");
		expect(previews.at(-1).draft.blocks[0].treatment.values.size).toBe("xlarge");
		await choose("spacing", "spacious");
		expect(previews.at(-1).draft.blocks[0].layout.spacing).toBe("none");
		props = { ...props, contentLocked: false };
		await render();
		await setSelect(treatment(), "");
		expect(size()).toBeNull();
		expect(previews.at(-1).draft.blocks[0].treatment).toBeUndefined();
		await choose("spacing", "");
		await choose("tone", "");
		expect(previews.at(-1).draft.blocks[0].layout).toBeUndefined();
		await act(async () => button("Save changes").click());
		expect(saves[1].revision).toBe(4);
		props = { ...props, authorityReady: false };
		await render();
		expect(field("spacing")).toBeNull();
	} finally {
		await act(async () => root.unmount());
		await loaded.cleanup();
		dom.window.close();
		for (const [name, descriptor] of old) {
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else delete globalThis[name];
		}
	}
});
test("real style control saves explicitly, preserves fallback choices, and obeys edit locks", async () => {
  const dom = new JSDOM('<div id="app"></div>', { url: "https://native.test" });
  const names = ["window", "document", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "Element", "Node", "MutationObserver", "getComputedStyle", "IS_REACT_ACT_ENVIRONMENT"];
  const old = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] });
  const loaded = await loadStaged("../canonical-editor/presentation.fixture.ts");
  const { CanonicalEditor, canonicalEditorAdapter } = loaded.module;
  const { createRoot } = await import("react-dom/client");
  const host = document.getElementById("app"), root = createRoot(host), saves = [];
  const policy = { enabledPlugins: [], capabilities: [], disabledBlocks: [] };
  const journal = canonicalEditorAdapter(policy, "journal"), core = canonicalEditorAdapter(policy, "core");
  const key = { websiteKey: "study", instanceKey: "staging", documentId: "page", generation: "operator" };
  const value = { title: "An invitation", blocks: [journal.createBlock("core/cta-band")] };
  let props = { authorityReady: true, snapshot: { key, revision: 1, value }, adapter: journal, pickResource: async () => null,
    save: async request => { saves.push(request); return { key, revision: request.revision + 1, value: request.value }; } };
  const render = () => act(async () => root.render(<CanonicalEditor {...props} />));
  const select = () => { const label = [...host.querySelectorAll("label")].find(el => el.textContent === "Block style"); return label ? document.getElementById(label.htmlFor) : null; };
  const choose = value => act(async () => { const input = select(); input.value = value; input.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
  const save = () => [...host.querySelectorAll("button")].find(el => el.textContent === "Save changes");
  try {
    await render();
    expect(select().value).toBe("default");
    await choose("inset");
    expect(select().value).toBe("inset"); expect(saves).toHaveLength(0);
    await act(async () => save().click());
    expect(saves).toHaveLength(1); expect(saves[0].value.blocks[0].style).toBe("inset");
    props = { ...props, snapshot: { key, revision: 2, value: saves[0].value }, adapter: core };
    await render();
    expect(select().value).toBe("inset"); expect(host.textContent).toContain("This template displays the default style");
    expect(save().disabled).toBe(true); expect(saves).toHaveLength(1);
    props = { ...props, contentLocked: true }; await render();
    expect(select().disabled).toBe(true);
    await choose("default"); expect(save().disabled).toBe(true);
    props = { ...props, contentLocked: false }; await render();
    await choose("default");
    expect(save().disabled).toBe(false);
    await act(async () => save().click());
    expect(saves).toHaveLength(2); expect(saves[1].value.blocks[0].style).toBe("default");
    expect(saves[1].revision).toBe(2);
  } finally {
    await act(async () => root.unmount()); await loaded.cleanup(); dom.window.close();
    for (const [name, descriptor] of old) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  }
});
