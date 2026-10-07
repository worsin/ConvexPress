import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	prepareBlocks,
	type RendererDefinition,
	type BlockInstance,
} from "./model";
import catalog from "../../../../../../../blocks/.generated/catalog.json";
import announcement from "../../../../../../../blocks/core/announcement-bar/render";
import carousel from "../../../../../../../blocks/core/carousel/render";
import search from "../../../../../../../blocks/core/search-box/render";
import productSearch from "../../../../../../../blocks/commerce/search-band/render";
import share from "../../../../../../../blocks/blocks/social-share/render";
import htmlBlock from "../../../../../../../blocks/core/custom-html/render";
import badges from "../../../../../../../blocks/core/trust-badges/render";
import heading from "../../../../../../../blocks/core/heading/render";
import group from "../../../../../../../blocks/core/group/render";
import mediaText from "../../../../../../../blocks/core/media-text/render";
import heroSplit from "../../../../../../../blocks/core/hero-split/render";
import imageBlock from "../../../../../../../blocks/core/image/render";
import { carouselSpecimenChildren } from "../../../../block-demo/utility-specimens";
import { announcementWindow } from "./announcement";
import { shareDestination, publicShareUrl } from "./social-share";
import { sanitizeBlockHtml } from "./safe-html";
import { shopSearchSchema, queryArgs } from "../../../lib/commerce/shopSearch";
export function utilityTree(
	view: RendererDefinition,
	attrs: unknown,
	children?: BlockInstance[],
) {
	const spec = catalog.find((item) => item.name === view.blockName)!;
	return prepareBlocks(
		[
			{
				id: "utility-fixture",
				name: view.blockName,
				version: spec.version,
				attrs,
				children,
			},
		],
		{
			[view.blockName]: view,
			"core/heading": heading,
			"core/group": group,
			"core/media-text": mediaText,
		},
		{
			enabledPlugins: [],
			capabilities: [
				"tree.children",
				"reference.targetResolution",
				"html.sanitize",
			],
			disabledBlocks: [],
		},
		{
			media: {
				"demo-workshop": {
					src: "/workshop.png",
					alt: "Workshop",
					mimeType: "image/png",
				},
				"demo-image-field-notebook": {
					src: "/notebook.png",
					alt: "Notebook",
					mimeType: "image/png",
				},
				photo: {
					src: "/photo.png",
					alt: "Public image",
					mimeType: "image/png",
				},
			},
		},
	);
}
const html = (
	view: RendererDefinition,
	attrs: unknown,
	children?: BlockInstance[],
) => renderToStaticMarkup(utilityTree(view, attrs, children));
export const slide = (id: string, text: string): BlockInstance => ({
	id,
	name: "core/heading",
	version: 2,
	attrs: {
		text: {
			type: "doc",
			content: [{ type: "paragraph", content: [{ type: "text", text }] }],
		},
	},
});
test("announcement schedule has exact boundaries, stable scheduled SSR and visible unscheduled copy", () => {
	expect(announcementWindow(100, 200, 99)).toBe(false);
	expect(announcementWindow(100, 200, 100)).toBe(true);
	expect(announcementWindow(100, 200, 200)).toBe(false);
	expect(announcementWindow(null, null, 0)).toBe(true);
	expect(html(announcement, { text: "Visible", dismissible: false })).toContain(
		"Visible",
	);
	expect(
		html(announcement, {
			text: "Future private copy",
			schedule: { startsAt: "2040-01-01T00:00:00Z" },
		}),
	).not.toContain("Future private copy");
	expect(() =>
		html(announcement, {
			schedule: {
				startsAt: "2040-01-02T00:00:00Z",
				endsAt: "2040-01-01T00:00:00Z",
			},
		}),
	).toThrow("end must be after");
});
test("carousel uses prepared child blocks and truthful zero/single-slide controls without autoplay", () => {
	const empty = html(carousel, {});
	expect(empty).toContain("Add slides");
	expect(empty).not.toContain("Next slide");
	const single = html(carousel, {}, [slide("one", "Only slide")]);
	expect(single).toContain("Only slide");
	expect(single).not.toContain("Next slide");
	const pair = html(carousel, { accessibleLabel: "Sample stories" }, [
		slide("one", "First"),
		slide("two", "Second"),
	]);
	expect(pair).toContain("First");
	expect(pair).toContain("Second");
	expect(pair).toContain('aria-roledescription="carousel"');
	expect(pair).toContain('hidden=""');
	expect(pair).toContain("Next slide");
});
test("search forms emit actual site and commerce route parameters and preserve encoded suggestions", () => {
	for (const [scope, type] of [
		["posts", "post"],
		["pages", "page"],
		["products", "product"],
	]) {
		const markup = html(search, { scope });
		expect(markup).toContain('action="/search"');
		expect(markup).toContain('name="q"');
		expect(markup).toContain(`name="type" value="${type}"`);
	}
	expect(html(search, { scope: "all" })).not.toContain('name="type"');
	const markup = html(productSearch, { suggestions: ["Clay & paper"] });
	expect(markup).toContain('action="/products"');
	expect(markup).toContain("/products?q=Clay%20%26%20paper");
	const parsed = shopSearchSchema.parse(
		Object.fromEntries(new URLSearchParams("q=Clay+%26+paper")),
	);
	expect(queryArgs(parsed, 12).q).toBe("Clay & paper");
});
test("social share encodes actual destinations, rejects unsafe URLs and leaves current-page SSR actions disabled", () => {
	const url = "https://example.invalid/story?q=clay&view=1#notes";
	expect(shareDestination("x", url)).toBe(
		`https://x.com/intent/tweet?url=${encodeURIComponent(url)}`,
	);
	expect(shareDestination("email", url)).toBe(
		`mailto:?body=${encodeURIComponent(url)}`,
	);
	for (const bad of [
		"javascript:alert(1)",
		"https://user:pass@example.invalid",
		"not a URL",
	])
		expect(() => publicShareUrl(bad)).toThrow();
	const current = html(share, {
		shareUrlMode: "currentPage",
		networks: ["copy", "x"],
	});
	expect(current).toContain('disabled=""');
	expect(current).not.toContain("intent/tweet");
	const custom = html(share, {
		shareUrlMode: "custom",
		customUrl: url,
		networks: ["linkedin"],
	});
	expect(custom).toContain("noopener noreferrer");
	expect(custom).toContain("sharing/share-offsite");
});
test("custom HTML requires sanitizer capability and cannot emit raw page IDs or active content", () => {
	const input =
		'<h2 id="collision" class="escape">A note</h2><script>alert(1)</script><form><input name="password"><button>Submit</button></form><img src="https://example.invalid/pixel"><a id="also" href="javascript:alert(1)" onclick="alert(1)">Unsafe</a><a href="/notes" target="_blank">Read</a>';
	const safe = sanitizeBlockHtml(input);
	for (const unwanted of [
		"id=",
		"class=",
		"<script",
		"<form",
		"<input",
		"<button",
		"<img",
		"onclick",
		"javascript:",
	])
		expect(safe).not.toContain(unwanted);
	expect(safe).toContain("A note");
	expect(safe).toContain('href="/notes"');
	expect(safe).toContain('rel="noopener noreferrer"');
	expect(html(htmlBlock, { html: input })).toContain(safe);
	expect(() =>
		prepareBlocks(
			[
				{
					id: "html",
					name: "core/custom-html",
					version: 1,
					attrs: { html: "<p>Hi</p>" },
				},
			],
			{ "core/custom-html": htmlBlock },
			{ enabledPlugins: [], capabilities: [], disabledBlocks: [] },
		),
	).toThrow();
});
test("trust badges render supported real icons/media and refuse unknown glyphs without inventing claims", () => {
	const markup = html(badges, {
		items: [
			{ icon: "book-open", label: "Original notes" },
			{
				media: { id: "photo", alt: "Authored badge alternative" },
				label: "Sample material",
			},
		],
	});
	expect(markup).toContain("<svg");
	expect(markup).toContain("Original notes");
	expect(markup).toContain("Authored badge alternative");
	expect(markup).toContain('src="/photo.png"');
	expect(() =>
		html(badges, { items: [{ icon: "unknown-not-a-glyph", label: "Sample" }] }),
	).toThrow("does not provide");
});
test("carousel demo is ordinary nested canonical composition with two distinct resolved editorial panels", () => {
	const children = carouselSpecimenChildren("sample-carousel");
	expect(children.length).toBe(2);
	expect(children.map((child) => child.name)).toEqual([
		"core/group",
		"core/group",
	]);
	const markup = html(
		carousel,
		{ accessibleLabel: "Material studies" },
		children,
	);
	for (const content of [
		"Clay &amp; light",
		"Room to roam",
		"01 / In the studio",
		"02 / Out in the field",
		'src="/workshop.png"',
		'src="/notebook.png"',
		'href="#composition"',
		'href="#studies"',
	])
		expect(markup).toContain(content);
	expect(markup.match(/aria-roledescription="slide"/g)?.length).toBe(2);
	expect(markup.match(/<img /g)?.length).toBe(2);
});
test("absent image media preserves authored caption and copy without reserving an empty split column", () => {
	const caption = html(imageBlock, {
		mediaId: "",
		caption: "An authored note",
		alt: "Missing asset",
	});
	expect(caption).toContain("An authored note");
	expect(caption).not.toContain("<img");
	for (const [renderer, attrs] of [
		[
			mediaText,
			{
				heading: "Authored copy",
				body: "Body remains",
				mediaId: "",
				ctaLabel: "Read",
				ctaUrl: "/read",
			},
		],
		[
			heroSplit,
			{
				title: "Authored copy",
				body: "Body remains",
				mediaId: "",
				primaryCtaLabel: "Read",
				primaryCtaUrl: "/read",
			},
		],
	] as const) {
		const markup = html(renderer, attrs);
		expect(markup).toContain("Authored copy");
		expect(markup).toContain("Body remains");
		expect(markup).toContain('href="/read"');
		expect(markup).not.toContain("<img");
		expect(markup).not.toContain("cp-split");
		expect(html(renderer, { ...attrs, mediaId: "photo" })).toContain(
			"cp-split",
		);
	}
});
