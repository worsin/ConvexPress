import { test, expect } from "bun:test";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { JSDOM } from "jsdom";
import { prepareBlocks } from "./model";
import countdown from "../../../../../../../blocks/core/countdown/render";
import marquee from "../../../../../../../blocks/core/marquee/render";
import { VideoCover } from "./video-cover";

test("cover playback promises cannot revive a paused or replaced resource", async () => {
	const dom = new JSDOM('<!doctype html><html><body><div id="cover-root"></div></body></html>', { url: "https://example.test", pretendToBeVisual: true });
	const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, IntersectionObserver: globalThis.IntersectionObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
	const listeners = new Set(); const observers = []; const pending = []; const paused = new WeakMap();
	const preference = { matches: false, addEventListener: (_type, fn) => listeners.add(fn), removeEventListener: (_type, fn) => listeners.delete(fn) };
	dom.window.matchMedia = () => preference;
	Object.defineProperty(dom.window.HTMLMediaElement.prototype, "paused", { get() { return paused.get(this) ?? true; } });
	dom.window.HTMLMediaElement.prototype.pause = function () { const wasPlaying = !this.paused; paused.set(this, true); if (wasPlaying) this.dispatchEvent(new dom.window.Event("pause")); };
	dom.window.HTMLMediaElement.prototype.play = function () { const video = this; return new Promise(resolve => pending.push({ video, resolve: () => { paused.set(video, false); video.dispatchEvent(new dom.window.Event("play")); resolve(); } })); };
	class Observer { constructor(callback) { this.callback = callback; this.active = true; observers.push(this); } observe() {} disconnect() { this.active = false; } }
	Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IntersectionObserver: Observer, IS_REACT_ACT_ENVIRONMENT: true });
	const { createRoot } = await import("react-dom/client"); const root = createRoot(document.getElementById("cover-root"));
	const show = src => act(async () => root.render(<VideoCover media={{src,alt:"Workshop",mimeType:"video/webm"}} title="Workshop cover" poster="/poster.png" />));
	try {
		await show("/first.webm"); await act(async () => observers.at(-1).callback([{ isIntersecting: true }])); expect(pending).toHaveLength(1);
		await act(async () => { preference.matches = true; for (const fn of listeners) fn(); });
		await act(async () => pending[0].resolve()); expect(pending[0].video.paused).toBe(true); expect(document.querySelector("button").textContent).toBe("Play video");
		await act(async () => document.querySelector("button").click()); expect(pending).toHaveLength(2);
		await show("/second.webm"); expect(observers[0].active).toBe(false); expect(listeners.size).toBe(1);
		await act(async () => pending[1].resolve()); expect(pending[1].video.paused).toBe(true); expect(document.querySelector("video").getAttribute("src")).toBe("/second.webm");
		await act(async () => observers.at(-1).callback([{ isIntersecting: true }])); expect(pending).toHaveLength(2);
		await act(async () => document.querySelector("button").click()); await act(async () => pending[2].resolve()); expect(document.querySelector("video").paused).toBe(false);
		await act(async () => root.unmount()); expect(listeners.size).toBe(0); expect(observers.every(observer => !observer.active)).toBe(true); expect(pending[2].video.paused).toBe(true);
	} finally { await act(async () => root.unmount()); dom.window.close(); Object.assign(globalThis, previous); }
});
const policy = {
	enabledPlugins: [],
	capabilities: ["reference.targetResolution"],
	disabledBlocks: [],
};
const view = (definition, attrs) =>
	prepareBlocks(
		[
			{
				id: "interactive-detail",
				name: definition.blockName,
				version: 1,
				attrs,
			},
		],
		{ [definition.blockName]: definition },
		policy,
	);
