import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { act } from "react";
import { loadStaged } from "../schema-editor/test-harness";
const require = createRequire(import.meta.url),
	{ JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");
test("visual inserter filters the authorized catalog, bounds cards, and handles revoked choices", async () => {
	const loaded = await loadStaged("../canonical-editor/inserter.fixture.ts"),
		{ BlockInserter } = loaded.module,
		dom = new JSDOM('<div id="app"></div>', { url: "http://localhost" }),
		previous = {};
	for (const k of [
		"window",
		"document",
		"navigator",
		"HTMLElement",
		"Event",
		"IS_REACT_ACT_ENVIRONMENT",
	]) {
		previous[k] = Object.getOwnPropertyDescriptor(globalThis, k);
		Object.defineProperty(globalThis, k, {
			configurable: true,
			writable: true,
			value: k === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[k],
		});
	}
	const { createRoot } = await import("react-dom/client"),
		root = createRoot(document.getElementById("app")),
		chosen = [];
	const blocks = Array.from({ length: 30 }, (_, i) => ({
		name: "core/block-" + i,
		title: "Block " + i,
		category: i < 15 ? "text" : "media",
		description: i === 0 ? "A searchable story" : "Example",
		keywords: i === 0 ? ["editorial"] : [],
		thumbnail: "/block-thumbnails/core/block-" + i + ".jpg",
	}));
	const render = (items = blocks, disabled = false) =>
		act(async () =>
			root.render(
				<BlockInserter
					blocks={items}
					selected="core/block-0"
					onSelect={(n) => chosen.push(n)}
					disabled={disabled}
				/>,
			),
		);
	const input = async (value) =>
		act(async () => {
			const el = document.querySelector("input");
			Object.getOwnPropertyDescriptor(
				dom.window.HTMLInputElement.prototype,
				"value",
			).set.call(el, value);
			el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
		});
	try {
		await render();
		expect(document.querySelectorAll("button[aria-pressed]").length).toBe(24);
		await act(async () =>
			[...document.querySelectorAll("button")]
				.find((b) => b.textContent === "Show more blocks")
				.click(),
		);
		expect(document.querySelectorAll("button[aria-pressed]").length).toBe(30);
		await input("story editorial");
		expect(document.querySelectorAll("button[aria-pressed]").length).toBe(1);
		await act(async () =>
			document.querySelector('button[aria-label="Choose Block 0"]').click(),
		);
		expect(chosen).toEqual(["core/block-0"]);
		await input("no matching item");
		expect(document.body.textContent).toContain("No blocks match");
		await input("");
		await act(async () => {
			const el = document.querySelector("select");
			el.value = "media";
			el.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
		});
		expect(document.querySelectorAll("button[aria-pressed]").length).toBe(15);
		await render(blocks.slice(0, 2));
		expect(document.querySelectorAll("button[aria-pressed]").length).toBe(2);
		await render([blocks[1]], true);
		expect(
			document.querySelector('button[aria-label="Choose Block 0"]'),
		).toBeNull();
		expect(
			document.querySelector('button[aria-label="Choose Block 1"]').disabled,
		).toBe(true);
		expect(chosen).toEqual(["core/block-0"]);
	} finally {
		await act(async () => root.unmount());
		dom.window.close();
		await loaded.cleanup();
		for (const [k, v] of Object.entries(previous)) {
			if (v) Object.defineProperty(globalThis, k, v);
			else delete globalThis[k];
		}
	}
});
