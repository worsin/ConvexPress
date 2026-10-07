import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { act, useRef, useState } from "react";
import { loadStaged } from "../schema-editor/test-harness";
const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))(
	"jsdom",
);
test("native workspace initializes through exact source CAS, adds authored content, saves/reopens and restores a revision", async () => {
	const loaded = await loadStaged("../canonical-editor/workspace.fixture.ts"),
		m = loaded.module;
	const dom = new JSDOM('<div id="app"></div>', { url: "http://localhost" }),
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
	const scope = { websiteKey: "fictional", instanceKey: "stage" },
		key = { ...scope, documentId: "draft", generation: "native-generation" },
		policy = {
			enabledPlugins: [],
			capabilities: ["tree.children"],
			disabledBlocks: [],
		};
	let current = {
			contract: "canonical-initialization-v1",
			scope,
			document: {
				id: "draft",
				type: "page",
				title: "Draft",
				revision: 0,
				authoringDigest: "a".repeat(64),
			},
			initialization: { eligible: true, reason: null },
		},
		gets = 0;
	const writes = [],
		history = [];
	const make = async (title, blocks, revision) => ({
		contract: "canonical-document-v1",
		scope,
		document: {
			id: "draft",
			type: "page",
			title,
			status: "draft",
			path: "/draft",
			blocksVersion: 2,
			revision,
			digest: m.canonicalContentDigest(title, blocks),
			blocks,
		},
		presentation: { packId: "core", revision: "b".repeat(64) },
		policy,
		data: await m.resolveCanonicalData(blocks, scope, policy, async () => ({
			page: null,
		})),
		resources: { media: {} },
	});
	const receipt = () => ({
		postId: "draft",
		revision: current.document.revision,
		digest: current.document.digest,
		changed: true,
	});
	const client = {
		get: async () => {
			gets++;
			return current;
		},
		initialize: async (args) => {
			writes.push(args);
			expect(args.expectedAuthoringDigest).toBe("a".repeat(64));
			expect(args.expectedRevision).toBe(0);
			current = await make(args.title, args.blocks, 1);
			return receipt();
		},
		save: async (args) => {
			writes.push(args);
			expect(args.expectedRevision).toBe(current.document.revision);
			history.push(current);
			current = await make(
				args.title,
				args.blocks,
				current.document.revision + 1,
			);
			return receipt();
		},
		pageRevisions: async () => ({
			page: history.map((item, index) => ({
				id: String(index),
				revisionNumber: item.document.revision,
				title: item.document.title,
				createdAt: 1000,
				type: "manual",
				blocksVersion: 2,
				restorable: true,
				reason: null,
			})),
			isDone: true,
			continueCursor: "",
		}),
		restore: async (args) => {
			expect(args.expectedRevision).toBe(current.document.revision);
			const target = history[Number(args.revisionId)];
			current = await make(
				target.document.title,
				target.document.blocks,
				current.document.revision + 1,
			);
			return receipt();
		},
	};
	const props = {
		documentKey: key,
		read: current,
		client,
		pickResource: async () => null,
	};
	const button = (text) =>
		[...document.querySelectorAll("button")].find(
			(item) => item.textContent === text,
		);
	const click = async (text) => {
		expect(button(text)).toBeDefined();
		await act(async () => button(text).click());
	};
	try {
		await act(async () =>
			root.render(<m.CanonicalDocumentWorkspace {...props} />),
		);
		await click("Use block editor");
		expect(gets).toBe(1);
		expect(writes[0].blocks).toEqual([]);

		await act(async () => {
			const input = document.querySelector('input[type="search"]');
			Object.getOwnPropertyDescriptor(
				dom.window.HTMLInputElement.prototype,
				"value",
			).set.call(input, "paragraph");
			input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
		});
		await act(async () =>
			document.querySelector('button[aria-label="Choose Paragraph"]').click(),
		);
		await click("Add to document");
		expect(
			document
				.querySelector('nav[aria-label="Page outline"]')
				.textContent.includes("Paragraph"),
		).toBe(true);
		await click("Save changes");
		expect(gets).toBe(2);
		expect(current.document.revision).toBe(2);
		expect(current.document.blocks[0].name).toBe("core/paragraph");
		await click("Browse revisions");
		await click("Review restore");
		await click("Restore this revision");
		expect(current.document.revision).toBe(3);
		expect(gets).toBe(3);
		expect(current.document.blocks).toEqual([]);
		const patternSelect = document.querySelector(
			'select[aria-label="Template section"]',
		);
		await act(async () => {
			patternSelect.value = "core/welcome";
			patternSelect.dispatchEvent(
				new dom.window.Event("change", { bubbles: true }),
			);
		});
		await click("Insert section");
		await click("Insert section");
		expect(button("Save changes").disabled).toBe(false);
		await click("Save changes");
		expect(current.document.revision).toBe(4);
		expect(current.document.blocks).toHaveLength(4);
		expect(current.document.blocks[0].attrs.title).toBe(
			"Make room for your next good idea.",
		);
		expect(current.document.blocks[0].id).not.toBe(
			current.document.blocks[2].id,
		);
		const stored = structuredClone(current.document.blocks);
		await act(async () =>
			root.render(
				<m.CanonicalDocumentWorkspace
					key="reopened"
					{...props}
					read={current}
				/>,
			),
		);
		expect(button("Save changes").disabled).toBe(true);
		expect(
			document.querySelector('nav[aria-label="Page outline"]').textContent,
		).toContain("Hero");
		expect(current.document.blocks).toEqual(stored);
		const reopenedSelect = document.querySelector(
			'select[aria-label="Template section"]',
		);
		await act(async () => {
			reopenedSelect.value = "core/welcome";
			reopenedSelect.dispatchEvent(
				new dom.window.Event("change", { bubbles: true }),
			);
		});
		for (let index = 0; index < 18; index++) await click("Insert section");
		const beforeRejectedInsert = document.querySelector(
			'nav[aria-label="Page outline"]',
		).textContent;
		await click("Insert section");
		expect(document.body.textContent).toContain(
			"This section could not be added",
		);
		expect(
			document.querySelector('nav[aria-label="Page outline"]').textContent,
		).toBe(beforeRejectedInsert);
		expect(current.document.blocks).toEqual(stored);
		await act(async () =>
			root.render(<m.CanonicalDocumentWorkspace {...props} read={null} />),
		);
		expect(document.body.textContent.includes("no longer available")).toBe(
			true,
		);
		expect(document.querySelector("input")).toBeNull();
	} finally {
		await act(async () => root.unmount());
		dom.window.close();
		for (const [key, value] of Object.entries(previous)) {
			if (value) Object.defineProperty(globalThis, key, value);
			else delete globalThis[key];
		}
		await loaded.cleanup();
	}
});

