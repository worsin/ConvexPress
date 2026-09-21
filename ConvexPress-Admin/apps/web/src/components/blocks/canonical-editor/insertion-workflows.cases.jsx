import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { act } from "react";
import { loadStaged } from "../schema-editor/test-harness";
const require = createRequire(import.meta.url),
	{ JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");
async function withDom(run) {
	const loaded = await loadStaged(
			"../canonical-editor/insertion-workflows.fixture.ts",
		),
		dom = new JSDOM('<div id="app"></div>', { url: "http://localhost" }),
		previous = {};
	for (const key of [
		"window",
		"document",
		"navigator",
		"HTMLElement",
		"Event",
		"IS_REACT_ACT_ENVIRONMENT",
	]) {
		previous[key] = Object.getOwnPropertyDescriptor(globalThis, key);
		Object.defineProperty(globalThis, key, {
			configurable: true,
			writable: true,
			value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[key],
		});
	}
	const { createRoot } = await import("react-dom/client"),
		root = createRoot(document.getElementById("app"));
	try {
		await run({ ...loaded.module, root, dom });
	} finally {
		await act(async () => root.unmount());
		dom.window.close();
		await loaded.cleanup();
		for (const [key, descriptor] of Object.entries(previous)) {
			if (descriptor) Object.defineProperty(globalThis, key, descriptor);
			else delete globalThis[key];
		}
	}
}
test("content source tabs support keyboard navigation and retain hidden work", async () =>
	withDom(async ({ InsertionTabs, root, dom }) => {
		const render = (saved = true) =>
			act(async () =>
				root.render(
					<InsertionTabs
						blocks={<input aria-label="Block search" defaultValue="" />}
						patterns={<p>Sections</p>}
						saved={saved && <input aria-label="Saved search" />}
						create={<p>Create content</p>}
					/>,
				),
			);
		const tab = (label) =>
			[...document.querySelectorAll('[role="tab"]')].find(
				(el) => el.textContent === label,
			);
		const key = async (value) =>
			act(async () =>
				document.activeElement.dispatchEvent(
					new dom.window.KeyboardEvent("keydown", {
						key: value,
						bubbles: true,
					}),
				),
			);
		await render();
		const field = document.querySelector('[aria-label="Block search"]');
		field.value = "Unsaved search";
		tab("Blocks").focus();
		await key("ArrowLeft");
		expect(document.activeElement).toBe(tab("Create"));
		expect(tab("Create").getAttribute("aria-selected")).toBe("true");
		await key("Home");
		expect(document.activeElement).toBe(tab("Blocks"));
		await key("ArrowRight");
		expect(document.activeElement).toBe(tab("Patterns"));
		expect(field.closest('[role="tabpanel"]').hidden).toBe(true);
		await act(async () => tab("Saved").click());
		await render(false);
		expect(tab("Blocks").getAttribute("aria-selected")).toBe("true");
		expect(document.querySelector('[aria-label="Block search"]')).toBe(field);
		expect(field.value).toBe("Unsaved search");
		for (const el of document.querySelectorAll('[role="tab"]')) {
			const panel = document.getElementById(el.getAttribute("aria-controls"));
			expect(panel.getAttribute("aria-labelledby")).toBe(el.id);
			expect(panel.hidden).toBe(el.getAttribute("aria-selected") !== "true");
		}
	}));
test("saved content validates reference metadata and preserves concurrent local edits", async () =>
	withDom(async ({ SavedContentInserter, root }) => {
		const scope = { websiteKey: "site-a", instanceKey: "staging" },
			policy = {
				enabledPlugins: [],
				capabilities: ["tree.children", "reference.targetResolution"],
				disabledBlocks: [],
			};
		let resolve,
			request,
			inserted = [],
			draft = { title: "Local title", blocks: [] },
			denied = false;
		const pickResource = (value) => {
			request = value;
			return new Promise((done) => {
				resolve = done;
			});
		};
		const insert = (transform) => {
			if (denied) return false;
			const next = transform(draft);
			draft = next.draft;
			inserted.push(next);
			return true;
		};
		const props = {
			scope,
			policy,
			revision: 7,
			disabled: false,
			pickResource,
			insert,
			packId: "core",
		};
		const render = (overrides = {}) =>
			act(async () =>
				root.render(<SavedContentInserter {...props} {...overrides} />),
			);
		const choose = async () =>
			act(async () => document.querySelector("button").click());
		const result = (extra = {}) => ({
			scope,
			value: "saved-section",
			syncedRevision: { revisionPolicy: "pinned", revision: 3 },
			...extra,
		});
		const finish = async (value) => act(async () => resolve(value));
		await render();
		await choose();
		expect(request).toMatchObject({
			name: "core/synced",
			path: ["syncedBlock"],
			revision: "7",
			scope,
		});
		expect(document.querySelector("button").disabled).toBe(true);
		// Text changed while the selector was open must survive insertion.
		draft = {
			title: "New local title",
			blocks: [
				{
					id: "existing",
					name: "core/paragraph",
					version: 1,
					attrs: { content: [] },
				},
			],
		};
		await finish(result());
		expect(inserted.length).toBe(1);
		expect(draft.title).toBe("New local title");
		expect(draft.blocks[0].id).toBe("existing");
		expect(draft.blocks[1].attrs).toEqual({
			syncedBlock: "saved-section",
			revisionPolicy: "pinned",
			revision: 3,
		});
		expect(draft.blocks[1].id).toBe(request.blockId);
		await choose();
		await finish(
			result({ syncedRevision: { revisionPolicy: "latest", revision: 4 } }),
		);
		expect(draft.blocks[2].attrs).toEqual({
			syncedBlock: "saved-section",
			revisionPolicy: "latest",
		});
		const unchanged = JSON.stringify(draft);
		for (const invalid of [
			result({ scope: { ...scope, websiteKey: "other" } }),
			result({ syncedRevision: undefined }),
			result({ syncedRevision: { revisionPolicy: "pinned", revision: 0 } }),
		]) {
			await choose();
			await finish(invalid);
			expect(JSON.stringify(draft)).toBe(unchanged);
			expect(document.querySelector('[role="alert"]')).not.toBeNull();
		}
		denied = true;
		await choose();
		await finish(result());
		expect(JSON.stringify(draft)).toBe(unchanged);
		expect(document.querySelector('[role="alert"]').textContent).toContain(
			"Your edits are still here",
		);
		await choose();
		await finish(null);
		expect(JSON.stringify(draft)).toBe(unchanged);
		expect(document.querySelector('[role="alert"]')).toBeNull();
	}));
test("a pending saved selection is discarded after scope, revision, permission, template or lock changes", async () =>
	withDom(async ({ SavedContentInserter, root }) => {
		const scope = { websiteKey: "site-a", instanceKey: "staging" },
			policy = {
				enabledPlugins: [],
				capabilities: ["tree.children", "reference.targetResolution"],
				disabledBlocks: [],
			};
		let resolve,
			request,
			count = 0;
		const props = {
			scope,
			policy,
			revision: 7,
			disabled: false,
			packId: "core",
			pickResource: (value) => {
				request = value;
				return new Promise((done) => {
					resolve = done;
				});
			},
			insert: () => {
				count++;
				return true;
			},
		};
		const render = (overrides = {}) =>
			act(async () =>
				root.render(<SavedContentInserter {...props} {...overrides} />),
			);
		for (const change of [
			{ scope: { ...scope, instanceKey: "production" } },
			{ revision: 8 },
			{ policy: { ...policy, disabledBlocks: ["core/synced"] } },
			{ packId: "journal" },
			{ disabled: true },
		]) {
			await render();
			await act(async () => document.querySelector("button").click());
			await render(change);
			expect(request.signal.aborted).toBe(true);
			// Returning to the original context must not revive the old request.
			await render();
			await act(async () =>
				resolve({
					scope,
					value: "saved-section",
					syncedRevision: { revisionPolicy: "pinned", revision: 1 },
				}),
			);
			expect(count).toBe(0);
		}
		await render({ policy: { ...policy, capabilities: [] } });
		expect(document.querySelector("button")).toBeNull();
		expect(document.body.textContent).toContain("unavailable");
		await render();
		await act(async () => document.querySelector("button").click());
		await act(async () => root.render(null));
		expect(request.signal.aborted).toBe(true);
		await act(async () =>
			resolve({
				scope,
				value: "saved-section",
				syncedRevision: { revisionPolicy: "pinned", revision: 1 },
			}),
		);
		expect(count).toBe(0);
	}));
