import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { act } from "react";
import { loadStaged } from "./schema-editor/test-harness";
const require = createRequire(import.meta.url),
	{ JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");
test("coverage, readiness and saved document failures remain distinct across filters and reactive pages", async () => {
	const loaded = await loadStaged("../BlockDiagnostics.fixture.ts"),
		{ BlockDiagnosticsView } = loaded.module,
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
	const row = (id, state, complete = true) => ({
		_id: id,
		title: id,
		slug: id,
		type: "page",
		status: "draft",
		blockNames: ["core/heading"],
		diagnosis: {
			state,
			usageComplete: complete,
			issue:
				state === "invalid"
					? { code: "invalid_structure", path: "blocks[1].attrs" }
					: null,
		},
	});
	const props = {
		documents: [
			row("Broken section", "invalid", false),
			row("Old story", "legacy"),
		],
		status: "CanLoadMore",
		readiness: {
			presentation: { packId: "core", revision: "one" },
			policy: {
				capabilities: [],
				enabledPlugins: [],
				disabledBlocks: ["core/synced"],
			},
		},
		syncedStatus: "stale",
		loadMore: () => {
			loads++;
		},
	};
	let loads = 0;
	const render = (overrides = {}) =>
		act(async () =>
			root.render(<BlockDiagnosticsView {...props} {...overrides} />),
		);
	const select = async (label, value) =>
		act(async () => {
			const el = document.querySelector(`select[aria-label="${label}"]`);
			el.value = value;
			el.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
		});
	try {
		await render();
		expect(document.body.textContent).toContain(
			"Visual quality, live data, and interactions require separate verification.",
		);
		expect(
			document
				.querySelectorAll('section[aria-label="Template coverage"] table')[0]
				.querySelectorAll("tbody tr").length,
		).toBe(4);
		expect(document.body.textContent).toContain(
			"Verification required before insertion",
		);
		expect(document.body.textContent).toContain("At least 2");
		const broken = document.querySelector(
			'a[href="#/pages/Broken%20section/edit"]',
		);
		expect(broken).not.toBeNull();
		expect(document.body.textContent).toContain("First issue: blocks[1].attrs");
		expect(
			document.querySelector('a[href="#/pages/Old%20story/edit"]'),
		).toBeNull();
		await select("Show documents", "legacy");
		expect(
			document.querySelector('a[href="#/pages/Old%20story/edit"]'),
		).not.toBeNull();
		await act(async () =>
			[...document.querySelectorAll("button")]
				.find((el) => el.textContent === "Check more documents")
				.click(),
		);
		expect(loads).toBe(1);
		await render({ status: "Exhausted" });
		expect(document.body.textContent).toContain("Usage is incomplete");
		expect(document.body.textContent).not.toContain("Usage scan complete");
		expect(document.querySelector("button")).toBeNull();
		await render({
			status: "Exhausted",
			documents: [row("Fixed section", "valid")],
			syncedStatus: "ready",
		});
		expect(document.body.textContent).toContain("Usage scan complete");
		expect(document.body.textContent).not.toContain("Broken section");
		expect(document.body.textContent).toContain("Page dependencies verified");
		await select("Inspect template", "journal");
		expect(document.querySelectorAll("select")[0].value).toBe("journal");
		await act(async () => {
			const input = document.querySelector('input[type="search"]');
			Object.getOwnPropertyDescriptor(
				dom.window.HTMLInputElement.prototype,
				"value",
			).set.call(input, "no-such-block");
			input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
		});
		expect(document.body.textContent).toContain("No blocks match this search.");
	} finally {
		await act(async () => root.unmount());
		dom.window.close();
		await loaded.cleanup();
		for (const [key, descriptor] of Object.entries(previous)) {
			if (descriptor) Object.defineProperty(globalThis, key, descriptor);
			else delete globalThis[key];
		}
	}
});