test("the real document query observer survives index recovery without losing an unsaved editor", async () => {
	const loaded = await loadStaged("../canonical-editor/workspace.fixture.ts"),
		m = loaded.module;
	const dom = new JSDOM('<div id="app"></div>', { url: "http://localhost" }),
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
	let value = { revision: 1 },
		subscriptions = 0;
	const listeners = new Set(),
		requestedKeys = [];
	const client = {
		watchQuery: (_name, args) => {
			requestedKeys.push(args.refreshKey);
			return {
				localQueryResult: () => {
					if (value instanceof Error) throw value;
					return value;
				},
				onUpdate: (callback) => {
					subscriptions++;
					listeners.add(callback);
					return () => listeners.delete(callback);
				},
				journal: () => undefined,
			};
		},
	};
	function Editor() {
		const [count, setCount] = useState(0);
		return (
			<button onClick={() => setCount(count + 1)}>Unsaved edits {count}</button>
		);
	}
	function View() {
		const read = m.useCanonicalDocumentQuery("draft"),
			last = useRef(undefined),
			state = m.recoverableCanonicalRead(read, last.current);
		if (!state.preparing) last.current = state.value;
		return (
			<>
				<p>
					{state.preparing ? "Preparing" : `Revision ${state.value?.revision}`}
				</p>
				<div hidden={state.preparing} inert={state.preparing}>
					<Editor />
				</div>
			</>
		);
	}
	try {
		await act(async () =>
			root.render(
				<m.ConvexProvider client={client}>
					<View />
				</m.ConvexProvider>,
			),
		);
		await act(async () => document.querySelector("button").click());
		expect(document.querySelector("button").textContent).toBe(
			"Unsaved edits 1",
		);
		const count = subscriptions;
		await act(async () => {
			value = Object.assign(new Error("Preparing"), {
				data: { code: "EVENT_CALENDAR_INDEX_PENDING" },
			});
			for (const notify of listeners) notify();
		});
		expect(document.querySelector("p").textContent).toBe("Preparing");
		expect(document.querySelector("button").parentElement.hidden).toBe(true);
		expect(document.querySelector("button").textContent).toBe(
			"Unsaved edits 1",
		);
		await act(async () => {
			value = { revision: 2 };
			for (const notify of listeners) notify();
		});
		expect(document.querySelector("p").textContent).toBe("Revision 2");
		expect(document.querySelector("button").parentElement.hidden).toBe(false);
		expect(document.querySelector("button").textContent).toBe(
			"Unsaved edits 1",
		);
		expect(subscriptions).toBe(count);
		expect(new Set(requestedKeys).size).toBe(1);
		const oldKey = requestedKeys.at(-1);
		await act(async () =>
			root.render(
				<m.ConvexProvider client={client}>
					<View key="explicit-retry" />
				</m.ConvexProvider>,
			),
		);
		expect(requestedKeys.at(-1)).not.toBe(oldKey);
		expect(requestedKeys.at(-1)).toMatch(/^[a-f0-9-]{36}$/);
	} finally {
		await act(async () => root.unmount());
		dom.window.close();
		for (const [key, descriptor] of Object.entries(previous)) {
			if (descriptor) Object.defineProperty(globalThis, key, descriptor);
			else delete globalThis[key];
		}
		await loaded.cleanup();
	}
});

