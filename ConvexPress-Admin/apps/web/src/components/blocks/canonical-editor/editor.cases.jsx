import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { act } from "react";
import { loadStaged } from "../schema-editor/test-harness";
const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))(
	"jsdom",
);
test("real generated editor keeps invalid edits across selection, saves CAS and clears on authority loss", async () => {
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
	const loaded = await loadStaged("../canonical-editor/CanonicalEditor.tsx");
	const { CanonicalEditor } = loaded.module;
	const { createRoot } = await import("react-dom/client");
	const host = document.getElementById("app"),
		root = createRoot(host),
		saves = [];
	const key = {
		websiteKey: "site",
		instanceKey: "staging",
		documentId: "draft",
		generation: "operator-1",
	};
	const adapter = {
		id: (n) => n.id,
		createBlock: (name) => ({ id: "created", name, version: 1, attrs: {} }),
		children: (n) => n.children ?? [],
		withChildren: (n, children) => ({ ...n, children }),
		nodes: (value) => value.blocks,
		withNodes: (value, blocks) => ({ ...value, blocks }),
		describe: (n) => ({ name: n.name, version: n.version }),
		attrs: (n) => n.attrs,
		withAttrs: (n, attrs) => ({ ...n, attrs }),
	};
	const value = {
		blocks: [
			{ id: "first", name: "events/upcoming", version: 1, attrs: { count: 3 } },
			{
				id: "second",
				name: "events/upcoming",
				version: 1,
				attrs: { count: 4 },
			},
		],
	};
	const dirtyStates = [];
	const liveStates = [];
	const props = {
		authorityReady: true,
		livePreview: (state) => {
			liveStates.push(state);
			return <p>Live pane fixture</p>;
		},
		onDirtyChange: (dirty) => dirtyStates.push(dirty),
		snapshot: { key, revision: 1, value },
		adapter,
		pickResource: async () => null,
		save: async (request) => {
			saves.push(request);
			return { key, revision: request.revision + 1, value: request.value };
		},
	};
	const render = async (next) =>
		act(async () => root.render(<CanonicalEditor {...next} />));
	const change = async (next) =>
		act(async () => {
			const input = host.querySelector('input[type="number"]');
			Object.getOwnPropertyDescriptor(
				dom.window.HTMLInputElement.prototype,
				"value",
			).set.call(input, next);
			input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
		});
	const select = async (index) =>
		act(async () =>
			host
				.querySelectorAll('nav[aria-label="Page outline"] button')
				[index].click(),
		);
	const saveButton = () =>
		[...host.querySelectorAll("button")].find(
			(b) => b.textContent === "Save changes",
		);
	try {
		await render(props);
		expect(liveStates.at(-1).available).toBe(true);
		await act(async () => liveStates.at(-1).onHover("second"));
		expect(
			host.querySelector('[data-preview-hovered="true"]').textContent,
		).toContain("Upcoming Events");
		expect(liveStates.at(-1).selectedId).toBe("first");
		expect(saves).toEqual([]);
		await act(async () => liveStates.at(-1).onHover("not-in-this-document"));
		expect(host.querySelector('[data-preview-hovered="true"]')).toBeNull();

		await act(async () => liveStates.at(-1).onSelect("not-in-this-document"));
		expect(liveStates.at(-1).selectedId).toBe("first");
		await act(async () => liveStates.at(-1).onSelect("second"));
		expect(host.querySelector('input[type="number"]').value).toBe("4");
		await select(0);
		await act(async () => {
			const row = host.querySelector('nav[aria-label="Page outline"] button');
			row.dispatchEvent(
				new dom.window.KeyboardEvent("keydown", {
					key: "a",
					ctrlKey: true,
					bubbles: true,
				}),
			);
		});
		expect(
			[...host.querySelectorAll('nav input[type="checkbox"]')].every(
				(input) => input.checked,
			),
		).toBe(true);
		const removeMany = [...host.querySelectorAll("button")].find(
			(button) => button.textContent === "Remove 2 selected blocks",
		);
		await act(async () => removeMany.click());
		expect(host.textContent).toContain("This page has no blocks yet.");
		await act(async () =>
			[...host.querySelectorAll("button")]
				.find((button) => button.textContent === "Undo")
				.click(),
		);
		expect(
			host.querySelectorAll('nav[aria-label="Page outline"] button'),
		).toHaveLength(2);
		expect(host.querySelector('input[type="number"]').value).toBe("3");
		expect(dirtyStates.at(-1)).toBe(false);
		await change("");
		expect(liveStates.at(-1).available).toBe(false);
		expect(dirtyStates.at(-1)).toBe(true);
		expect(saveButton().disabled).toBe(true);
		const historyButton = (name) =>
			[...host.querySelectorAll("button")].find(
				(button) => button.textContent === name,
			);
		await act(async () => {
			const input = host.querySelector('input[type="number"]');
			input.focus();
			input.dispatchEvent(
				new dom.window.KeyboardEvent("keydown", {
					key: "z",
					ctrlKey: true,
					bubbles: true,
				}),
			);
		});
		expect(host.querySelector('input[type="number"]').value).toBe("3");
		expect(document.activeElement).toBe(
			host.querySelector('input[type="number"]'),
		);
		expect(host.textContent).toContain("All changes saved");
		await act(async () =>
			document.activeElement.dispatchEvent(
				new dom.window.KeyboardEvent("keydown", {
					key: "z",
					ctrlKey: true,
					shiftKey: true,
					bubbles: true,
				}),
			),
		);
		expect(host.querySelector('input[type="number"]').value).toBe("");
		expect(saveButton().disabled).toBe(true);
		await act(async () => {
			const first = host.querySelector('nav[aria-label="Page outline"] button');
			first.focus();
			first.dispatchEvent(
				new dom.window.KeyboardEvent("keydown", {
					key: "ArrowDown",
					bubbles: true,
				}),
			);
		});
		expect(document.activeElement.textContent).toContain("Upcoming Events");
		expect(host.querySelector('input[type="number"]').value).toBe("4");
		await act(async () =>
			document.activeElement.dispatchEvent(
				new dom.window.KeyboardEvent("keydown", { key: "Home", bubbles: true }),
			),
		);
		expect(host.querySelector('input[type="number"]').value).toBe("");
		await select(1);
		await select(0);
		expect(host.querySelector('input[type="number"]').value).toBe("");
		expect(saveButton().disabled).toBe(true);
		await change("6");
		expect(liveStates.at(-1).available).toBe(true);
		expect(liveStates.at(-1).draft.blocks[0].attrs.count).toBe(6);
		expect(saveButton().disabled).toBe(false);
		expect(historyButton("Undo").disabled).toBe(false);
		await render({ ...props, contentLocked: true });
		expect(historyButton("Undo").disabled).toBe(true);
		await render({
			...props,
			adapter: { ...adapter, locked: (node) => node.id === "first" },
		});
		expect(historyButton("Undo").disabled).toBe(true);
		await render(props);
		await act(async () => saveButton().click());
		expect(saves.length).toBe(1);
		expect(saves[0].revision).toBe(1);
		expect(saves[0].value.blocks[0].attrs.count).toBe(6);
		expect(host.textContent).toContain("All changes saved");
		expect(dirtyStates.at(-1)).toBe(false);
		let finishSave;
		let pendingRequest;
		const delayed = {
			...props,
			snapshot: { key, revision: 2, value: saves[0].value },
			save: (request) => {
				pendingRequest = request;
				return new Promise((resolve) => {
					finishSave = resolve;
				});
			},
		};
		await render(delayed);
		await change("7");
		await act(async () => saveButton().click());
		// The reactive query may observe our write before its mutation receipt arrives.
		const echo = { key, revision: 3, value: pendingRequest.value };
		await render({ ...delayed, snapshot: echo });
		expect(host.textContent).toContain("Saving");
		expect(dirtyStates.at(-1)).toBe(true);
		expect(host.textContent).not.toContain("newer saved revision");
		await act(async () => finishSave(echo));
		expect(host.textContent).toContain("All changes saved");
		await change("8");
		await render({
			...delayed,
			snapshot: {
				key,
				revision: 4,
				value: {
					blocks: [
						{ ...value.blocks[0], attrs: { count: 9 } },
						value.blocks[1],
					],
				},
			},
		});
		expect(host.textContent).toContain("newer saved revision");
		expect(liveStates.at(-1).available).toBe(false);
		expect(host.querySelector('input[type="number"]').value).toBe("8");
		await render({ ...props, authorityReady: false });
		expect(host.querySelector("input")).toBe(null);
		expect(host.querySelector("nav")).toBe(null);
		expect(host.textContent).toContain("Select an authorized document");
		expect(dirtyStates.at(-1)).toBe(false);
		const full = {
			blocks: Array.from({ length: 80 }, (_, i) => ({
				...value.blocks[0],
				id: "full-" + i,
			})),
		};
		const insertAdapter = {
			...adapter,
			availableBlocks: [{ name: "events/upcoming", title: "Upcoming Events" }],
		};
		const fullProps = {
			...props,
			adapter: insertAdapter,
			snapshot: {
				key: { ...key, documentId: "full" },
				revision: 1,
				value: full,
			},
		};
		await render(fullProps);
		await act(async () =>
			host.querySelector('button[aria-label="Choose Upcoming Events"]').click(),
		);
		const add = () =>
			[...host.querySelectorAll("button")].find(
				(b) => b.textContent === "Add to document",
			);
		await act(async () => add().click());
		expect(liveStates.at(-1).draft.blocks.length).toBe(80);
		expect(host.textContent).toContain("Your content has been kept");
		expect(host.textContent).toContain("All changes saved");
		await render({
			...fullProps,
			adapter: { ...insertAdapter, availableBlocks: [] },
		});
		expect(add().disabled).toBe(true);
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
