// @ts-ignore The local bun:test shim omits the supported afterAll lifecycle hook.
import { expect, test, afterAll } from "bun:test";
import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import { act } from "react";
import { loadStaged } from "./test-harness";
const loaded = await loadStaged("./SchemaBlockForm.tsx");
afterAll(loaded.cleanup);
const { SchemaBlockForm } = loaded.module;
const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))(
	"jsdom",
);
const scope = { websiteKey: "aster", instanceKey: "staging" };
async function domTest(
	run: (
		host: HTMLElement,
		render: (props: any) => Promise<void>,
		win: any,
	) => Promise<void>,
) {
	const dom = new JSDOM(
		'<!doctype html><html><body><div id="app"></div></body></html>',
		{ url: "https://editor.example.test" },
	);
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
	] as const;
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
	const { createRoot } = await import("react-dom/client");
	const host = document.getElementById("app")!;
	const root = createRoot(host);
	try {
		await run(
			host,
			async (props) => {
				await act(async () =>
					root.render(<SchemaBlockForm blockId="test-block" {...props} />),
				);
			},
			dom.window,
		);
	} finally {
		await act(async () => root.unmount());
		dom.window.close();
		for (const name of names) {
			const descriptor = old.get(name);
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else delete (globalThis as any)[name];
		}
	}
}
const button = (host: HTMLElement, text: string) =>
	Array.from(host.querySelectorAll("button")).find(
		(item) => item.textContent === text,
	)!;
async function change(
	win: any,
	input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
	value: string,
) {
	const prototype =
		input.tagName === "TEXTAREA"
			? win.HTMLTextAreaElement.prototype
			: input.tagName === "SELECT"
				? win.HTMLSelectElement.prototype
				: win.HTMLInputElement.prototype;
	await act(async () => {
		Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
			input,
			value,
		);
		input.dispatchEvent(
			new win.Event(input.tagName === "SELECT" ? "change" : "input", {
				bubbles: true,
			}),
		);
	});
}
test("every canonical example opens and submits through the actual generated form without losing authored fields", async () =>
	domTest(async (host, render) => {
		// Discover the source contracts independently of generated editor metadata.
		const blockRoot = new URL("../../../../../../../blocks/", import.meta.url);
		let checked = 0;
		for (const namespace of readdirSync(blockRoot, { withFileTypes: true })) {
			if (!namespace.isDirectory() || namespace.name.startsWith(".")) continue;
			const directory = new URL(`${namespace.name}/`, blockRoot);
			for (const block of readdirSync(directory, { withFileTypes: true })) {
				if (!block.isDirectory()) continue;
				const spec = JSON.parse(
					readFileSync(new URL(`${block.name}/block.json`, directory), "utf8"),
				);
				for (const [index, value] of spec.examples.entries()) {
					const writes: any[] = [];
					const original = structuredClone(value);
					try {
						await render({
							blockId: `${spec.name}-${index}`,
							name: spec.name,
							version: spec.version,
							value,
							revision: "r1",
							scope,
							onCommit: async (request: any) => {
								writes.push(request);
							},
						});
						expect(
							host.querySelector('[role="alert"]')?.textContent ?? "",
						).toBe("");
						for (const field of spec.fields)
							expect(
								host.querySelector(`[data-field-path="${field.id}"]`),
							).not.toBeNull();
						const save = button(host, "Save content");
						expect(save).toBeDefined();
						expect(save.disabled).toBe(false);
						await act(async () => save.click());
						expect(writes.length).toBe(1);
						expect(writes[0]).toMatchObject({
							name: spec.name,
							version: spec.version,
							attrs: original,
							expectedRevision: "r1",
							scope,
						});
						expect(value).toEqual(original);
						checked++;
					} catch (error) {
						throw new Error(`${spec.name} example ${index + 1}`, {
							cause: error,
						});
					}
				}
			}
		}
		expect(checked).toBeGreaterThan(0);
	}));
test("actual form enforces generated numeric and row constraints while preserving typed select values", async () =>
	domTest(async (host, render, win) => {
		const writes: any[] = [];
		const previews: any[] = [];
		const props = {
			onDraftChange: (value: any) => previews.push(value),
			name: "events/upcoming",
			version: 1,
			value: { count: 3 },
			revision: "r1",
			scope,
			onCommit: async (value: any) => {
				writes.push(value);
			},
		};
		await render(props);
		const input = host.querySelector(
			'input[type="number"]',
		)! as HTMLInputElement;
		expect(
			document.querySelector(`label[for="${input.id}"]`)?.textContent,
		).toBe("Count");
		await change(win, input, "");
		expect(button(host, "Save content").disabled).toBe(true);
		expect(previews.at(-1).validation.ok).toBe(false);
		expect(previews.at(-1).draft.count).toBe("");
		await change(win, input, "4");
		await act(async () => button(host, "Save content").click());
		expect(writes[0].attrs.count).toBe(4);
		expect(writes[0].expectedRevision).toBe("r1");
		expect(writes[0].scope).toEqual(scope);
		await render({ ...props, revision: "r2", value: { count: 8 } });
		expect(host.textContent).toContain("Your draft is retained");
		expect(button(host, "Save content").disabled).toBe(true);
		expect(
			(host.querySelector('input[type="number"]') as HTMLInputElement).value,
		).toBe("4");
		await act(async () => button(host, "Load latest saved content").click());
		expect(
			(host.querySelector('input[type="number"]') as HTMLInputElement).value,
		).toBe("8");
	}));