test("new optional fields and existing unset drafts survive the actual JSON write receipt", async () => {
	const loaded = await loadStaged("../canonical-editor/workspace.fixture.ts"),
		m = loaded.module;
	try {
		const adapter = m.canonicalEditorAdapter({
			enabledPlugins: ["events"],
			capabilities: ["reference.targetResolution"],
			disabledBlocks: [],
		});
		const node = adapter.createBlock("events/calendar");
		expect(Object.hasOwn(node.attrs, "category")).toBe(false);
		expect(Object.hasOwn(node.attrs, "timeZone")).toBe(false);
		// Existing unsaved drafts from the old initializer must also be recoverable.
		node.attrs.category = undefined;
		node.attrs.timeZone = "America/Denver";
		const draft = { title: "Calendar", blocks: [node] };
		const prepared = adapter.prepareSave(draft);
		expect(Object.hasOwn(prepared.blocks[0].attrs, "category")).toBe(false);
		expect(Object.hasOwn(draft.blocks[0].attrs, "category")).toBe(true);
		const stored = JSON.parse(JSON.stringify(prepared));
		const request = {
			key: {
				websiteKey: "site",
				instanceKey: "stage",
				documentId: "calendar",
				generation: "one",
			},
			revision: 1,
			operation: 1,
			value: prepared,
		};
		const receipt = {
			postId: "calendar",
			revision: 2,
			changed: true,
			digest: m.canonicalContentDigest(stored.title, stored.blocks),
		};
		expect(m.verifiedWriteSnapshot(receipt, request).value).toEqual(stored);
		expect(adapter.prepareSave(prepared)).toEqual(prepared);
		expect(() =>
			adapter.prepareSave({
				title: "Invalid",
				blocks: [{ ...node, attrs: { limit: NaN } }],
			}),
		).toThrow();
	} finally {
		await loaded.cleanup();
	}
});

test("native write adapter refuses wrong scope, digest, document and revision receipts; generated policy owns block availability", async () => {
	const loaded = await loadStaged("../canonical-editor/workspace.fixture.ts"),
		m = loaded.module;
	try {
		const key = {
				websiteKey: "site",
				instanceKey: "stage",
				documentId: "draft",
				generation: "one",
			},
			value = { title: "Preserved", blocks: [] },
			request = { key, revision: 1, value, operation: 1 },
			receipt = {
				postId: "draft",
				revision: 2,
				digest: m.canonicalContentDigest(value.title, value.blocks),
				changed: true,
			};
		expect(m.verifiedWriteSnapshot(receipt, request).revision).toBe(2);
		for (const bad of [
			{ ...receipt, postId: "other" },
			{ ...receipt, revision: 4 },
			{ ...receipt, digest: "0".repeat(64) },
		])
			expect(() => m.verifiedWriteSnapshot(bad, request)).toThrow();
		const adapter = m.canonicalEditorAdapter({
			enabledPlugins: [],
			capabilities: [],
			disabledBlocks: ["core/heading"],
		});
		const originalUuid = Object.getOwnPropertyDescriptor(crypto, "randomUUID");
		try {
			Object.defineProperty(crypto, "randomUUID", {
				configurable: true,
				value: () => "01234567-89ab-4def-8123-456789abcdef",
			});
			const node = adapter.createBlock("core/paragraph");
			expect(
				m.checkedDraft({ title: "Digit-leading random source", blocks: [node] })
					.blocks[0].id,
			).toBe(node.id);
		} finally {
			if (originalUuid)
				Object.defineProperty(crypto, "randomUUID", originalUuid);
			else delete crypto.randomUUID;
		}
		expect(
			adapter.availableBlocks.some((row) => row.name === "core/heading"),
		).toBe(false);
		expect(
			adapter.availableBlocks.some((row) => row.name === "core/featured-page"),
		).toBe(false);
		expect(() => adapter.createBlock("unknown/block")).toThrow();
		const marked = {
			id: "marked",
			name: "core/paragraph",
			version: 2,
			attrs: {
				body: {
					type: "doc",
					content: [
						{
							type: "paragraph",
							content: [
								{ type: "text", text: "Marked", marks: [{ type: "bold" }] },
							],
						},
					],
				},
			},
			layout: { width: "wide" },
			anchor: "story",
		};
		expect(
			m.checkedDraft({ title: "Marked", blocks: [marked] }).blocks[0],
		).toEqual(marked);
		expect(() =>
			m.checkedDraft({
				title: "Locked",
				blocks: [{ ...marked, lock: { edit: "yes" } }],
			}),
		).toThrow();
	} finally {
		await loaded.cleanup();
	}
});

