import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	BlockRenderError,
	discoverRenderers,
	prepareBlocks,
	type RenderPolicy,
} from "./model";
import heading from "../../../../../../../blocks/core/heading/render";
import section from "../../../../../../../blocks/core/section/render";
import paragraph from "../../../../../../../blocks/core/paragraph/render";
import divider from "../../../../../../../blocks/core/divider/render";
import spacer from "../../../../../../../blocks/core/spacer/render";
import quote from "../../../../../../../blocks/core/quote/render";
import pullquote from "../../../../../../../blocks/core/pullquote/render";
import codeBlock from "../../../../../../../blocks/core/code/render";
import image from "../../../../../../../blocks/core/image/render";
import featureGrid from "../../../../../../../blocks/core/feature-grid/render";
import bentoGrid from "../../../../../../../blocks/core/bento-grid/render";
import statsBand from "../../../../../../../blocks/core/stats-band/render";
import testimonials from "../../../../../../../blocks/core/testimonials/render";
import teamGrid from "../../../../../../../blocks/core/team-grid/render";
import trustBadges from "../../../../../../../blocks/core/trust-badges/render";
import catalog from "../../../../../../../blocks/.generated/catalog.json";
import { publicCanonicalTree } from "../block-data/portable/publicTree";
import { validateCanonicalTree } from "../block-data/portable/generated/instances";
const registry = discoverRenderers({
	"/blocks/core/heading/render.tsx": heading,
	"/blocks/core/section/render.tsx": section,
	"/blocks/core/image/render.tsx": image,
});
const policy: RenderPolicy = {
	enabledPlugins: [],
	capabilities: ["tree.children"],
	disabledBlocks: [],
};
test("badge marks declare contained image fit independently of stylesheet order", () => {
  const registry = discoverRenderers({ "/blocks/core/trust-badges/render.tsx": trustBadges });
  const html = renderToStaticMarkup(prepareBlocks([{ id: "badge", name: "core/trust-badges", version: 1, attrs: { items: [{ label: "Fictional studio mark", media: { id: "mark", alt: "Authored mark", focalPoint: { x: 0.25, y: 0.75 } } }] } }], registry, { ...policy, capabilities: [...policy.capabilities, "reference.targetResolution"] }, { media: { mark: { src: "https://example.test/mark.png", alt: "Original mark", width: 640, height: 320 } } }));
  expect(html).toContain('data-fit="contain"');
  expect(html).toContain('alt="Authored mark"');
  expect(html).toContain('object-position:25% 75%');
});

