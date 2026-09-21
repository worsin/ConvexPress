import { JSDOM } from "jsdom";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { act, createElement } from "react";
import * as SDK from "./index";
import { renderToString } from "react-dom/server";
import { Tabs, Accordion, Marquee, Section, Heading } from "./index";
const samples = {
	Section: {},
	Container: {},
	Stack: {},
	Grid: {},
	Columns: {},
	Split: {},
	Card: {},
	Heading: {},
	Eyebrow: {},
	Text: {},
	RichText: {
		content: {
			type: "doc",
			content: [
				{ type: "paragraph", content: [{ type: "text", text: "Notes" }] },
			],
		},
	},
	Image: { media: { src: "/forest.jpg", alt: "Forest" } },
	Video: { src: "/walk.mp4", title: "Walk" },
	Icon: { name: "check" },
	Button: { label: "Visit", href: "/visit" },
	Link: { label: "Journal", href: "/journal" },
	Badge: { label: "Open" },
	Divider: {},
	Stat: { label: "Trails", value: "12" },
	Quote: { quote: "Walk slowly." },
	List: { items: ["Forest"] },
	Accordion: { items: [{ id: "a", title: "Arrival", body: "Noon" }] },
	Tabs: {
		label: "Visit",
		items: [{ id: "a", title: "Arrival", body: "Noon" }],
	},
	Marquee: { label: "Places", items: ["Forest"] },
	Slot: { name: "aside" },
};
for (const name of SDK.primitiveNames)
	assert.ok(
		renderToString(createElement(SDK[name], samples[name], "Example")).length >
			0,
		`${name} renders`,
	);
const dom = new JSDOM(
	'<!doctype html><html><body><div id="root"></div></body></html>',
	{ url: "https://example.test" },
);
Object.assign(globalThis, {
	window: dom.window,
	document: dom.window.document,
	HTMLElement: dom.window.HTMLElement,
	IS_REACT_ACT_ENVIRONMENT: true,
});
const { hydrateRoot } = await import("react-dom/client");
const items = [
	{ id: "arrival", title: "Arrival", body: "Come at noon." },
	{ id: "departure", title: "Departure", body: "Leave at dusk." },
];
const tree = (
	<Section label="Visitor information">
		<Heading level={2}>Visit</Heading>
		<Tabs items={items} label="Your visit" />
		<Accordion items={items} defaultOpenId="arrival" />
		<Marquee items={["Forest", "Meadow"]} label="Places" />
	</Section>
);
const host = document.getElementById("root");
host.innerHTML = renderToString(tree);
const recoveries = [];
let root;
await act(async () => {
	root = hydrateRoot(host, tree, {
		onRecoverableError: (error) => recoveries.push(error),
	});
});
assert.equal(
	recoveries.length,
	0,
	"SSR hydrates without replacement or ID mismatch",
);
const tabs = [...host.querySelectorAll('[role="tab"]')];
assert.equal(tabs.length, 2);
assert.equal(tabs[0].tabIndex, 0);
await act(async () => {
	tabs[0].focus();
	tabs[0].dispatchEvent(
		new dom.window.KeyboardEvent("keydown", {
			key: "ArrowRight",
			bubbles: true,
		}),
	);
});
assert.equal(document.activeElement, tabs[1]);
assert.equal(tabs[1].getAttribute("aria-selected"), "true");
assert.equal(tabs[0].tabIndex, -1);
assert.equal(
	host.querySelectorAll('[role="tabpanel"]:not([hidden])').length,
	1,
);
assert.equal(
	host.querySelector('[role="tabpanel"]:not([hidden])')?.textContent,
	"Leave at dusk.",
);
await act(async () => {
	tabs[1].dispatchEvent(
		new dom.window.KeyboardEvent("keydown", { key: "Home", bubbles: true }),
	);
});
assert.equal(document.activeElement, tabs[0]);
await act(async () => {
	tabs[0].dispatchEvent(
		new dom.window.KeyboardEvent("keydown", { key: "End", bubbles: true }),
	);
});
assert.equal(document.activeElement, tabs[1]);
for (const tab of tabs)
	assert.ok(document.getElementById(tab.getAttribute("aria-controls")));
assert.equal(host.querySelectorAll("details > summary").length, 2);
assert.equal(host.querySelectorAll("details[open]").length, 1);
assert.equal(host.querySelector("details[open] summary").textContent, "Arrival");
const marquee = host.querySelector(".cp-marquee");
const toggle = marquee.querySelector("button");
assert.equal(marquee.dataset.playing, "false");
await act(async () => toggle.click());
assert.equal(marquee.dataset.playing, "true");
assert.equal(toggle.textContent, "Pause motion");
await act(async () => toggle.click());
assert.equal(marquee.dataset.playing, "false");
assert.equal(
	marquee.querySelector('[aria-hidden="true"]')?.textContent,
	"ForestMeadow",
);
const css = readFileSync(new URL("./primitives.css", import.meta.url), "utf8");
assert.ok(css.includes("prefers-reduced-motion: reduce"));
assert.match(css, /animation:\s*none;\s*transform:\s*none/u);
assert.ok(css.includes("prefers-reduced-motion: no-preference"));
assert.ok(!css.includes("transition: all"));
assert.ok(!css.includes("will-change"));
assert.ok(!css.includes("filter:"));
await act(async () => root.unmount());
dom.window.close();
console.log(
	"Primitive hydration, keyboard, disclosure markup, motion controls, and CSS safeguards passed",
);