test.each([false,true].flatMap(autosave=>[false,true].flatMap(inactive=>[undefined,"plain-text","html"].map(importedContent=>({inactive,importedContent,autosave})))))("existing authored migration binds source review and acknowledgement (%j)", async ({inactive,importedContent,autosave}) => {
 const textImport=!!importedContent;
	const loaded = await loadStaged("../canonical-editor/workspace.fixture.ts"),
		m = loaded.module;
	const dom = new JSDOM('<div id="app"></div>', { url: "http://localhost" }),
		previous = {};
	for (const name of [
		"window",
		"document",
		"navigator",
		"HTMLElement",
		"Event",
		"IS_REACT_ACT_ENVIRONMENT",
	]) {
		previous[name] = Object.getOwnPropertyDescriptor(globalThis, name);
		Object.defineProperty(globalThis, name, {
			configurable: true,
			writable: true,
			value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name],
		});
	}
	const { createRoot } = await import("react-dom/client"),
		root = createRoot(document.getElementById("app"));
	const scope = { websiteKey: "site", instanceKey: "stage" },
		key = { ...scope, documentId: "legacy", generation: "operator" };
	const original = {
		contract: "canonical-initialization-v1",
		scope,
		document: {
			id: "legacy",
			type: "page",
			title: "Original story",
			revision: 2,
			authoringDigest: "a".repeat(64),
		},
		initialization: { eligible: false, reason: "existing-authored-content" },
	};
	const blocks = [
		{
			id: "paragraph",
			name: "core/paragraph",
			version: 2,
			attrs: {
				body: {
					type: "doc",
					content: [
						{
							type: "paragraph",
							content: [
								{
									type: "text",
									text: "Authored strong words",
									marks: [{ type: "bold" }],
								},
							],
						},
					],
				},
			},
		},
	];
	const candidate = {
		contract: "canonical-document-v1",
		scope,
		document: {
			id: "legacy",
			type: "page",
			title: "Original story",
			status: "draft",
			path: "/story",
			blocksVersion: 2,
			revision: 3,
			blocks,
			digest: m.canonicalContentDigest("Original story", blocks),
		},
		presentation: { packId: "core", revision: "b".repeat(64) },
		policy: { enabledPlugins: [], capabilities: [], disabledBlocks: [] },
		data: { contract: "canonical-data-v1", scope, dataByBlock: {} },
		resources: { media: {} },
	};
	const review = {
		contract: "canonical-migration-v1",
		source: {
			postId: "legacy",
			revision: 2,
			authoringDigest: original.document.authoringDigest,
		},
		candidate,
	};
    if(autosave) review.retainedAutosave={titleChanged:true,contentChanged:true,savedAt:0};
    if(textImport) review.importedContent=importedContent;
    if(inactive) review.inactiveSettings=[{blockId:"paragraph",name:"core/paragraph",layout:{padding:"spacious"},lock:{edit:true}}];
	let current = original,
		writes = [],
		gets = 0;
	const client = {
		get: async () => {
			gets++;
			return current;
		},
		prepareMigration: async () => structuredClone(review),
		migrate: async (args) => {
			writes.push(args);
			current = candidate;
			return {
				postId: "legacy",
				revision: 3,
				digest: candidate.document.digest,
				changed: true,
			};
		},
		initialize: async () => {
			throw Error("Must not initialize authored content");
		},
		save: async () => {
			throw Error("Not a save");
		},
		restore: async () => {
			throw Error("Not a restore");
		},
		pageRevisions: async () => ({ page: [], isDone: true, continueCursor: "" }),
	};
	const button = (text) =>
		[...document.querySelectorAll("button")].find(
			(node) => node.textContent === text,
		);
	try {
		await act(async () =>
			root.render(
				<m.CanonicalDocumentWorkspace
					documentKey={key}
					read={original}
					client={client}
					pickResource={async () => null}
				/>,
			),
		);
		expect(button("Use block editor").disabled).toBe(true);
		await act(async () => button("Review conversion").click());
		expect(document.body.textContent.includes("Authored strong words")).toBe(
			true,
		);
		expect(document.querySelector('[contenteditable="true"]')).toBeNull();
		expect(writes.length).toBe(0);
        if(inactive) {
          expect(document.body.textContent).toContain("padding: spacious");
          expect(document.body.textContent).toContain("edit: on");
          expect(button("Convert reviewed content").disabled).toBe(true);
          await act(async()=>button("Convert reviewed content").click());
          expect(writes).toHaveLength(0);
          await act(async()=>document.querySelector('input[type="checkbox"]').click());
          expect(button("Convert reviewed content").disabled).toBe(textImport || autosave);
          await act(async()=>button("Refresh migration review").click());
          expect(button("Convert reviewed content").disabled).toBe(true);
          expect(document.querySelector('input[type="checkbox"]').checked).toBe(false);
          await act(async()=>document.querySelector('input[type="checkbox"]').click());
        }
        if(textImport) {
          expect(document.body.textContent).toContain("The original renderer may not have displayed this stored content");
          expect(button("Convert reviewed content").disabled).toBe(true);
          await act(async()=>document.querySelector('input[name="text-import"]').click());
          expect(button("Convert reviewed content").disabled).toBe(autosave);
          await act(async()=>button("Refresh migration review").click());
          expect(document.querySelector('input[name="text-import"]').checked).toBe(false);
          expect(button("Convert reviewed content").disabled).toBe(true);
          if(inactive) await act(async()=>document.querySelector('input[type="checkbox"]').click());
          await act(async()=>document.querySelector('input[name="text-import"]').click());
        }
        if(autosave) {
          expect(document.body.textContent).toContain("Separate unsaved draft");
          expect(button("Convert reviewed content").disabled).toBe(true);
          await act(async()=>button("Convert reviewed content").click());
          expect(writes).toHaveLength(0);
          await act(async()=>document.querySelector('input[name="retain-autosave"]').click());
          expect(button("Convert reviewed content").disabled).toBe(false);
          await act(async()=>button("Refresh migration review").click());
          expect(document.querySelector('input[name="retain-autosave"]').checked).toBe(false);
          expect(button("Convert reviewed content").disabled).toBe(true);
          if(inactive) await act(async()=>document.querySelector('input[type="checkbox"]').click());
          if(textImport) await act(async()=>document.querySelector('input[name="text-import"]').click());
          await act(async()=>document.querySelector('input[name="retain-autosave"]').click());
        }
		await act(async () => button("Convert reviewed content").click());
		expect(writes).toEqual([
			{
				...(inactive ? {preserveInactiveSettings:true} : {}),
                ...(autosave ? {preserveLegacyAutosave:true} : {}),
                ...(importedContent === "plain-text" ? {acknowledgeTextImport:true} : {}),
                ...(importedContent === "html" ? {acknowledgeHtmlImport:true} : {}),
				expectedRevision: 2,
				expectedAuthoringDigest: "a".repeat(64),
				expectedCandidateDigest: candidate.document.digest,
				expectedPresentationRevision: "b".repeat(64),
			},
		]);
		expect(gets).toBe(1);
		expect(
			document.querySelector('[aria-label="Document editor"]'),
		).not.toBeNull();
		expect(
			current.document.blocks[0].attrs.body.content[0].content[0].marks,
		).toEqual([{ type: "bold" }]);
		await act(async () =>
			root.render(
				<m.CanonicalDocumentWorkspace
					documentKey={{ ...key, generation: "new" }}
					read={null}
					client={client}
					pickResource={async () => null}
				/>,
			),
		);
		expect(button("Convert reviewed content")).toBeUndefined();
	} finally {
		await act(async () => root.unmount());
		dom.window.close();
		for (const [name, value] of Object.entries(previous)) {
			if (value) Object.defineProperty(globalThis, name, value);
			else delete globalThis[name];
		}
		await loaded.cleanup();
	}
});

