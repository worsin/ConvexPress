import { test, expect } from "bun:test";
import { act } from "react";
import { JSDOM } from "jsdom";
import { render } from "./media.cases";
import gallery from "../../../../../../../blocks/core/gallery/render";
test("gallery component wraps Tab and Shift+Tab, skips disabled navigation and restores trigger focus", async () => {
	const dom = new JSDOM(
		'<!doctype html><html><body><div id="root"></div></body></html>',
		{ url: "https://example.test" },
	);
	const previous = {
		window: globalThis.window,
		document: globalThis.document,
		HTMLElement: globalThis.HTMLElement,
	};
	Object.assign(globalThis, {
		window: dom.window,
		document: dom.window.document,
		HTMLElement: dom.window.HTMLElement,
		IS_REACT_ACT_ENVIRONMENT: true,
	});
	// jsdom has no native top-layer implementation. Browser gate owns trap/Escape semantics.
	dom.window.HTMLDialogElement.prototype.showModal = function () {
		this.open = true;
	};
	dom.window.HTMLDialogElement.prototype.close = function () {
		this.open = false;
		this.dispatchEvent(new dom.window.Event("close"));
	};
	const { createRoot } = await import("react-dom/client");
	const root = createRoot(dom.window.document.getElementById("root"));
	try {
		await act(async () =>
			root.render(
				render(gallery, {
					items: [
						{ media: { id: "photo" }, caption: "Workshop" },
						{ media: { id: "after" }, caption: "Result" },
					],
					lightbox: true,
				}),
			),
		);
		const buttons = () => [...dom.window.document.querySelectorAll("button")];
		const trigger = buttons().find((button) =>
			button.textContent?.includes("View Workshop"),
		);
		await act(async () => trigger.click());
		expect(dom.window.document.querySelector("dialog")?.open).toBe(true);
		const next = buttons().find(
			(button) => button.textContent === "Next image",
		);
		const closeButton = buttons().find((button) =>
			button.textContent?.includes("Close preview"),
		);
		next.focus();
		const tab = new dom.window.KeyboardEvent("keydown", {
			key: "Tab",
			bubbles: true,
			cancelable: true,
		});
		await act(async () => next.dispatchEvent(tab));
		expect(tab.defaultPrevented).toBe(true);
		expect(dom.window.document.activeElement === closeButton).toBe(true);
		const reverse = new dom.window.KeyboardEvent("keydown", {
			key: "Tab",
			shiftKey: true,
			bubbles: true,
			cancelable: true,
		});
		await act(async () => closeButton.dispatchEvent(reverse));
		expect(reverse.defaultPrevented).toBe(true);
		expect(dom.window.document.activeElement === next).toBe(true);

		await act(async () =>
			buttons()
				.find((button) => button.textContent === "Next image")
				.click(),
		);
		expect(
			dom.window.document.querySelector("dialog img")?.getAttribute("src"),
		).toBe("/after.png");
		expect(next.disabled).toBe(true);
		expect(dom.window.document.activeElement === closeButton).toBe(true);

		await act(async () =>
			buttons()
				.find((button) => button.textContent?.includes("Close preview"))
				.click(),
		);
		expect(dom.window.document.querySelector("dialog")?.open).toBe(false);
		expect(dom.window.document.activeElement === trigger).toBe(true);
	} finally {
		await act(async () => root.unmount());
		dom.window.close();
		Object.assign(globalThis, previous);
	}
});

test("gallery closes a stale preview after live removal or disabling, and can open again", async () => {
	const dom = new JSDOM(
		'<!doctype html><html><body><div id="root"></div></body></html>',
		{ url: "https://example.test" },
	);
	const previous = {
		window: globalThis.window,
		document: globalThis.document,
		HTMLElement: globalThis.HTMLElement,
		IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT,
	};
	Object.assign(globalThis, {
		window: dom.window,
		document: dom.window.document,
		HTMLElement: dom.window.HTMLElement,
		IS_REACT_ACT_ENVIRONMENT: true,
	});
	dom.window.HTMLDialogElement.prototype.showModal = function () {
		this.open = true;
	};
	dom.window.HTMLDialogElement.prototype.close = function () {
		this.open = false;
		this.dispatchEvent(new dom.window.Event("close"));
	};
	const { createRoot } = await import("react-dom/client");
	const root = createRoot(dom.window.document.getElementById("root"));
	const items = [
		{ media: { id: "photo" }, caption: "Workshop" },
		{ media: { id: "after" }, caption: "Result" },
	];
	const update = async (nextItems, lightbox = true) =>
		act(async () =>
			root.render(render(gallery, { items: nextItems, lightbox })),
		);
	const open = async (label) => {
		const button = [...dom.window.document.querySelectorAll("button")].find(
			(node) => node.textContent.includes(`View ${label}`),
		);
		await act(async () => button.click());
		expect(dom.window.document.querySelector("dialog")?.open).toBe(true);
	};
	const expectClosed = () =>
		expect(dom.window.document.querySelector("dialog")?.open ?? false).toBe(
			false,
		);
	try {
		await update(items);
		await open("Result");
		// A live document update removes the image currently open in the top layer.
		await update(items.slice(0, 1));
		expectClosed();
		expect(dom.window.document.activeElement).not.toBe(
			dom.window.document.body,
		);
		await open("Workshop");
		expect(
			dom.window.document.querySelector("dialog img").getAttribute("src"),
		).toBe("/photo.png");
		// Replacing an image at the same index must not silently change the open photo.
		await update([items[1]]);
		expectClosed();
		await open("Result");
		await update([items[1]], false);
		expectClosed();
		await update([items[1]], true);
		expectClosed();
		await open("Result");
		await update([]);
		expectClosed();
		await update(items);
		expectClosed();
		await open("Result");
		await update([items[0], { caption: "Image removed" }]);
		expectClosed();
		await open("Workshop");
	} finally {
		await act(async () => root.unmount());
		dom.window.close();
		Object.assign(globalThis, previous);
	}
});