test("social-proof notes, portraits and member links use the authored values", () => {
  const renderers = discoverRenderers({ "/blocks/core/stats-band/render.tsx": statsBand, "/blocks/core/testimonials/render.tsx": testimonials, "/blocks/core/team-grid/render.tsx": teamGrid });
  const render = (name: string, attrs: unknown) => renderToStaticMarkup(prepareBlocks([{ id: "social", name, version: 2, attrs }], renderers, policy, { media: { portrait: { src: "https://example.test/portrait.png", alt: "Original portrait" } } }));
  expect(render("core/stats-band", { stats: [{ value: "12", label: "Workshops", note: "Illustrative count" }] })).toContain('class="cp-stat-detail">Illustrative count');
  const portrait = render("core/testimonials", { items: [{ quote: "A fictional observation", name: "Rowan", portrait: { id: "portrait", alt: "A fictional collaborator" } }] });
  expect(portrait).toContain('alt="A fictional collaborator"');
  expect(portrait).toContain("cp-testimonial-portrait");
  expect(render("core/testimonials", { items: [{ quote: "An existing observation" }] })).not.toContain("cp-testimonial-portrait");
  const links = render("core/team-grid", { members: [{ name: "Rowan", links: [{ label: "Email", href: "mailto:example@example.test" }, { label: "Portfolio", href: "/work", newTab: true }] }] });
  expect(links).toContain('href="mailto:example@example.test"');
  expect(links).toContain('href="/work"');
  expect(links).toContain("opens in a new tab");
});
test("feature symbols and labeled links render without changing old cards", () => {
  const renderers = discoverRenderers({ "/blocks/core/feature-grid/render.tsx": featureGrid });
  const render = (items: unknown[]) => renderToStaticMarkup(prepareBlocks([{ id: "features", name: "core/feature-grid", version: 2, attrs: { items } }], renderers, policy));
  const old = render([{ title: "Existing feature", description: "Existing description" }]);
  expect(old).not.toContain("cp-icon");
  expect(old).not.toContain("<a ");
  const icons = ["book-open", "arrow-right", "arrow-up-right", "check", "plus", "minus", "star", "heart", "mail", "map-pin", "calendar", "clock", "search"];
  for (const icon of icons) {
    const html = render([{ title: "A supported feature", icon, link: { label: "Explore", href: "/studies", newTab: true } }]);
    expect(html).toContain("cp-icon");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('href="/studies"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("opens in a new tab");
  }
});
test("authored Bento sizes override only their own tile and retain legacy arrangement", () => {
  const renderers = discoverRenderers({ "/blocks/core/bento-grid/render.tsx": bentoGrid });
  const widths = (items: unknown[]) => [...renderToStaticMarkup(prepareBlocks([{ id: "bento", name: "core/bento-grid", version: 2, attrs: { items } }], renderers, policy)).matchAll(/data-wide="(true|false)"/g)].map(match => match[1]);
  expect(widths([{}, {}, {}])).toEqual(["true", "false", "false"]);
  expect(widths([{}, {}, {}, {}])).toEqual(["true", "false", "false", "true"]);
  expect(widths([{ size: "standard" }, { size: "wide" }, { size: "auto" }])).toEqual(["false", "true", "false"]);
  expect(widths([{ size: "standard" }, { size: "wide" }, {}, { size: "standard" }])).toEqual(["false", "true", "false", "false"]);
});
const editorialRegistry = discoverRenderers({
  "/blocks/core/quote/render.tsx": quote,
  "/blocks/core/pullquote/render.tsx": pullquote,
  "/blocks/core/code/render.tsx": codeBlock,
});
test("quotation source is a real link and empty quotations do not invent an empty figure", () => {
  const render = (name: string, version: number, attrs: unknown) => renderToStaticMarkup(prepareBlocks([{ id: "quotation", name, version, attrs }], editorialRegistry, policy));
  expect(render("core/quote", 2, { text: "A careful observation.", cite: "Field notebook", source: "https://example.com/source" })).toContain('href="https://example.com/source"');
  expect(render("core/quote", 2, { text: null })).not.toContain("<blockquote");
  expect(render("core/pullquote", 1, { text: "" })).not.toContain("<blockquote");
});
test("code highlighting preserves literal source and falls back for unknown languages", () => {
  const render = (language: string, source: string) => renderToStaticMarkup(prepareBlocks([{ id: "code", name: "core/code", version: 2, attrs: { language, code: source, filename: "example.ts" } }], editorialRegistry, policy));
  expect(render("typescript", "const value = 42;")).toContain("hljs-keyword");
  const hostile = render("html", '<script>alert("literal")</script><img src=x onerror=alert(1)>');
  expect(hostile).not.toContain("<script>");
  expect(hostile).not.toContain("<img");
  expect(render("unregistered", "unchanged <value> & text")).toContain("unchanged &lt;value&gt; &amp; text");
  expect(render("typescript", "x".repeat(50001))).not.toContain("hljs-");
});
test("authored heading levels use the template typography hierarchy", () => {
  for (const [level, size] of [[1, "display"], [2, "lg"], [3, "md"], [4, "sm"], [5, "sm"], [6, "sm"]] as const) {
    const html = renderToStaticMarkup(prepareBlocks([{ ...instance, attrs: { ...instance.attrs, level } }], registry, policy));
    expect(html).toContain(`data-size="${size}"`);
  }
});
test("empty headings keep an explicit link target without announcing an empty heading", () => {
  for (const text of [null, { type: "doc", content: [] }, { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "  " }, { type: "hardBreak" }] }] }]) {
    const html = renderToStaticMarkup(prepareBlocks([{ ...instance, attrs: { text, level: 3, anchor: "reserved-section" } }], registry, policy));
    expect(/<h[1-6]\b/.test(html)).toBe(false);
    expect(html).toContain('id="reserved-section"');
  }
});
test("server-selected audience blocks render after authoring policy metadata is removed", () => {
  for (const visibility of ["everyone", "signedIn", "signedOut"] as const) {
    const authored = validateCanonicalTree([{ ...instance, visibility }]);
    expect(() => prepareBlocks(authored, registry, policy)).toThrow("instance-policy adapter");
    const display = publicCanonicalTree(authored);
    expect(renderToStaticMarkup(prepareBlocks(display, registry, policy))).toContain("A real heading");
    expect(Object.hasOwn(display[0]!, "visibility")).toBe(false);
    expect(authored[0]!.visibility).toBe(visibility);
  }
});
test("spacers use one layout boundary without a fixed inner gap or empty landmark", () => {
  const renderers = discoverRenderers({"/blocks/core/spacer/render.tsx": spacer});
  for (const spacing of ["none", "compact", "default", "spacious"]) {
    const html = renderToStaticMarkup(prepareBlocks([{id:"space", name:"core/spacer", version:2, attrs:{}, layout:{spacing}, anchor:"breathing-room"}], renderers, policy));
    expect((html.match(/class="cp-p cp-section"/g) ?? [])).toHaveLength(1);
    expect(html).toContain(`data-spacing="${spacing}"`);
    expect(html).toContain('id="breathing-room"');
    expect(html).not.toContain('aria-label="Intentional spacing"');
  }
});
const instance = {
	id: "heading",
	name: "core/heading",
	version: catalog.find((item) => item.name === "core/heading")!.version,
	attrs: {
		text: {
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [{ type: "text", text: "A real heading" }],
				},
			],
		},
		level: 2,
	},
};
function code(input: unknown, selected = registry, permissions = policy) {
	try {
		prepareBlocks(input, selected, permissions);
		return "NO_ERROR";
	} catch (error) {
		if (!(error instanceof BlockRenderError)) throw error;
		return error.code;
	}
}
test("canonical validation, version and disabled policy fail before renderer selection", () => {
	expect(code([{ ...instance, name: "core/made-up" }])).toBe("UNKNOWN_BLOCK");
	expect(code([{ ...instance, version: 999 }])).toBe("VERSION_MISMATCH");
	expect(
		code([{ ...instance, attrs: { text: "safe", className: "escape" } }]),
	).toBe("INVALID_ATTRS");
	expect(
		code([instance], registry, { ...policy, disabledBlocks: [instance.name] }),
	).toBe("DISABLED_BLOCK");
	expect(code([{ ...instance, style: "invented" }])).toBe("NO_ERROR");
  expect(code([{ ...instance, style: 12 }])).toBe("INVALID_STYLE");
	expect(code([{ ...instance, visibility: { role: "admin" } }])).toBe(
		"UNSUPPORTED_INSTANCE_FIELD",
	);
	expect(code([instance, instance])).toBe("INVALID_ID");
});
test("missing renderer, unmet capability, resolver and media remain explicit", () => {
	expect(code([instance], {})).toBe("UNSUPPORTED_RENDERER");
	expect(
		code(
			[{ id: "section", name: "core/section", version: 1, attrs: {} }],
			registry,
			{ ...policy, capabilities: [] },
		),
	).toBe("MISSING_CAPABILITY");
	const dynamic = catalog.find((item) => item.name === "events/upcoming")!;
	expect(
		code(
			[
				{
					id: "events",
					name: dynamic.name,
					version: dynamic.version,
					attrs: dynamic.examples[0],
				},
			],
			registry,
			{
				...policy,
				enabledPlugins: ["events"],
				capabilities: ["events.upcoming"],
			},
		),
	).not.toBe("NO_ERROR");
	expect(
		code(
			[
				{
					id: "image",
					name: "core/image",
					version: 2,
					attrs: { mediaId: "source-media" },
				},
			],
			registry,
			{ ...policy, capabilities: ["reference.targetResolution"] },
		),
	).toBe("UNRESOLVED_MEDIA");
});
test("bounded children require canonical capability and preserve real semantics", () => {
	const parent = {
		id: "section",
		name: "core/section",
		version: 1,
		attrs: {},
		children: [instance],
	};
	const html = renderToStaticMarkup(
		<>{prepareBlocks([parent], registry, policy)}</>,
	);
	expect(html).toContain("A real heading");
	expect(html).toContain("<h2");
	expect(
		code([{ ...instance, children: [{ ...instance, id: "child" }] }]),
	).toBe("CHILDREN_FORBIDDEN");
	expect(
		code(Array.from({ length: 81 }, (_, i) => ({ ...instance, id: `h${i}` }))),
	).toBe("TREE_BUDGET");
	expect(code([{ ...instance, attrs: { text: "x".repeat(600000) } }])).toBe(
		"TREE_BUDGET",
	);
});
test("canonical path ownership prevents a renderer pretending to be another block", () => {
	expect(() =>
		discoverRenderers({ "/blocks/core/image/render.tsx": heading }),
	).toThrow();
	expect(() =>
		discoverRenderers({
			"/blocks/core/heading/render.tsx": heading,
			"/other/core/heading/render.tsx": heading,
		}),
	).toThrow();
});