test("publication UI requires explicit confirmation of saved revision and displays only actual schedule metadata", async () => {
	const loaded = await loadStaged("../canonical-editor/workspace.fixture.ts"),
		m = loaded.module;
	const dom = new JSDOM('<div id="app"></div>', { url: "http://localhost" }),
		previous = {};
	for (const name of [
		"window",
		"document",
		"navigator",
		"HTMLElement",
		"Event",
		"IS_REACT_ACT_ENVIRONMENT",
	]) {
		previous[name] = Object.getOwnPropertyDescriptor(globalThis, name);
		Object.defineProperty(globalThis, name, {
			configurable: true,
			writable: true,
			value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name],
		});
	}
	const { createRoot } = await import("react-dom/client"),
		root = createRoot(document.getElementById("app")),
		writes = [];
	const value = {
			document: { status: "draft", revision: 4, scheduledAt: null },
		},
		publish = async (args) => {
			writes.push(args);
		};
	const button = (text) =>
		[...document.querySelectorAll("button")].find(
			(node) => node.textContent === text,
		);
	try {
		await act(async () =>
			root.render(
				<m.CanonicalPublicationControls
					document={value}
					disabled={false}
					publish={publish}
				/>,
			),
		);
		const select = document.querySelector("select");
		await act(async () => {
			select.value = "publish";
			select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
		});
		await act(async () => button("Review publication change").click());
		expect(writes.length).toBe(0);
		await act(async () => button("Confirm publication change").click());
		expect(writes).toEqual([{ expectedRevision: 4, status: "publish" }]);
		await act(async () =>
			root.render(
				<m.CanonicalPublicationControls
					document={value}
					disabled
					publish={publish}
				/>,
			),
		);
		expect(document.querySelector("select").disabled).toBe(true);
		expect(button("Review publication change").disabled).toBe(true);
		const scheduledAt = Date.now() + 86400000;
		await act(async () =>
			root.render(
				<m.CanonicalPublicationControls
					key="scheduled"
					document={{
						document: { status: "future", revision: 5, scheduledAt },
					}}
					disabled={false}
					publish={publish}
				/>,
			),
		);
		expect(
			document.body.textContent.includes(
				new Date(scheduledAt).toLocaleString(),
			),
		).toBe(true);
		await act(async () =>
			root.render(
				<m.CanonicalPublicationControls
					key="unknown-date"
					document={{ document: { status: "future", revision: 5 } }}
					disabled={false}
					publish={publish}
				/>,
			),
		);
		expect(
			document.body.textContent.includes("Scheduled time is unavailable"),
		).toBe(true);
		expect(document.querySelector('input[type="datetime-local"]').value).toBe(
			"",
		);
		expect(
			m.migrationIssue({
				data: {
					code: "LEGACY_CONVERSION_REQUIRED",
					path: ["content", 2, "type"],
					message: "Unsupported table",
				},
			}),
		).toBe(
			"Conversion stopped at content.2.type: Unsupported table. The original document is unchanged.",
		);
		expect(
			m.migrationIssue(new Error("secret provider details")).includes("secret"),
		).toBe(false);
	} finally {
		await act(async () => root.unmount());
		dom.window.close();
		for (const [name, descriptor] of Object.entries(previous)) {
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else delete globalThis[name];
		}
		await loaded.cleanup();
	}
});