test("countdown hydrates stable output, announces only expiry, keeps CTA and cancels its timer on unmount", async () => {
	const original = {
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
		title: "Fictional gathering",
		target: "2040-06-01T09:00:00Z",
		expiredText: "This sample date arrived.",
		cta: { label: "Read", href: "/read" },
	};
	const server = renderToString(view(countdown, attrs));
	const dom = new JSDOM(
		`<!doctype html><html><body><div id="root">${server}</div></body></html>`,
		{ url: "https://example.test" },
	);
	const timers = new Map();
	let serial = 0;
	Object.assign(globalThis, {
		window: dom.window,
		document: dom.window.document,
		HTMLElement: dom.window.HTMLElement,
		IS_REACT_ACT_ENVIRONMENT: true,
		setTimeout: (callback, delay, ...args) => {
			if (delay === 1000) {
				const id = `countdown-${++serial}`;
				timers.set(id, () => callback(...args));
				return id;
			}
			return original.setTimeout(callback, delay, ...args);
		},
		clearTimeout: (id) => {
			if (timers.has(id)) timers.delete(id);
			else original.clearTimeout(id);
		},
	});
	const errors = [];
	const { hydrateRoot } = await import("react-dom/client");
	let root;
	try {
		await act(async () => {
			root = hydrateRoot(
				document.getElementById("root"),
				view(countdown, attrs),
				{ onRecoverableError: (error) => errors.push(error.message) },
			);
		});
		expect(errors).toEqual([]);
		expect(timers.size).toBe(1);
		expect(
			document.querySelector('[aria-label="Time remaining"]'),
		).not.toBeNull();
		expect(document.querySelector("[role=status]").textContent).toBe("");
		expect(
			document
				.querySelector('[aria-label="Time remaining"]')
				.closest("[aria-live]"),
		).toBeNull();
		now += 1000;
		const [id, callback] = timers.entries().next().value;
		timers.delete(id);
		await act(async () => callback());
		expect(document.querySelector("[role=status]").textContent).toBe(
			"This sample date arrived.",
		);
		expect(document.querySelector('[aria-label="Time remaining"]')).toBeNull();
		expect(document.querySelector("a").getAttribute("href")).toBe("/read");
		expect(timers.size).toBe(0);
		await act(async () =>
			root.render(
				view(countdown, { ...attrs, target: "2040-06-01T09:01:00Z" }),
			),
		);
		expect(timers.size).toBe(1);
		await act(async () => root.unmount());
		root = null;
		expect(timers.size).toBe(0);
	} finally {
		if (root) await act(async () => root.unmount());
		dom.window.close();
		Object.assign(globalThis, {
			window: original.window,
			document: original.document,
			HTMLElement: original.HTMLElement,
			setTimeout: original.setTimeout,
			clearTimeout: original.clearTimeout,
		});
		Date.now = original.now;
	}
});
test("rich marquee starts paused, responds to live reduced-motion preference and removes its listener", async () => {
	const original = {
		window: globalThis.window,
		document: globalThis.document,
		HTMLElement: globalThis.HTMLElement,
		matchMedia: globalThis.matchMedia,
	};
	const dom = new JSDOM(
		'<!doctype html><html><body><div id="root"></div></body></html>',
		{ url: "https://example.test" },
	);
	const listeners = new Set();
	const preference = {
		matches: false,
		addEventListener: (_, listener) => listeners.add(listener),
		removeEventListener: (_, listener) => listeners.delete(listener),
	};
	Object.assign(globalThis, {
		window: dom.window,
		document: dom.window.document,
		HTMLElement: dom.window.HTMLElement,
		matchMedia: () => preference,
		IS_REACT_ACT_ENVIRONMENT: true,
	});
	const { createRoot } = await import("react-dom/client");
	const root = createRoot(document.getElementById("root"));
	try {
		await act(async () =>
			root.render(
				view(marquee, {
					items: [
						{ text: "Observe", link: { label: "Read notes", href: "/notes" } },
					],
				}),
			),
		);
		const wrapper = document.querySelector(".cp-library-rich-marquee");
		const control = wrapper.querySelector("button");
		expect(wrapper.dataset.playing).toBe("false");
		expect(listeners.size).toBe(1);
		expect(
			wrapper.querySelector('ul[aria-hidden="true"]').hasAttribute("inert"),
		).toBe(true);
		await act(async () => control.click());
		expect(wrapper.dataset.playing).toBe("true");
		expect(control.textContent).toBe("Pause motion");
		preference.matches = true;
		await act(async () => {
			for (const listener of listeners) listener();
		});
		expect(wrapper.dataset.playing).toBe("false");
		expect(control.disabled).toBe(true);
		expect(control.textContent).toBe("Motion reduced");
		preference.matches = false;
		await act(async () => {
			for (const listener of listeners) listener();
		});
		expect(control.disabled).toBe(false);
		expect(wrapper.dataset.playing).toBe("false");
	} finally {
		await act(async () => root.unmount());
		expect(listeners.size).toBe(0);
		dom.window.close();
		Object.assign(globalThis, original);
	}
});
