import { JSDOM } from "jsdom";
import assert from "node:assert/strict";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { Section } from "./index";
const dom = new JSDOM('<!doctype html><div id="root"></div>', {
	url: "https://example.test",
	pretendToBeVisual: true,
});
Object.assign(globalThis, {
	window: dom.window,
	document: dom.window.document,
	HTMLElement: dom.window.HTMLElement,
	IS_REACT_ACT_ENVIRONMENT: true,
});
let reduce = false;
const listeners = new Set();
const queries = {
	get matches() {
		return reduce;
	},
	addEventListener: (_type, cb) => listeners.add(cb),
	removeEventListener: (_type, cb) => listeners.delete(cb),
};
dom.window.matchMedia = () => queries;
const observers = [];
dom.window.IntersectionObserver = class {
	constructor(callback) {
		this.callback = callback;
		this.disconnected = false;
		observers.push(this);
	}
	observe(node) {
		this.node = node;
	}
	disconnect() {
		this.disconnected = true;
	}
};
const { hydrateRoot, createRoot } = await import("react-dom/client");
const host = document.getElementById("root");
const tree = (
	<Section motion="reveal" label="Motion sample">
		<a href="#sample">Always reachable</a>
	</Section>
);
host.innerHTML = renderToString(tree);
assert.equal(
	host.querySelector("section").hasAttribute("data-reveal"),
	false,
	"SSR does not withhold content for JS",
);
const errors = [];
let root;
await act(async () => {
	root = hydrateRoot(host, tree, { onRecoverableError: (e) => errors.push(e) });
});
const section = host.querySelector("section");
assert.equal(
	section.dataset.reveal,
	"pending",
	"wait for viewport entry rather than animate at mount",
);
assert.equal(errors.length, 0);
assert.equal(section.hasAttribute("hidden"), false);
assert.equal(section.hasAttribute("inert"), false);
const observer = observers.at(-1);
await act(async () =>
	observer.callback([{ target: section, isIntersecting: false }]),
);
assert.equal(section.dataset.reveal, "pending");
await act(async () =>
	observer.callback([{ target: section, isIntersecting: true }]),
);
assert.equal(section.dataset.reveal, "entered");
assert.equal(observer.disconnected, true);
await act(async () => section.querySelector("a").focus());
assert.equal(
	section.dataset.reveal,
	"settled",
	"keyboard focus ends any reveal instead of obscuring its target",
);
await act(async () =>
	observer.callback([{ target: section, isIntersecting: true }]),
);
assert.equal(
	section.dataset.reveal,
	"settled",
	"subsequent intersections never replay",
);
await act(async () => root.unmount());
assert.equal(listeners.size, 0);
reduce = true;
await act(async () => {
	root = createRoot(host);
	root.render(tree);
});
assert.equal(host.querySelector("section").dataset.reveal, "settled");
assert.equal(observers.length, 1, "reduced motion never starts an observer");
await act(async () => root.unmount());
reduce = false;
await act(async () => {
	root = createRoot(host);
	root.render(tree);
});
const waiting = host.querySelector("section");
reduce = true;
await act(async () => {
	for (const listener of listeners) listener({ matches: true });
});
assert.equal(
	waiting.dataset.reveal,
	"settled",
	"live reduced-motion changes reveal content immediately",
);
assert.equal(observers.at(-1).disconnected, true);
await act(async () => root.unmount());
delete dom.window.IntersectionObserver;
reduce = false;
await act(async () => {
	root = createRoot(host);
	root.render(tree);
});
assert.notEqual(
	host.querySelector("section").dataset.reveal,
	"entered",
	"missing browser support falls back to static content",
);
assert.equal(host.querySelector("a").textContent, "Always reachable");
await act(async () => root.unmount());
dom.window.close();
console.log(
	"Reveal SSR, hydration, viewport, focus, reduced-motion, no replay, cleanup and fallback checks passed",
);
