import { test, expect } from "bun:test";
import { act } from "react";
import { JSDOM } from "jsdom";
import { prepareBlocks } from "./model";
import tabs from "../../../../../../../blocks/blocks/tabbed-content/render";
const instance = (id) => ({
	id,
	name: tabs.blockName,
	version: 2,
	attrs: {
		heading: "Sample sections",
		tabs: [
			{
				label: "One",
				title: "First",
				ctaLabel: "First destination",
				ctaUrl: "/first",
			},
			{
				label: "Two",
				title: "Second",
				ctaLabel: "Second destination",
				ctaUrl: "/second",
			},
			{ label: "Three", title: "Third" },
		],
	},
});
test("two real tabbed block instances have unique associations, roving focus, keyboard wrap and independent state", async () => {
	const dom = new JSDOM(
		'<!doctype html><html><body><div id="root"></div></body></html>',
		{ url: "https://example.test" },
	);
	const previous = {
		window: globalThis.window,
		document: globalThis.document,
		HTMLElement: globalThis.HTMLElement,
		getComputedStyle: globalThis.getComputedStyle,
	};
	Object.assign(globalThis, {
		window: dom.window,
		document: dom.window.document,
		HTMLElement: dom.window.HTMLElement,
		getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
		IS_REACT_ACT_ENVIRONMENT: true,
	});
	const { createRoot } = await import("react-dom/client");
	const root = createRoot(document.getElementById("root"));
	try {
		await act(async () =>
			root.render(
				prepareBlocks(
					[instance("one"), instance("two")],
					{ [tabs.blockName]: tabs },
					{ enabledPlugins: [], capabilities: [], disabledBlocks: [] },
				),
			),
		);
		const allIds = [...document.querySelectorAll("[id]")].map(
			(node) => node.id,
		);
		expect(new Set(allIds).size).toBe(allIds.length);
		const groups = [...document.querySelectorAll(".cp-editorial-tabs")];
		expect(groups.length).toBe(2);
		const buttons = [...groups[0].querySelectorAll("[role=tab]")];
		const key = async (key) =>
			act(async () =>
				document.activeElement.dispatchEvent(
					new dom.window.KeyboardEvent("keydown", {
						key,
						bubbles: true,
						cancelable: true,
					}),
				),
			);
		buttons[0].focus();
		await key("ArrowLeft");
		expect(document.activeElement).toBe(buttons[2]);
		expect(buttons[2].getAttribute("aria-selected")).toBe("true");
		await key("ArrowRight");
		expect(document.activeElement).toBe(buttons[0]);
		await key("End");
		expect(document.activeElement).toBe(buttons[2]);
		await key("Home");
		expect(document.activeElement).toBe(buttons[0]);
		await key("ArrowRight");
		expect(document.activeElement).toBe(buttons[1]);
		expect(groups[0].querySelectorAll('[role=tab][tabindex="0"]').length).toBe(
			1,
		);
		for (const [index, button] of buttons.entries()) {
			const panel = document.getElementById(
				button.getAttribute("aria-controls"),
			);
			expect(panel.getAttribute("aria-labelledby")).toBe(button.id);
			expect(panel.hidden).toBe(index !== 1);
		}
		expect(
			groups[1].querySelector("[role=tab]").getAttribute("aria-selected"),
		).toBe("true");
		buttons[1].style.direction = "rtl";
		await key("ArrowRight");
		expect(document.activeElement).toBe(buttons[0]);
		await act(async () => buttons[2].click());
		expect(buttons[2].getAttribute("aria-selected")).toBe("true");
	} finally {
		await act(async () => root.unmount());
		dom.window.close();
		Object.assign(globalThis, previous);
	}
});