test("page-wide anchors reject collisions across wrappers, headings and nested footnotes", async () => {
	const footnotes = (
		await import("../../../../../../../blocks/core/footnotes/render")
	).default;
	const all = discoverRenderers({
		"/blocks/core/heading/render.tsx": heading,
		"/blocks/core/section/render.tsx": section,
		"/blocks/core/footnotes/render.tsx": footnotes,
	});
	const note = {
		id: "notes",
		name: "core/footnotes",
		version: 1,
		attrs: { notes: [{ key: "shared-note" }] },
	};
	const anchored = {
		...instance,
		attrs: { ...instance.attrs, anchor: "shared-note" },
	};
	for (const tree of [
		[
			{ ...instance, anchor: "same" },
			{ ...instance, id: "other", anchor: "same" },
		],
		[{ ...instance, anchor: "shared-note" }, note],
		[anchored, note],
		[note, { ...note, id: "other-notes" }],
		[
			{
				id: "parent",
				name: "core/section",
				version: 1,
				attrs: {},
				anchor: "shared-note",
				children: [note],
			},
		],
	])
		expect(code(tree, all)).toBe("DUPLICATE_ANCHOR");
	expect(
		code(
			[
				{
					...instance,
					attrs: { ...instance.attrs, anchor: "not a valid anchor" },
				},
			],
			all,
		),
	).toBe("INVALID_ANCHOR");
	const safe = [
		{
			...instance,
			anchor: "section-heading",
			attrs: { ...instance.attrs, anchor: "specific-heading" },
		},
		note,
	];
	const html = renderToStaticMarkup(<>{prepareBlocks(safe, all, policy)}</>);
	expect(html.match(/id="shared-note"/gu)).toHaveLength(1);
	expect(html).toContain('href="#shared-note"');
	expect(html).toContain('id="specific-heading"');
});