test("native draft validation explains source and output capacity before save", async () => {
	const loaded = await loadStaged("../canonical-editor/workspace.fixture.ts");
	try {
		const adapter = loaded.module.canonicalEditorAdapter({
			enabledPlugins: ["forms"],
			capabilities: [
				"contact.submission",
				"form.submission",
				"reference.targetResolution",
			],
			disabledBlocks: [],
		});
		const contacts = Array.from({ length: 9 }, () =>
			adapter.createBlock("core/contact-form"),
		);
		const issue = adapter.validate({
			title: "Contact directory",
			blocks: contacts,
		});
		expect(issue).toContain("up to 8 distinct data sources");
		expect(issue).toContain("Your edits are still here");
		expect(
			adapter.validate({
				title: "Contact directory",
				blocks: contacts.slice(0, 8),
			}),
		).toBeNull();
		const forms = Array.from({ length: 9 }, () =>
			adapter.createBlock("core/form"),
		);
		expect(
			adapter.validate({ title: "Repeated form", blocks: forms }),
		).toContain("reserves more dynamic content");
	} finally {
		await loaded.cleanup();
	}
});

test("document settings require saved content, serialize writes and retain edits after a server refusal", async () => {
	const loaded = await loadStaged("../canonical-editor/workspace.fixture.ts"),
		dom = new JSDOM('<div id="app"></div>', { url: "http://localhost" }),
		previous = {};
	for (const name of [
		"window",
		"document",
		"navigator",
		"HTMLElement",
		"Event",
		"IS_REACT_ACT_ENVIRONMENT",
	]) {
		previous[name] = Object.getOwnPropertyDescriptor(globalThis, name);
		Object.defineProperty(globalThis, name, {
			configurable: true,
			writable: true,
			value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name],
		});
	}
	const { createRoot } = await import("react-dom/client"),
		root = createRoot(document.getElementById("app"));
	let settings = {
		postId: "page",
		type: "page",
		revision: 3,
		settingsDigest: "a".repeat(64),
		visibility: "public",
		hasPassword: false,
		slug: "studio",
		path: "/studio",
		pageTemplate: "default",
		hideHeader: false,
		hideFooter: false,
	};
	const writes = [],
		editing = [];
	let release,
		releaseRead,
		holdReads = false,
		refuse = false,
		refreshes = 0;
	const client = {
		getSettings: async () =>
			holdReads
				? await new Promise((resolve) => {
						releaseRead = resolve;
					})
				: settings,
		setSettings: async (args) => {
			writes.push(args);
			if (refuse) throw { data: { message: "The permalink is already used." } };
			return await new Promise((resolve) => {
				release = resolve;
			});
		},
	};
	const props = {
		postId: "page",
		revision: 3,
		client,
		onSaved: async () => {
			refreshes++;
		},
		onEditingChange: (value) => editing.push(value),
	};
	const button = (text) =>
		[...document.querySelectorAll("button")].find(
			(node) => node.textContent === text,
		);
	const render = (disabled) =>
		act(async () =>
			root.render(
				<loaded.module.CanonicalSettingsControls
					{...props}
					disabled={disabled}
				/>,
			),
		);
	try {
		await render(true);
		expect(document.querySelector("select").disabled).toBe(true);
		expect(button("Save document settings").disabled).toBe(true);
		await render(false);
		await act(async () => {
			const select = document.querySelector('select[aria-label="Visibility"]');
			select.value = "password";
			select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
		});
		expect(document.querySelector('input[aria-label="Document password"]').type).toBe("password");
		expect(document.querySelector('input[aria-label="Document password"]').value).toBe("");
		expect(button("Save document settings").disabled).toBe(true);
		await act(async () => {
			const input = document.querySelector('input[aria-label="Document password"]');
			Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(input, "fixture-secret");
			input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
		});
		expect(button("Save document settings").disabled).toBe(false);
		await act(async () => button("Save document settings").click());
		expect(writes.at(-1).password).toBe("fixture-secret");
		expect(writes.at(-1).visibility).toBe("password");
		await act(async () => release({postId:"page",revision:4,digest:"b".repeat(64),changed:true}));
		expect(document.querySelector('input[aria-label="Document password"]').value).toBe("");
		// Mount a fresh settings session for the remaining layout/conflict checks.
		await act(async () => root.render(null));
		writes.length = 0; refreshes = 0;
		await render(false);
		await act(async () => {
			const select = document.querySelector("select");
			select.value = "full-width";
			select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
		});
		expect(editing.at(-1)).toBe(true);
		expect(button("Save document settings").disabled).toBe(false);
		refuse = true;
		await act(async () => button("Save document settings").click());
		expect(document.querySelector('[role="alert"]').textContent).toContain(
			"already used",
		);
		expect(document.querySelector("select").value).toBe("full-width");
		await act(async () => button("Discard settings changes").click());
		expect(document.querySelector("select").value).toBe("default");
		expect(editing.at(-1)).toBe(false);
		refuse = false;
		writes.length = 0;
		await act(async () => {
			const select = document.querySelector("select");
			select.value = "full-width";
			select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
		});
		await act(async () => button("Save document settings").click());
		expect(writes).toHaveLength(1);
		expect(writes[0]).toEqual({
			expectedRevision: 3,
			expectedSettingsDigest: "a".repeat(64),
			visibility: "public",
			slug: "studio",
			pageTemplate: "full-width",
			hideHeader: false,
			hideFooter: false,
		});
		expect(button("Saving settings…").disabled).toBe(true);
		expect(document.querySelector("select").disabled).toBe(true);
		await act(async () => button("Saving settings…").click());
		expect(writes).toHaveLength(1);
		await act(async () =>
			release({
				postId: "page",
				revision: 4,
				digest: "b".repeat(64),
				changed: true,
			}),
		);
		expect(refreshes).toBe(1);
		expect(editing.at(-1)).toBe(false);
		settings = { ...settings, revision: 4, pageTemplate: "full-width" };
		props.revision = 4;
		await render(false);
		await act(async () => {
			const select = document.querySelector("select");
			select.value = "blank";
			select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
		});
		settings = {
			...settings,
			revision: 5,
			pageTemplate: "sidebar-left",
			settingsDigest: "c".repeat(64),
		};
		props.revision = 5;
		await render(false);
		expect(document.querySelector("select").value).toBe("blank");
		expect(document.querySelector('[role="alert"]').textContent).toContain(
			"changed while",
		);
		expect(button("Save document settings").disabled).toBe(true);
		await act(async () => button("Discard settings changes").click());
		expect(document.querySelector("select").value).toBe("sidebar-left");
		expect(editing.at(-1)).toBe(false);
		// A local content save changes revision before settings have reloaded.
		// Do not let the user start editing the previous revision in that window.
		holdReads = true;
		settings = { ...settings, revision: 6 };
		props.revision = 6;
		await render(false);
		expect(document.querySelector("select").disabled).toBe(true);
		expect(
			document.querySelector('input[aria-label="URL slug"]').disabled,
		).toBe(true);
		await act(async () => releaseRead(settings));
		expect(document.querySelector("select").disabled).toBe(false);
		expect(document.querySelector('[role="alert"]')).toBeNull();
		await act(async () => {
			const select = document.querySelector("select");
			select.value = "full-width";
			select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
		});
		await act(async () => button("Save document settings").click());
		expect(writes.at(-1).expectedRevision).toBe(6);
		await act(async () =>
			release({
				postId: "page",
				revision: 7,
				digest: "d".repeat(64),
				changed: true,
			}),
		);
	} finally {
		await act(async () => root.unmount());
		dom.window.close();
		for (const [name, value] of Object.entries(previous)) {
			if (value) Object.defineProperty(globalThis, name, value);
			else delete globalThis[name];
		}
		await loaded.cleanup();
	}
});