test("richtext text edits retain marks and unsafe link drafts stay editable but cannot save", async () =>
	domTest(async (host, render, win) => {
		const writes: any[] = [];
		const doc = {
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{
							type: "text",
							text: "Notice",
							marks: [
								{ type: "bold" },
								{ type: "underline" },
								{ type: "link", attrs: { href: "/notes", target: "_blank" } },
							],
						},
						{ type: "hardBreak" },
					],
				},
			],
		};
		await render({
			name: "core/paragraph",
			version: 2,
			value: { body: doc },
			revision: "r1",
			scope,
			onCommit: async (value: any) => writes.push(value),
		});
		const segment = host.querySelector("textarea")!;
		await change(win, segment, "Look closely");
		const link = host.querySelector(
			'input:not([type="checkbox"])',
		)! as HTMLInputElement;
		await change(win, link, "javascript:alert(1)");
		expect(button(host, "Save content").disabled).toBe(true);
		expect(host.querySelector("textarea")).not.toBeNull();
		await change(win, link, "/field-notes");
		await act(async () => button(host, "Save content").click());
		const nodes = writes[0].attrs.body.content[0].content;
		expect(nodes[0].text).toBe("Look closely");
		expect(nodes[0].marks).toEqual([
			{ type: "bold" },
			{ type: "underline" },
			{ type: "link", attrs: { href: "/field-notes", target: "_blank" } },
		]);
		expect(nodes[1]).toEqual({ type: "hardBreak" });
	}));
test("code source preserves newlines when opened, edited and committed through generated controls", async () =>
	domTest(async (host, render, win) => {
		const writes: any[] = [];
		const original = "// An actual line comment\nexport const note = 'hello';";
		await render({
			name: "core/code",
			version: 2,
			value: { language: "typescript", code: original, filename: "note.ts" },
			revision: "r1",
			scope,
			onCommit: async (value: any) => writes.push(value),
		});
		const label = Array.from(host.querySelectorAll("label")).find(
			(item) => item.textContent === "Code",
		)!;
		const source = host.querySelector(`#${label.htmlFor}`) as HTMLTextAreaElement;
		expect(source.value).toBe(original);
		expect(source.tagName).toBe("TEXTAREA");
		const edited = `${original}\nconsole.log(note);\n`;
		await change(win, source, edited);
		await act(async () => button(host, "Save content").click());
		expect(writes[0].attrs.code).toBe(edited);
		expect(writes[0].attrs.language).toBe("typescript");
		expect(writes[0].attrs.filename).toBe("note.ts");
	}));
test("short prose fields allow authoring new line breaks before any multiline value exists", async () =>
  domTest(async (host, render, win) => {
    const writes: any[] = [];
    await render({ name: "blocks/page-banner", version: 1, value: { subtitle: "" }, revision: "r1", scope, onCommit: async (value: any) => writes.push(value) });
    const label = Array.from(host.querySelectorAll("label")).find(item => item.textContent === "Subtitle")!;
    const source = host.querySelector(`#${label.htmlFor}`) as HTMLTextAreaElement;
    expect(source.tagName).toBe("TEXTAREA");
    await change(win, source, "First line.\nSecond line.");
    await act(async () => button(host, "Save content").click());
    expect(writes[0].attrs.subtitle).toBe("First line.\nSecond line.");
  }));
test("unavailable and stale cross-environment resource pickers cannot introduce IDs", async () =>
	domTest(async (host, render) => {
		const writes: any[] = [];
		let resolve: (value: any) => void = () => {};
		const props = {
			name: "core/image",
			version: 2,
			value: {},
			revision: "r1",
			scope,
			onCommit: async (value: any) => writes.push(value),
		};
		await render(props);
		expect(button(host, "Choose Media Id").disabled).toBe(true);
		expect(host.textContent).toContain(
			"A picker for this environment is not connected",
		);
		await render({
			...props,
			pickResource: () =>
				new Promise((done) => {
					resolve = done;
				}),
		});
		await act(async () => button(host, "Choose Media Id").click());
		await act(async () =>
			resolve({
				scope: { ...scope, instanceKey: "live" },
				value: "foreign-media",
			}),
		);
		expect(host.textContent).toContain("could not be verified");
		expect(writes).toHaveLength(0);
		await act(async () => button(host, "Choose Media Id").click());
		await render({ ...props, scope: { ...scope, instanceKey: "live" } });
		await act(async () => resolve({ scope, value: "stale-media" }));
		expect(host.textContent).not.toContain("A resource is selected");
	}));