test("media resources expose only validated declared public dependencies", () => {
	let names: string[] = [];
	const inspecting = {
		...registry,
		"core/image": {
			blockName: "core/image" as const,
			View: (props: import("./model").RenderInput) => {
				names = Object.keys(props.resources.media);
				return null;
			},
		},
	};
	const node = {
		id: "image",
		name: "core/image",
		version: 2,
		attrs: { mediaId: "declared" },
	};
	renderToStaticMarkup(
		<>
			{prepareBlocks([node], inspecting, policy, {
				media: {
					declared: { src: "/public.png", alt: "Public view" },
					unreferenced: { src: "/other.png", alt: "Other view" },
				},
			})}
		</>,
	);
	expect(names).toEqual(["declared"]);
	expect(() =>
		prepareBlocks([node], inspecting, policy, {
			media: { declared: { src: "javascript:alert(1)", alt: "Unsafe" } },
		}),
	).toThrow();
});

test("structural views retain disclosure state, tab labels, table headers and every sticky child", async () => {
	const accordion = (
		await import("../../../../../../../blocks/core/accordion/render")
	).default;
	const tabs = (await import("../../../../../../../blocks/core/tabs/render"))
		.default;
	const table = (await import("../../../../../../../blocks/core/table/render"))
		.default;
	const sticky = (
		await import("../../../../../../../blocks/core/sticky-aside/render")
	).default;
	const structural = discoverRenderers({
		"/blocks/core/accordion/render.tsx": accordion,
		"/blocks/core/tabs/render.tsx": tabs,
		"/blocks/core/table/render.tsx": table,
		"/blocks/core/sticky-aside/render.tsx": sticky,
		"/blocks/core/heading/render.tsx": heading,
	});
	const markup = (node: unknown) =>
		renderToStaticMarkup(<>{prepareBlocks([node], structural, policy)}</>);
	const disclosure = markup({
		id: "details",
		name: "core/accordion",
		version: 2,
		attrs: {
			defaultOpen: 1,
			items: [
				{ title: "First", body: "One" },
				{ title: "Second", body: "Two" },
			],
		},
	});
	expect(disclosure.match(/<details[^>]* open=""/gu)?.length).toBe(1);
	expect(disclosure).toContain("Second");
	const outOfRange = markup({
		id: "details",
		name: "core/accordion",
		version: 2,
		attrs: { defaultOpen: 1.5, items: [{ title: "First", body: "One" }] },
	});
	expect(outOfRange.includes('open=""')).toBe(false);
	const tabbed = markup({
		id: "tabs",
		name: "core/tabs",
		version: 2,
		attrs: {
			tabs: [
				{ label: "", body: "A" },
				{ label: "Second", body: "B" },
			],
		},
	});
	expect(tabbed).toContain("Section 1");
	expect(tabbed).toContain('role="tablist"');
	expect(tabbed).toContain('aria-selected="true"');
	const tabular = markup({
		id: "table",
		name: "core/table",
		version: 1,
		attrs: {
			columns: ["Name", "Notes"],
			rows: [["Studio", "Quiet"]],
			caption: "Workshop details",
		},
	});
	expect(tabular).toContain('<th scope="col">Name</th>');
	expect(tabular).toContain("<caption>Workshop details</caption>");
	expect(tabular).toContain('tabindex="0"');
	const nested = markup({
		id: "sticky",
		name: "core/sticky-aside",
		version: 1,
		attrs: {},
		children: [0, 1, 2].map((i) => ({ ...instance, id: `child-${i}` })),
	});
	expect(nested.match(/A real heading/gu)?.length).toBe(3);
	expect(nested).toContain("<aside");
});

