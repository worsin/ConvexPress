import { test, expect } from "bun:test";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { JSDOM } from "jsdom";
import { ConsentEmbed } from "./consent-embed";

async function inDom(run, url = "https://example.test", initial = "") {
	const dom = new JSDOM(`<div id="root">${initial}</div>`, { url });
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
	let root;
	try {
		await run(dom, (value) => {
			root = value;
		});
	} finally {
		if (root) await act(async () => root.unmount());
		dom.window.close();
		Object.assign(globalThis, previous);
	}
}
const video = (url = "https://youtu.be/M7lc1UVf-VE") => (
	<ConsentEmbed url={url} title="Authored film title" kind="video" />
);
const button = (name) =>
	[...document.querySelectorAll("button")].find(
		(node) => node.textContent === name,
	);
test("embed hydrates without contacting a provider; consent installs the closed frame and unload restores keyboard focus", async () => {
	const markup = renderToString(video());
	expect(markup).not.toContain("<iframe");
	await inDom(
		async (_dom, saveRoot) => {
			const { hydrateRoot } = await import("react-dom/client");
			const errors = [];
			await act(async () =>
				saveRoot(
					hydrateRoot(document.getElementById("root"), video(), {
						onRecoverableError: (error) => errors.push(error.message),
					}),
				),
			);
			expect(errors).toEqual([]);
			expect(document.querySelector("iframe")).toBe(null);
			expect(
				document.querySelector(".cp-library-embed-stage").dataset.loaded,
			).toBe("false");
			await act(async () => button("Load video").click());
			const frame = document.querySelector("iframe");
			expect(
				document.querySelector(".cp-library-embed-stage").dataset.loaded,
			).toBe("true");
			expect(document.activeElement).toBe(frame);
			expect(frame.src).toBe(
				"https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?autoplay=0&controls=1",
			);
			expect(frame.title).toBe("Authored film title");
			expect(frame.getAttribute("sandbox")).toBe(
				"allow-scripts allow-same-origin",
			);
			expect(frame.getAttribute("allow")).not.toContain("autoplay");
			expect(frame.getAttribute("referrerpolicy")).toBe(
				"strict-origin-when-cross-origin",
			);
			await act(async () => button("Unload embedded content").click());
			expect(document.querySelector("iframe")).toBe(null);
			expect(document.activeElement).toBe(button("Load video"));
			expect(
				document.querySelector(".cp-library-embed-stage").dataset.loaded,
			).toBe("false");
		},
		"https://example.test",
		markup,
	);
});
test("consent is per instance and cleared when the actual resource changes or the component remounts", async () =>
	inDom(async (_dom, saveRoot) => {
		const { createRoot } = await import("react-dom/client");
		const root = createRoot(document.getElementById("root"));
		saveRoot(root);
		const pair = (url) => (
			<>
				{video(url)}
				<ConsentEmbed url="https://vimeo.com/76979871" title="Second film" />
			</>
		);
		await act(async () => root.render(pair("https://youtu.be/M7lc1UVf-VE")));
		await act(async () => button("Load video").click());
		expect(document.querySelectorAll("iframe").length).toBe(1);
		await act(async () => root.render(pair("https://youtu.be/dQw4w9WgXcQ")));
		expect(document.querySelector("iframe")).toBe(null);
		await act(async () => button("Load video").click());
		expect(document.querySelector("iframe").src).toContain("dQw4w9WgXcQ");
		await act(async () => root.render(null));
		await act(async () => root.render(pair("https://youtu.be/dQw4w9WgXcQ")));
		expect(document.querySelector("iframe")).toBe(null);
	}));
test("map and scheduler modes retain fixed sandbox permissions and same-origin frames remain refused", async () => {
	await inDom(async (_dom, saveRoot) => {
		const { createRoot } = await import("react-dom/client");
		const root = createRoot(document.getElementById("root"));
		saveRoot(root);
		await act(async () =>
			root.render(
				<ConsentEmbed
					url="https://calendly.com/convexpress-example-invalid/studio-visit?email=private@example.invalid"
					title="Fictional appointment"
					kind="scheduler"
				/>,
			),
		);
		await act(async () => button("Load booking calendar").click());
		const frame = document.querySelector("iframe");
		expect(frame.getAttribute("sandbox")).toBe(
			"allow-scripts allow-same-origin allow-forms",
		);
		expect(frame.src).not.toContain("private");
		expect(frame.hasAttribute("srcdoc")).toBe(false);
	});
	await inDom(async (_dom, saveRoot) => {
		const { createRoot } = await import("react-dom/client");
		const root = createRoot(document.getElementById("root"));
		saveRoot(root);
		await act(async () =>
			root.render(
				<ConsentEmbed
					url="https://calendly.com/convexpress-example-invalid/studio-visit"
					title="Fictional appointment"
				/>,
			),
		);
		expect(document.querySelector("button")).toBe(null);
		expect(document.querySelector("iframe")).toBe(null);
		expect(document.body.textContent).toContain("Open this content directly");
	}, "https://calendly.com");
});
