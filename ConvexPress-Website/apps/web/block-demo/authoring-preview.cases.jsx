import { test, expect } from "bun:test";
import { act } from "react";
import { JSDOM } from "jsdom";
import { AuthoringPreview } from "./authoring-preview";
import { prepareBlocks } from "../src/templates/sdk/block-renderer/model";
import cta from "../../../../blocks/core/cta-band/render";
import {
	PrimitiveProvider,
	createPackPartsRegistry,
} from "../src/templates/sdk/primitives";
const registry = { "core/cta-band": cta };
const parts = createPackPartsRegistry({});
const initial = {
	id: "local-cta",
	name: "core/cta-band",
	version: 2,
	attrs: {
		heading: "Morning notes",
		primaryCtaLabel: "Read the notes",
		primaryCtaUrl: "/notes",
	},
};
const preview = (instance) => (
	<PrimitiveProvider packId="core" registry={parts}>
		{prepareBlocks([instance], registry, {
			enabledPlugins: [],
			capabilities: [],
			disabledBlocks: [],
		})}
	</PrimitiveProvider>
);
async function setup(run) {
	const dom = new JSDOM('<div id="app"></div>', {
		url: "http://localhost:4318",
	});
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
	const old = new Map(
		names.map((name) => [
			name,
			Object.getOwnPropertyDescriptor(globalThis, name),
		]),
	);
	for (const name of names)
		Object.defineProperty(globalThis, name, {
			configurable: true,
			writable: true,
			value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name],
		});
	const originalFetch = globalThis.fetch;
	globalThis.fetch = () => {
		throw Error("No network permitted in local authoring");
	};
	const { createRoot } = await import("react-dom/client");
	const root = createRoot(document.getElementById("app"));
	const host = document.getElementById("app");
	const render = async (instance = initial) =>
		act(async () =>
			root.render(
				<AuthoringPreview instance={instance} renderPreview={preview} />,
			),
		);
	const change = async (input, value) =>
		act(async () => {
			const type =
				input.tagName === "SELECT"
					? "HTMLSelectElement"
					: input.tagName === "TEXTAREA"
						? "HTMLTextAreaElement"
						: "HTMLInputElement";
			Object.getOwnPropertyDescriptor(
				dom.window[type].prototype,
				"value",
			).set.call(input, value);
			input.dispatchEvent(
				new dom.window.Event(input.tagName === "SELECT" ? "change" : "input", {
					bubbles: true,
				}),
			);
		});
	const field = (label) => {
		const node = [...host.querySelectorAll("label")].find(
			(item) => item.textContent === label,
		);
		return document.getElementById(node.htmlFor);
	};
	try {
		await render();
		await run({ host, render, change, field });
	} finally {
		await act(async () => root.unmount());
		dom.window.close();
		globalThis.fetch = originalFetch;
		for (const name of names) {
			const value = old.get(name);
			if (value) Object.defineProperty(globalThis, name, value);
			else delete globalThis[name];
		}
	}
}
test("canonical form updates the actual renderer, refuses invalid URLs and never exposes a write action", () =>
	setup(async ({ host, field, change }) => {
		const canvas = () =>
			host.querySelector('[data-authoring-preview="canvas"]');
		expect(canvas().textContent).toContain("Morning notes");
		await change(field("Heading"), "A more careful morning");
		expect(canvas().textContent).toContain("A more careful morning");
		expect(host.querySelector('button[type="submit"]')).toBeNull();
		await change(field("Primary Cta Url"), "javascript:alert(1)");
		expect(host.textContent).toContain("Showing the last valid preview");
		expect(canvas().querySelector("a").getAttribute("href")).toBe("/notes");
		expect(host.querySelector('[role="alert"]')).not.toBeNull();
		await change(field("Primary Cta Url"), "/revised-notes");
		expect(canvas().querySelector("a").getAttribute("href")).toBe(
			"/revised-notes",
		);
		expect(host.textContent).toContain(
			"Preview reflects the current valid fields",
		);
		expect(JSON.stringify(initial)).not.toContain("careful");
	}));
test("synthetic scope, specimen replacement and reset discard drafts without leaking a previous preview", () =>
	setup(async ({ host, field, change, render }) => {
		await change(field("Heading"), "Only sample A");
		await change(host.querySelector("select"), "sample-b");
		expect(host.textContent).toContain("block-demo-local / sample-b");
		expect(
			host.querySelector("[data-authoring-preview]").textContent,
		).not.toContain("Only sample A");
		expect(field("Heading").value).toBe("Morning notes");
		await change(field("Heading"), "Only sample B");
		await act(async () =>
			[...host.querySelectorAll("button")]
				.find((button) => button.textContent === "Reset local draft")
				.click(),
		);
		expect(field("Heading").value).toBe("Morning notes");
		await render({
			...initial,
			id: "different",
			attrs: { ...initial.attrs, heading: "Second specimen" },
		});
		expect(field("Heading").value).toBe("Second specimen");
		expect(host.textContent).toContain("Canonical field metadata");
	}));
