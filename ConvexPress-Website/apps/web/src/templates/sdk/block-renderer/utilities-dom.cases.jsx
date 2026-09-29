import { test, expect } from "bun:test";
import { act } from "react";
import { JSDOM } from "jsdom";
import { renderToString } from "react-dom/server";
import { utilityTree, slide } from "./utilities.cases";
import announcement from "../../../../../../../blocks/core/announcement-bar/render";
import carousel from "../../../../../../../blocks/core/carousel/render";
import share from "../../../../../../../blocks/blocks/social-share/render";
import search from "../../../../../../../blocks/core/search-box/render";
test("scheduled announcement hydrates without mismatch, opens and expires at its boundaries and cancels pending work", async () => {
	const previous = {
		window: globalThis.window,
		document: globalThis.document,
		HTMLElement: globalThis.HTMLElement,
		setTimeout: globalThis.setTimeout,
		clearTimeout: globalThis.clearTimeout,
		now: Date.now,
	};
	let now = Date.parse("2040-06-01T08:59:59Z");
	Date.now = () => now;
	const attrs = {
		text: "Scheduled notice",
		schedule: {
			startsAt: "2040-06-01T09:00:00Z",
			endsAt: "2040-06-01T09:00:01Z",
		},
	};
	const content = () => utilityTree(announcement, attrs);
	const dom = new JSDOM(`<div id="root">${renderToString(content())}</div>`, {
		url: "https://example.test",
	});
	const timers = new Map();
	let serial = 0;
	Object.assign(globalThis, {
		window: dom.window,
		document: dom.window.document,
		HTMLElement: dom.window.HTMLElement,
		IS_REACT_ACT_ENVIRONMENT: true,
		setTimeout: (callback, delay, ...args) => {
			if (delay === 1000) {
				const id = `announcement-${++serial}`;
				timers.set(id, () => callback(...args));
				return id;
			}
			return previous.setTimeout(callback, delay, ...args);
		},
		clearTimeout: (id) => {
			if (timers.has(id)) timers.delete(id);
			else previous.clearTimeout(id);
		},
	});
	let root;
	try {
		const { hydrateRoot } = await import("react-dom/client");
		const errors = [];
		await act(async () => {
			root = hydrateRoot(document.getElementById("root"), content(), {
				onRecoverableError: (error) => errors.push(error.message),
			});
		});
		expect(errors).toEqual([]);
		expect(document.body.textContent).not.toContain("Scheduled notice");
		expect(timers.size).toBe(1);
		async function tick() {
			const [id, run] = timers.entries().next().value;
			timers.delete(id);
			now += 1000;
			await act(async () => run());
		}
		await tick();
		expect(document.body.textContent).toContain("Scheduled notice");
		expect(timers.size).toBe(1);
		await tick();
		expect(document.body.textContent).not.toContain("Scheduled notice");
		expect(timers.size).toBe(0);
		now = Date.parse("2040-06-01T08:59:59Z");
		await act(async () => root.render(null));
		await act(async () => root.render(content()));
		expect(timers.size).toBe(1);
		await act(async () => root.unmount());
		root = null;
		expect(timers.size).toBe(0);
	} finally {
		if (root) await act(async () => root.unmount());
		dom.window.close();
		Date.now = previous.now;
		Object.assign(globalThis, {
			window: previous.window,
			document: previous.document,
			HTMLElement: previous.HTMLElement,
			setTimeout: previous.setTimeout,
			clearTimeout: previous.clearTimeout,
		});
	}
});
async function inDom(run) {
	const dom = new JSDOM(
		'<!doctype html><html><body><div id="root"></div></body></html>',
		{ url: "https://example.test/original" },
	);
	const previous = {
		window: globalThis.window,
		document: globalThis.document,
		HTMLElement: globalThis.HTMLElement,
	};
	const navigatorDescriptor = Object.getOwnPropertyDescriptor(
		globalThis,
		"navigator",
	);
	Object.assign(globalThis, {
		window: dom.window,
		document: dom.window.document,
		HTMLElement: dom.window.HTMLElement,
		IS_REACT_ACT_ENVIRONMENT: true,
	});
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: dom.window.navigator,
	});
	const { createRoot } = await import("react-dom/client");
	const root = createRoot(document.getElementById("root"));
	try {
		await run(root, dom);
	} finally {
		await act(async () => root.unmount());
		dom.window.close();
		Object.assign(globalThis, previous);
		if (navigatorDescriptor)
			Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
		else delete globalThis.navigator;
	}
}
test("announcement dismissal preserves a focused restore control and new authored content reappears", async () =>
	inDom(async (root) => {
		await act(async () =>
			root.render(
				utilityTree(announcement, {
					text: "First announcement",
					link: { label: "Read", href: "/read" },
				}),
			),
		);
		const button = document.querySelector("button");
		button.focus();
		await act(async () => button.click());
		expect(document.body.textContent).not.toContain("First announcement");
		expect(document.activeElement).toBe(button);
		expect(button.textContent).toBe("Show announcement");
		expect(document.querySelector("a")).toBeNull();
		await act(async () => button.click());
		expect(document.body.textContent).toContain("First announcement");
		await act(async () => button.click());
		await act(async () =>
			root.render(utilityTree(announcement, { text: "New announcement" })),
		);
		expect(document.body.textContent).toContain("New announcement");
	}));
