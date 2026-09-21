import { test, expect } from "bun:test";
import { act } from "react";
import { JSDOM } from "jsdom";
import { installedFeatured } from "./featured-page.cases";
import { renderToString } from "react-dom/server";
import { FeaturedPageDemo } from "../../../../block-demo/featured-page-preview";
import featured from "../../../../../../../blocks/core/featured-page/render";
test("revocation removes an already-mounted featured result without a parent rerender", async () => {
	const dom = new JSDOM('<div id="root"></div>', {
		url: "https://example.test",
	});
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
	const { createRoot } = await import("react-dom/client");
	const root = createRoot(document.getElementById("root"));
	try {
		const installed = await installedFeatured();
		await act(async () => root.render(installed.render()));
		expect(document.body.textContent).toContain("A fictional field study");
		expect(document.querySelector("img")).not.toBeNull();
		await act(async () => installed.host.invalidate());
		expect(document.body.textContent).not.toContain("A fictional field study");
		expect(document.querySelector("img")).toBeNull();
		expect(document.querySelector("a")).toBeNull();
		expect(document.body.textContent).toContain("Featured page unavailable.");
	} finally {
		await act(async () => root.unmount());
		dom.window.close();
		Object.assign(globalThis, previous);
	}
});
test("the real demo host hydrates its pending state and clears data on viewer and tree transitions", async () => {
	const instance = {
		id: "host-fixture",
		name: "core/featured-page",
		version: 1,
		attrs: { page: "demo-featured-studio" },
	};
	const view = (value = instance) => (
		<FeaturedPageDemo
			instance={value}
			registry={{ "core/featured-page": featured }}
			studioSrc="/fixture.png"
		/>
	);
	const server = renderToString(view());
	expect(server).toContain("Resolving synthetic page");
	expect(server).not.toContain("A quieter kind");
	const dom = new JSDOM(`<div id="root">${server}</div>`, {
		url: "https://example.test",
	});
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
	const { hydrateRoot } = await import("react-dom/client");
	let root;
	const errors = [];
	try {
		await act(async () => {
			root = hydrateRoot(document.getElementById("root"), view(), {
				onRecoverableError: (error) => errors.push(error.message),
			});
		});
		expect(errors).toEqual([]);
		expect(document.body.textContent).toContain("A quieter kind of making");
		const select = document.querySelector("select");
		await act(async () => {
			select.value = "demo-other";
			select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
		});
		expect(document.body.textContent).not.toContain("A quieter kind of making");
		expect(document.querySelector(".featured-demo-result img")).toBeNull();
		await act(async () => {
			select.value = "demo-anonymous";
			select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
		});
		expect(document.body.textContent).toContain("A quieter kind of making");
		await act(async () =>
			root.render(
				view({ ...instance, attrs: { page: "demo-featured-unavailable" } }),
			),
		);
		expect(document.body.textContent).not.toContain("A quieter kind of making");
		expect(document.querySelector(".featured-demo-result a")).toBeNull();
		expect(document.body.textContent).toContain("Featured page unavailable.");
	} finally {
		if (root) await act(async () => root.unmount());
		dom.window.close();
		Object.assign(globalThis, previous);
	}
});