test("historical import binds saved versus unsaved review, resets acknowledgements and preserves canonical undo", async () => {
 const loaded=await loadStaged("../canonical-editor/workspace.fixture.ts"),m=loaded.module;
 const dom=new JSDOM('<div id="app"></div>',{url:"http://localhost"}),previous={};
 for(const name of ["window","document","navigator","HTMLElement","Event","IS_REACT_ACT_ENVIRONMENT"]){previous[name]=Object.getOwnPropertyDescriptor(globalThis,name);Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[name]});}
 const {createRoot}=await import("react-dom/client"),root=createRoot(document.getElementById("app"));
 const scope={websiteKey:"site",instanceKey:"stage"},key={...scope,documentId:"story",generation:"operator"};
 const canonical=(revision,title="Story")=>({contract:"canonical-document-v1",scope,document:{id:"story",type:"page",title,status:"draft",path:"/story",blocksVersion:2,revision,blocks:[],digest:m.canonicalContentDigest(title,[])},presentation:{packId:"core",revision:"b".repeat(64)},policy:{enabledPlugins:[],capabilities:[],disabledBlocks:[]},data:{contract:"canonical-data-v1",scope,dataByBlock:{}},resources:{media:{}}});
 let current=canonical(5),wrongSource=false,wrongReceipt=true;const writes=[];
 const review=sourceKind=>({contract:"canonical-migration-v1",source:{postId:"story",revision:current.document.revision,authoringDigest:"a".repeat(64)},archive:{revisionId:"original",sourceKind:wrongSource?"saved":sourceKind,sourceDigest:"c".repeat(64)},candidate:canonical(current.document.revision+1,sourceKind==="autosave"?"Unsaved title":"Saved title"),importedContent:"plain-text"});
 const row=(id,version)=>({id,action:version===2?"restore-canonical":"import-legacy",blocksVersion:version,hasRetainedAutosave:version===1,revisionNumber:4,title:"Story",createdAt:1000,type:"manual",restorable:true,reason:null});
 const client={get:async()=>current,initialize:async()=>{throw Error("Not initialize")},save:async()=>{throw Error("Not save")},getRevisionSource:async()=>{throw Error("Download denied")},
 prepareRevisionImport:async args=>review(args.sourceKind),
 importRevision:async args=>{writes.push(args);const candidate=review(args.sourceKind).candidate;if(!wrongReceipt)current=candidate;return{postId:wrongReceipt?"other":"story",revision:candidate.document.revision,digest:candidate.document.digest,changed:true}},
 restore:async args=>{writes.push(args);current=canonical(7);return{postId:"story",revision:7,digest:current.document.digest,changed:true}},
 pageRevisions:async()=>({page:current.document.revision===5?[row("original",1)]:[row("safety",2)],isDone:true,continueCursor:""})};
 const button=text=>[...document.querySelectorAll("button")].find(n=>n.textContent===text);
 const click=async text=>act(async()=>button(text).click());
 const choose=async value=>act(async()=>{const select=document.querySelector('select[aria-label="Historical content"]');select.value=value;select.dispatchEvent(new Event("change",{bubbles:true}));});
 const acknowledge=async()=>act(async()=>document.querySelector('input[name="text-import"]').click());
 try {
  await act(async()=>root.render(<m.CanonicalDocumentWorkspace documentKey={key} read={current} client={client} pickResource={async()=>null}/>));
  await click("Browse revisions");await click("Download original source");expect(document.body.textContent).toContain("could not be downloaded");
  await click("Review historical import");await click("Review conversion");expect(document.body.textContent).toContain("Saved title");expect(button("Import reviewed version").disabled).toBe(true);
  await acknowledge();expect(button("Import reviewed version").disabled).toBe(false);
  await choose("autosave");expect(button("Import reviewed version")).toBeUndefined();wrongSource=true;
  await click("Review conversion");expect(button("Import reviewed version")).toBeUndefined();expect(writes).toHaveLength(0);
  wrongSource=false;await click("Review conversion");expect(document.body.textContent).toContain("Unsaved title");expect(button("Import reviewed version").disabled).toBe(true);
  await acknowledge();await click("Refresh migration review");expect(button("Import reviewed version").disabled).toBe(true);
  await acknowledge();await click("Import reviewed version");expect(document.body.textContent).toContain("could not be confirmed");expect(current.document.revision).toBe(5);
  expect(writes[0]).toMatchObject({revisionId:"original",sourceKind:"autosave",expectedArchiveDigest:"c".repeat(64),expectedAuthoringDigest:"a".repeat(64),expectedRevision:5,acknowledgeTextImport:true});
  wrongReceipt=false;await click("Refresh migration review");await acknowledge();await click("Import reviewed version");expect(current.document).toMatchObject({blocksVersion:2,revision:6,title:"Unsaved title"});
  await click("Review restore");await click("Restore this revision");expect(current.document).toMatchObject({revision:7,title:"Story",blocksVersion:2});expect(writes.at(-1)).toMatchObject({revisionId:"safety",expectedRevision:6});
  // An import acknowledged after a scope/session replacement cannot reopen the old document.
  client.pageRevisions=async()=>({page:[row("original",1)],isDone:true,continueCursor:""});
  let finish;client.importRevision=()=>new Promise(resolve=>{finish=resolve;});
  await click("Close revision history");await click("Browse revisions");await click("Review historical import");await click("Review conversion");await acknowledge();
  await click("Import reviewed version");expect(finish).toBeDefined();
  await act(async()=>root.render(<m.CanonicalDocumentWorkspace documentKey={{...key,generation:"replacement"}} read={null} client={client} pickResource={async()=>null}/>));
  await act(async()=>finish({postId:"story",revision:8,digest:canonical(8,"Saved title").document.digest,changed:true}));
  expect(button("Import reviewed version")).toBeUndefined();expect(document.querySelector('[aria-label="Document editor"]')).toBeNull();

 }finally{await act(async()=>root.unmount());dom.window.close();for(const [name,descriptor]of Object.entries(previous)){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}await loaded.cleanup();}
});
