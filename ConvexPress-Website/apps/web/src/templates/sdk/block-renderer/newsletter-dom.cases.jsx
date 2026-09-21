import { test, expect } from "bun:test";
import { act } from "react";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { ConvexProvider } from "convex/react";
import { getFunctionName } from "convex/server";
import { ProductionNewsletterProvider } from "./newsletter-production";
import {
	NewsletterProvider,
	NewsletterForm,
	createNewsletterTransport,
} from "./newsletter";

async function inDom(run) {
	const dom = new JSDOM('<div id="root"></div>', {
		url: "https://example.test",
	});
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
	const { createRoot } = await import("react-dom/client");
	const root = createRoot(document.getElementById("root"));
	try {
		await run(root, dom);
	} finally {
		await act(async () => root.unmount());
		dom.window.close();
		Object.assign(globalThis, previous);
	}
}
const form = (transport, message = "Saved by the handler.") => (
	<NewsletterProvider transport={transport}>
		<NewsletterForm
			placeholder="Email"
			submitLabel="Join"
			successMessage={message}
		/>
	</NewsletterProvider>
);
async function fill(dom, value) {
	await act(async () => {
		const input = document.querySelector("input");
		input.value = value;
		input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
	});
}
async function submit(dom) {
	await act(async () =>
		document
			.querySelector("form")
			.dispatchEvent(
				new dom.window.Event("submit", { bubbles: true, cancelable: true }),
			),
	);
}
test("the production signup host disables native SSR submission, then connects the installed client after mount", async () => {
  const calls = [];
  const client = { url: "https://fixture.convex.cloud", mutation: async (fn, args) => {
    calls.push({ name: getFunctionName(fn), args });
    return { ok: true, status: "subscribed" };
  } };
  const hosted = <ConvexProvider client={client}><ProductionNewsletterProvider installationKey="fixture-stage">
    <NewsletterForm placeholder="Email" submitLabel="Join" />
  </ProductionNewsletterProvider></ConvexProvider>;
  const html = renderToStaticMarkup(hosted);
  expect(html).toMatch(/<input[^>]*disabled/);
  expect(html).toMatch(/<button[^>]*disabled/);
  expect(html).toContain("Preparing signup…");
  expect(html).not.toContain("not connected in this preview");
  expect(calls).toHaveLength(0);
  await inDom(async (root, dom) => {
    await act(async () => root.render(hosted));
    expect(document.querySelector("input").disabled).toBe(false);
    expect(document.querySelector("button").disabled).toBe(false);
    await fill(dom, "HOST@example.invalid");
    await submit(dom);
    expect(calls).toEqual([{ name: "emails/mutations:subscribeNewsletter", args: { email: "host@example.invalid", source: "canonical_newsletter" } }]);
    expect(document.querySelector(".cp-library-newsletter-success")).not.toBe(null);
    expect(dom.window.location.search).toBe("");
  });
});
test("newsletter requires a real host transport and valid email, guards double submits, and only a validated receipt authorizes success", async () =>
	inDom(async (root, dom) => {
		await act(async () => root.render(form(null)));
		expect(document.querySelector("button").disabled).toBe(true);
		expect(document.body.textContent).toContain("not connected");
		let resolve;
		const calls = [];
		const transport = createNewsletterTransport(
			"synthetic-instance",
			(args) => {
				calls.push(args);
				return new Promise((done) => {
					resolve = done;
				});
			},
		);
		await act(async () => root.render(form(transport)));
		await fill(dom, "invalid");
		await submit(dom);
		expect(calls).toHaveLength(0);
		await fill(dom, "READER@example.invalid");
		await submit(dom);
		await submit(dom);
		expect(calls).toEqual([
			{ email: "reader@example.invalid", source: "canonical_newsletter" },
		]);
		expect(document.querySelector("button").disabled).toBe(true);
		expect(document.body.textContent).not.toContain("Saved by the handler.");
		await act(async () => resolve({ ok: true, status: "subscribed" }));
		expect(document.body.textContent).toContain("Saved by the handler.");
		expect(document.querySelector("input")).toBe(null);
		expect(document.activeElement).toBe(
			document.querySelector(".cp-library-newsletter-success"),
		);
	}));
test("malformed receipt and rejected writes keep input and show retry, without a false confirmation", async () =>
	inDom(async (root, dom) => {
		for (const result of [
			undefined,
			{ ok: true },
			{ ok: true, status: "pending" },
			new Error("private internal failure"),
		]) {
			const transport = createNewsletterTransport("same-instance", async () => {
				if (result instanceof Error) throw result;
				return result;
			});
			await act(async () => root.render(form(transport)));
			await fill(dom, "reader@example.invalid");
			await submit(dom);
			expect(document.body.textContent).toContain("Could not confirm");
			expect(document.body.textContent).not.toContain("private internal");
			expect(document.body.textContent).not.toContain("Saved by the handler.");
			expect(document.querySelector("input").value).toBe(
				"reader@example.invalid",
			);
			expect(document.querySelector("button").disabled).toBe(false);
			expect(document.activeElement).toBe(document.querySelector("input"));
		}
	}));
test("scope/client replacement, authored changes and unmount discard pending success and reset captured addresses", async () =>
	inDom(async (root, dom) => {
		for (const transition of [
			"new-site",
			"new-client",
			"new-copy",
			"unmount",
		]) {
			let resolve;
			const first = createNewsletterTransport(
				"first-site",
				() =>
					new Promise((done) => {
						resolve = done;
					}),
			);
			await act(async () => root.render(form(first)));
			await fill(dom, "old-reader@example.invalid");
			await submit(dom);
			if (transition === "unmount") await act(async () => root.render(null));
			else if (transition === "new-copy")
				await act(async () => root.render(form(first, "New authored message")));
			else
				await act(async () =>
					root.render(
						form(
							createNewsletterTransport(
								transition === "new-site" ? "second-site" : "first-site",
								async () => {
									throw new Error("Unused");
								},
							),
						),
					),
				);
			await act(async () => resolve({ ok: true, status: "subscribed" }));
			expect(document.body.textContent).not.toContain("Saved by the handler.");
			expect(document.body.textContent).not.toContain("New authored message");
			if (transition !== "unmount") {
				expect(document.querySelector("input").value).toBe("");
				expect(document.querySelector("button").disabled).toBe(false);
			}
		}
	}));
test("two signup instances have distinct labels and independent input state", async () =>
	inDom(async (root, dom) => {
		const transport = createNewsletterTransport("site", async () => {
			throw new Error("unused");
		});
		await act(async () =>
			root.render(
				<NewsletterProvider transport={transport}>
					<NewsletterForm placeholder="First" submitLabel="Join" />
					<NewsletterForm placeholder="Second" submitLabel="Join" />
				</NewsletterProvider>,
			),
		);
		const inputs = [...document.querySelectorAll("input")];
		expect(inputs[0].id === inputs[1].id).toBe(false);
		for (const input of inputs)
			expect(document.querySelector(`label[for="${input.id}"]`)).not.toBe(null);
		await fill(dom, "first@example.invalid");
		expect(inputs[1].value).toBe("");
	}));