test("a dismissed announcement becomes visible when dismissal is disabled", async () =>
	inDom(async (root) => {
		const attrs = {
			text: "Required announcement",
			link: { label: "Read the notice", href: "/notice" },
			dismissible: true,
		};
		await act(async () => root.render(utilityTree(announcement, attrs)));
		await act(async () => document.querySelector("button").click());
		expect(document.body.textContent).not.toContain(attrs.text);
		await act(async () =>
			root.render(utilityTree(announcement, { ...attrs, dismissible: false })),
		);
		expect(document.body.textContent).toContain(attrs.text);
		expect(document.querySelector("a")?.getAttribute("href")).toBe("/notice");
		expect(document.querySelector("button")).toBeNull();
	}));
test("carousel instances keep independent controls/IDs, hidden slide focus safety and no automatic advance", async () =>
	inDom(async (root) => {
		const children = [
			slide("first", "First slide"),
			slide("second", "Second slide"),
		];
		await act(async () =>
			root.render(
				<>
					{utilityTree(
						carousel,
						{ accessibleLabel: "First carousel" },
						children,
					)}
					{utilityTree(
						carousel,
						{ accessibleLabel: "Second carousel" },
						[slide("second-first", "First slide"),slide("second-second", "Second slide")],
					)}
				</>,
			),
		);
		const carousels = [...document.querySelectorAll(".cp-library-carousel")];
		expect(carousels.length).toBe(2);
		const ids = [...document.querySelectorAll("[id]")].map((node) => node.id);
		expect(new Set(ids).size).toBe(ids.length);
		const next = carousels[0].querySelectorAll("button")[1];
		next.focus();
		await act(async () => next.click());
		expect(document.activeElement).toBe(next);
		expect(carousels[0].querySelector("[role=status]").textContent).toBe(
			"2 / 2",
		);
		expect(carousels[1].querySelector("[role=status]").textContent).toBe(
			"1 / 2",
		);
		expect(
			carousels[0].querySelector("[aria-roledescription=slide]").hidden,
		).toBe(true);
		await act(async () => next.click());
		expect(carousels[0].querySelector("[role=status]").textContent).toBe(
			"1 / 2",
		);
	}));
test("search uses native successful form controls with proper labels and singular post scope", async () =>
	inDom(async (root, dom) => {
		await act(async () =>
			root.render(
				utilityTree(search, { scope: "posts", placeholder: "Find a story" }),
			),
		);
		const form = document.querySelector("form");
		const input = form.querySelector("input[type=search]");
		expect(document.querySelector("label").htmlFor).toBe(input.id);
		input.value = "Clay & paper";
		const values = Object.fromEntries(new dom.window.FormData(form));
		expect(values).toEqual({ q: "Clay & paper", type: "post" });
		expect(form.method).toBe("get");
		expect(form.getAttribute("action")).toBe("/search");
	}));
test("share uses the actual click-time page URL and reports clipboard failure without false success", async () =>
	inDom(async (root, dom) => {
		const copied = [];
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: {
				writeText: async (value) => {
					copied.push(value);
				},
			},
		});
		await act(async () =>
			root.render(
				utilityTree(share, {
					shareUrlMode: "currentPage",
					networks: ["x", "copy"],
				}),
			),
		);
		dom.window.history.pushState({}, "", "/changed?q=clay#notes");
		const link = document.querySelector("a");
		link.addEventListener("click", (event) => event.preventDefault());
		await act(async () => link.click());
		expect(new URL(link.href).searchParams.get("url")).toBe(
			"https://example.test/changed?q=clay#notes",
		);
		await act(async () => document.querySelector("button").click());
		expect(copied).toEqual(["https://example.test/changed?q=clay#notes"]);
		expect(document.querySelector("[role=status]").textContent).toBe(
			"Link copied.",
		);
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: {
				writeText: async () => {
					throw new Error("Denied");
				},
			},
		});
		await act(async () => document.querySelector("button").click());
		expect(document.querySelector("[role=status]").textContent).toContain(
			"Copy is unavailable",
		);
		expect(document.querySelector("input").readOnly).toBe(true);
		expect(document.querySelector("input").value).toBe(
			"https://example.test/changed?q=clay#notes",
		);
	}));


test("delayed clipboard feedback cannot replace a newer request or destination", async () => inDom(async (root) => {
  const pending=[];
  Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:url=>new Promise((resolve,reject)=>pending.push({url,resolve,reject}))}});
  const render=url=>root.render(utilityTree(share,{shareUrlMode:"custom",customUrl:url,networks:["copy"]}));
  await act(async()=>render("https://example.test/old"));
  await act(async()=>document.querySelector("button").click());
  await act(async()=>render("https://example.test/new"));
  await act(async()=>pending[0].reject(Error("denied")));
  expect(document.querySelector("input")).toBeNull();
  expect(document.querySelector("[role=status]").textContent).toBe("");
  await act(async()=>document.querySelector("button").click());
  await act(async()=>document.querySelector("button").click());
  await act(async()=>pending[2].resolve());
  await act(async()=>pending[1].reject(Error("old request denied")));
  expect(document.querySelector("[role=status]").textContent).toBe("Link copied.");
  expect(document.querySelector("input")).toBeNull();
  await act(async()=>render("https://example.test/final"));
  expect(document.querySelector("[role=status]").textContent).toBe("");
}));