test("nested repeaters edit and reorder actual content; numeric selects stay numbers", async () =>
	domTest(async (host, render, win) => {
		const writes: any[] = [];
		await render({
			name: "business/menu",
			version: 1,
			value: { sections: [{ title: "First", items: [{ name: "Tea" }] }] },
			revision: "r1",
			scope,
			onCommit: async (value: any) => writes.push(value),
		});
		await act(async () => button(host, "Add Sections").click());
		expect(button(host, "Save content").disabled).toBe(true);
		const newTitle = host.querySelector(
			'[data-field-path="sections.1.title"]',
		)!;
		await change(win, newTitle.querySelector("select")!, "value");
		await change(win, newTitle.querySelector("input")!, "Second");
		await act(async () =>
			host
				.querySelector<HTMLButtonElement>('[aria-label="Move Sections 2 up"]')!
				.click(),
		);
		await act(async () => button(host, "Save content").click());
		expect(
			writes[0].attrs.sections.map((section: any) => section.title),
		).toEqual(["Second", "First"]);
		expect(writes[0].attrs.sections[1].items[0].name).toBe("Tea");
		await render({
			name: "core/heading",
			version: 2,
			value: { level: 2, text: null },
			revision: "h1",
			scope,
			onCommit: async (value: any) => writes.push(value),
		});
		const level = host.querySelector(
			'[data-field-path="level"] select:not([aria-label])',
		)! as HTMLSelectElement;
		await change(win, level, "5");
		await act(async () => button(host, "Save content").click());
		expect(writes[1].attrs.level).toBe(6);
		expect(writes[1].attrs.text).toBeNull();
	}));

test("resetting an optional Post Grid reference removes the filter without creating an invalid empty ID", () =>
	domTest(async (host, render) => {
		const writes: any[] = [];
		await render({
			name: "core/post-grid",
			version: 1,
			value: {
				query: { author: "author-id", category: "category-id" },
				limit: 1,
			},
			revision: "grid-1",
			scope,
			onCommit: async (value: any) => writes.push(value),
		});
		await act(async () => button(host, "Reset Author").click());
		expect(
			(
				host.querySelector(
					'[aria-label="Author value mode"]',
				) as HTMLSelectElement
			).value,
		).toBe("unset");
		expect(button(host, "Save content").disabled).toBe(false);
		await act(async () => button(host, "Save content").click());
		expect(writes[0].attrs.query).toEqual({ category: "category-id" });
		expect(writes[0].attrs.limit).toBe(1);
		expect(host.textContent).not.toContain("Too small");
	}));

test("resetting an optional Wishlist link removes its invalid draft and restores declared heading defaults", () =>
	domTest(async (host, render) => {
		const writes: any[] = [];
		await render({
			name: "commerce/wishlist",
			version: 1,
			value: {
				heading: "My picks",
				browseLink: { label: "Browse", href: "javascript:alert(1)" },
			},
			revision: "wishlist-1",
			scope,
			onCommit: async (value: any) => writes.push(value),
		});
		expect(button(host, "Save content").disabled).toBe(true);
		await act(async () => button(host, "Reset Browse Link").click());
		expect(
			(
				host.querySelector(
					'[aria-label="Browse Link value mode"]',
				) as HTMLSelectElement
			).value,
		).toBe("unset");
		expect(button(host, "Save content").disabled).toBe(false);
		await act(async () => button(host, "Reset Heading").click());
		await act(async () => button(host, "Save content").click());
		expect(Object.hasOwn(writes[0].attrs, "browseLink")).toBe(false);
		expect(writes[0].attrs.heading).toBe("Your wishlist");
	}));