test("consecutive paragraph blocks use article flow while explicit section spacing survives", () => {
  const withParagraph = discoverRenderers({"/blocks/core/paragraph/render.tsx": paragraph, "/blocks/core/section/render.tsx": section});
  const node = (index: number) => ({id: `prose-${index}`, name: "core/paragraph", version: 2, attrs: {body: {type: "doc", content: [{type: "paragraph", content: [{type: "text", text: `Paragraph ${index}`, marks: [{type: "bold"}]}]}]}}});
  const html = renderToStaticMarkup(prepareBlocks([node(1), node(2), node(3), {...node(4), layout: {spacing: "spacious"}}, {id: "intentional-section", name: "core/section", version: 1, attrs: {}}], withParagraph, policy));
  expect((html.match(/data-prose-flow="true"/g) ?? []).length).toBe(3);
  expect((html.match(/data-spacing="none"/g) ?? []).length).toBe(3);
  expect(html.includes('data-spacing="spacious"')).toBe(true);
  expect(html.includes('data-spacing="default"')).toBe(true);
  expect(html.includes('<strong>Paragraph 1</strong>')).toBe(true);
});


test("long paragraphs render complete literal copy and safe inline semantics", () => {
  const renderers=discoverRenderers({"/blocks/core/paragraph/render.tsx":paragraph});
  const text="Copy worth preserving. ".repeat(250)+"<script>literal text</script>";
  const body={type:"doc",content:[{type:"paragraph",content:[{type:"text",text,marks:[{type:"italic"}]},{type:"hardBreak"},{type:"text",text:"Source",marks:[{type:"link",attrs:{href:"https://example.org/source",target:"_blank"}}]}]}]};
  const html=renderToStaticMarkup(prepareBlocks([{id:"long-prose",name:"core/paragraph",version:2,attrs:{body}}],renderers,policy));
  expect(html).toContain("Copy worth preserving. ".repeat(250));
  expect(html).toContain("&lt;script&gt;literal text&lt;/script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).toContain("<em>");expect(html).toContain("<br");
  expect(html).toContain('href="https://example.org/source"');
  expect(html).toContain('rel="noopener noreferrer"');
});

test("original utility treatments preserve closed visual choices and reject arbitrary values", () => {
  for (const [name, field, values] of [
    ["core/spacer", "size", ["small", "medium", "large", "xlarge"]],
    ["core/divider", "variant", ["default", "section", "subtle"]],
  ] as const) {
    const renderer = name === "core/spacer" ? spacer : divider;
    const renderers = discoverRenderers({[`/blocks/${name}/render.tsx`]: renderer});
    for (const pack of ["core", "journal", "depot", "aster-house"]) {
      for (const value of values) {
        const node = {id:"original",name,version:2,attrs:{},layout:{spacing:"none",width:"full"},treatment:{name:"original",values:{[field]:value}}};
        const html = renderToStaticMarkup(prepareBlocks([node],renderers,policy,{media:{}},undefined,pack));
        expect(html).toContain(`data-${field}="${value}"`);
        expect(html).toContain('data-spacing="none"');
        expect(() => prepareBlocks([{...node,treatment:{name:"original",values:{[field]:"arbitrary-css"}}}],renderers,policy,{media:{}},undefined,pack)).toThrow();
      }
    }
  }
});
