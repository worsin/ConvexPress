import { test, expect } from "bun:test";
import { contentHtml } from "./content.cases";
import banner from "../../../../../../../blocks/blocks/page-banner/render";
import promo from "../../../../../../../blocks/blocks/promo-band/render";
import mentions from "../../../../../../../blocks/blocks/media-mentions/render";
import timeline from "../../../../../../../blocks/blocks/story-timeline/render";
import showcase from "../../../../../../../blocks/blocks/customer-showcase/render";
import wall from "../../../../../../../blocks/core/testimonial-wall/render";
import features from "../../../../../../../blocks/core/feature-tabs/render";
import tabs from "../../../../../../../blocks/blocks/tabbed-content/render";

test("editorial banner/promotion preserve authored context, media, details and real destinations", () => {
	const html = contentHtml(banner, {
		title: "<script>Place</script>",
		breadcrumbLabel: "Journal / Places",
		subtitle: "Quiet mornings",
		mediaId: "clay",
		ctaLabel: "Read",
		ctaUrl: "/journal",
	});
	expect(html).toContain("Journal / Places");
	expect(html).toContain("Quiet mornings");
	expect(html).toContain('src="/clay.png"');
	expect(html).toContain('href="/journal"');
	expect(html).not.toContain("<script>");
	expect(html).not.toContain('aria-label="Breadcrumb"');
	const band = contentHtml(promo, {
		heading: "Studio",
		details: [{ label: "Format", value: "Fictional study" }],
		primaryCtaLabel: "Materials",
		primaryCtaUrl: "/materials",
		secondaryCtaLabel: "Notes",
		secondaryCtaUrl: "/notes",
	});
	expect(band).toContain("<dl");
	expect(band).toContain("<dt>Format</dt>");
	expect(band).toContain("<dd>Fictional study</dd>");
	expect(band).toContain('href="/materials"');
	expect(band).toContain('href="/notes"');
	expect(() => contentHtml(promo, { primaryCtaUrl: "/unlabelled" })).toThrow(
		"accessible label",
	);
});
test("media mentions preserve authored kind/credit without embedding or inventing publication endorsements", () => {
	const html = contentHtml(mentions, {
		heading: "Sample publications",
		items: [
			{
				title: "An imagined conversation",
				source: "Fictional Review",
				byline: "Sample credit",
				summary: "An escaped <script> excerpt",
				kind: "audio",
				mediaId: "paper",
				ctaLabel: "Read transcript",
				ctaUrl: "https://example.invalid/transcript",
			},
		],
	});
	for (const text of [
		"Sample publications",
		"Fictional Review",
		"Sample credit",
		"audio",
		"An imagined conversation",
	])
		expect(html).toContain(text);
	expect(html).toContain('src="/paper.png"');
	expect(html).toContain('href="https://example.invalid/transcript"');
	expect(html).not.toContain("<audio");
	expect(html).not.toContain("<iframe");
	expect(html).not.toContain("<script>");
	expect(() =>
		contentHtml(mentions, {
			items: [{ ctaLabel: "Unsafe", ctaUrl: "javascript:alert(1)" }],
		}),
	).toThrow();
});
test("story timeline preserves arbitrary authored sequence and labels without guessing dates", () => {
	const html = contentHtml(timeline, {
		items: [
			{ label: "Before", title: "A question", body: "First", mediaId: "clay" },
			{
				label: "After",
				title: "A room",
				body: "Second",
				linkLabel: "Continue",
				linkUrl: "/story",
			},
		],
	});
	expect(html).toContain("<ol");
	expect(html.indexOf("Before") < html.indexOf("After")).toBe(true);
	expect(html).not.toContain("datetime=");
	expect(html).toContain('href="/story"');
	expect(html).toContain('src="/clay.png"');
});
test("customer/showcase quotes keep provenance, target media and optional profile destinations", () => {
	const html = contentHtml(showcase, {
		intro: "Fictional examples",
		items: [
			{
				quote: "A sample quote",
				name: "Sample Person",
				role: "Sample contributor",
				company: "Imaginary Studio",
				instrumentType: "Notebook study",
				mediaId: "paper",
				mediaAlt: "Authored paper alternative",
				url: "/project",
			},
		],
	});
	for (const text of [
		"Fictional examples",
		"A sample quote",
		"Sample Person",
		"Sample contributor",
		"Imaginary Studio",
		"Notebook study",
		"Authored paper alternative",
	])
		expect(html).toContain(text);
	expect(html).toContain("<blockquote");
	expect(html).toContain('href="/project"');
	const portrait = contentHtml(wall, {
		items: [
			{
				quote: "A sample",
				name: "Fictional Person",
				context: "Demonstration only",
				portrait: {
					id: "clay",
					alt: "Authored portrait alternative",
					focalPoint: { x: 0.2, y: 0.8 },
				},
			},
		],
	});
	expect(portrait).toContain('src="/clay.png"');
	expect(portrait).toContain("Demonstration only");
	expect(portrait).toContain("Authored portrait alternative");
	expect(portrait).toContain("20% 80%");
	expect(() =>
		contentHtml(wall, {
			items: [{ quote: "A sample", name: "Name", portrait: { id: "unknown" } }],
		}),
	).toThrow();
});
test("both editorial tabs preserve hidden panel content and validate every declared image and rich-text mark", () => {
	const html = contentHtml(features, {
		tabs: [
			{
				label: "One",
				title: "First",
				body: {
					type: "doc",
					content: [
						{
							type: "paragraph",
							content: [
								{ type: "text", text: "Bold", marks: [{ type: "bold" }] },
								{ type: "hardBreak" },
								{
									type: "text",
									text: "Read",
									marks: [{ type: "link", attrs: { href: "/notes" } }],
								},
							],
						},
					],
				},
				media: {
					id: "clay",
					alt: "Authored feature alternative",
					focalPoint: { x: 0.3, y: 0.7 },
				},
			},
			{ label: "Two", title: "Second", media: { id: "paper" } },
		],
	});
	expect(html).toContain("<strong>Bold</strong>");
	expect(html).toContain("Authored feature alternative");
	expect(html).toContain("30% 70%");
	expect(html).toContain("<br");
	expect(html).toContain('href="/notes"');
	expect(html).toContain('src="/clay.png"');
	expect(html).toContain('src="/paper.png"');
	expect((html.match(/role="tabpanel"/g) || []).length).toBe(2);
	expect(html).toContain("hidden=");
	const legacy = contentHtml(tabs, {
		tabs: [
			{
				label: "Overview",
				title: "One",
				body: "**Rich** legacy prose",
				ctaLabel: "Read",
				ctaUrl: "/one",
			},
			{ label: "Details", title: "Two", mediaId: "paper" },
		],
	});
	expect(legacy).toContain("<strong>Rich</strong>");
	expect(legacy).toContain('href="/one"');
	expect(legacy).toContain("Details");
	expect(() =>
		contentHtml(features, {
			tabs: [{ label: "First" }, { label: "Hidden", media: { id: "missing" } }],
		}),
	).toThrow();
});