test("reusable source selection emits only the complete new source and revision", async () =>
	domTest(async (host, render) => {
		const previews: any[] = [];
		await render({
			name: "core/synced",
			version: 1,
			value: { syncedBlock: "old", revisionPolicy: "pinned", revision: 7 },
			revision: "r1",
			scope,
			onCommit: async () => {},
			onDraftChange: (value: any) => previews.push(value),
			pickResource: async () => ({
				scope,
				value: "new",
				syncedRevision: { revisionPolicy: "pinned", revision: 2 },
			}),
		});
		const choose = [...host.querySelectorAll("button")].find((item) =>
			item.textContent?.startsWith("Choose "),
		)!;
		expect(choose).toBeDefined();
		await act(async () => choose.click());
		const edits = previews.filter((value) => value.draft.syncedBlock === "new");
		expect(edits.length).toBeGreaterThan(0);
		for (const value of edits)
			expect(value.draft).toEqual({
				syncedBlock: "new",
				revisionPolicy: "pinned",
				revision: 2,
			});
	}));

for (const specimen of [
	{
		name: "core/comparison-table",
		version: 2,
		header: "Columns",
		last: 3,
		value: {
			columns: ["Feature", "Digital", "Paper"],
			rows: [{ label: "Find", cells: ["Search", "Page numbers"] }],
		},
		expected: {
			columns: ["Feature", "Paper", "Digital"],
			rows: [{ label: "Find", cells: ["Page numbers", "Search"] }],
		},
	},
	{
		name: "core/table",
		version: 1,
		header: "Columns",
		last: 2,
		value: {
			columns: ["Practice", "Bring"],
			rows: [["Observation", "Notebook"]],
		},
		expected: {
			columns: ["Bring", "Practice"],
			rows: [["Notebook", "Observation"]],
		},
	},
	{
		name: "core/pricing-table",
		version: 1,
		header: "Plans",
		last: 2,
		value: {
			plans: [
				{ name: "Small", priceLabel: "$12" },
				{ name: "Large", priceLabel: "$24" },
			],
			rows: [{ label: "Notebooks", values: ["One", "Three"] }],
		},
		expected: {
			plans: [
				{ name: "Large", priceLabel: "$24" },
				{ name: "Small", priceLabel: "$12" },
			],
			rows: [{ label: "Notebooks", values: ["Three", "One"] }],
		},
	},
])
	test(`${specimen.name} column controls keep header and every cell associated`, async () =>
		domTest(async (host, render) => {
			const writes: { attrs: Record<string, unknown> }[] = [];
			await render({
				name: specimen.name,
				version: specimen.version,
				value: specimen.value,
				revision: "matrix-1",
				scope,
				onCommit: async (value: { attrs: Record<string, unknown> }) => {
					writes.push(value);
				},
			});
			await act(async () =>
				host
					.querySelector<HTMLButtonElement>(
						`[aria-label="Move ${specimen.header} ${specimen.last} up"]`,
					)!
					.click(),
			);
			await act(async () => button(host, "Save content").click());
			expect(writes[0].attrs).toMatchObject(specimen.expected);
			if (specimen.name === "core/comparison-table") {
				expect(
					host.querySelector<HTMLButtonElement>(
						'[aria-label="Move Columns 1 down"]',
					)!.disabled,
				).toBe(true);
				expect(
					host.querySelector<HTMLButtonElement>(
						'[aria-label="Remove Columns 1"]',
					)!.disabled,
				).toBe(true);
			}
			await act(async () =>
				host
					.querySelector<HTMLButtonElement>(
						`[aria-label="Remove ${specimen.header} ${specimen.last}"]`,
					)!
					.click(),
			);
			expect(button(host, "Save content").disabled).toBe(false);
			await act(async () => button(host, "Save content").click());
			const remaining =
				specimen.name === "core/table"
					? [["Notebook"]]
					: specimen.name === "core/comparison-table"
						? [{ label: "Find", cells: ["Page numbers"] }]
						: [{ label: "Notebooks", values: ["Three"] }];
			expect(writes[1].attrs.rows).toEqual(remaining);
		}));

 test("unsupported stored icons stay visible until an explicit supported replacement", async () =>
  domTest(async (host, render, win) => {
    const writes: any[] = [];
    await render({ name: "core/trust-badges", version: 1, value: { items: [{ icon: "old-provider-mark", label: "Historical label" }] }, revision: "r1", scope, onCommit: async (value: any) => { writes.push(value); } });
    const choice = Array.from(host.querySelectorAll("select")).find(select => Array.from(select.options).some(option => option.textContent === "Unsupported: old-provider-mark"))!;
    expect(choice.selectedOptions[0].textContent).toBe("Unsupported: old-provider-mark");
    expect(button(host, "Save content").disabled).toBe(true);
    const supported = Array.from(choice.options).find(option => option.textContent === "heart")!;
    await change(win, choice, supported.value);
    expect(Array.from(choice.options).some(option => option.textContent?.startsWith("Unsupported:"))).toBe(false);
    expect(button(host, "Save content").disabled).toBe(false);
    await act(async () => button(host, "Save content").click());
    expect(writes[0].attrs.items).toEqual([{ icon: "heart", label: "Historical label" }]);
  }));
