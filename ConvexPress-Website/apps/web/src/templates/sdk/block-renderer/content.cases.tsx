import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	prepareBlocks,
	type RendererDefinition,
	type RenderResources,
} from "./model";
import catalog from "../../../../../../../blocks/.generated/catalog.json";
import roadmap from "../../../../../../../blocks/core/roadmap-timeline/render";
import bento from "../../../../../../../blocks/core/bento-grid/render";
import team from "../../../../../../../blocks/core/team-grid/render";
import alternating from "../../../../../../../blocks/core/feature-list-alternating/render";
import hero from "../../../../../../../blocks/core/hero/render";
import footnotes from "../../../../../../../blocks/core/footnotes/render";
import pricing from "../../../../../../../blocks/core/pricing-table/render";
import comparison from "../../../../../../../blocks/core/comparison-table/render";
const resources: RenderResources = {
	media: {
		clay: { src: "/clay.png", alt: "A ceramic sample", mimeType: "image/png" },
		paper: {
			src: "/paper.png",
			alt: "A sheet of paper",
			mimeType: "image/png",
		},
	},
};
export function contentHtml(
	view: RendererDefinition,
	attrs: unknown,
	media = resources,
) {
	const spec = catalog.find((entry) => entry.name === view.blockName);
	if (!spec) throw new Error("Missing canonical spec");
	return renderToStaticMarkup(
		prepareBlocks(
			[
				{
					id: "content-specimen",
					name: view.blockName,
					version: spec.version,
					attrs,
				},
			],
			{ [view.blockName]: view },
			{
				enabledPlugins: [],
				capabilities: ["reference.targetResolution"],
				disabledBlocks: [],
			},
			media,
		),
	);
}
test("roadmap keeps authored order, status labels and escaped content without inferring dates", () => {
	const html = contentHtml(roadmap, {
		heading: "Our workshop",
		items: [
			{ label: "Earlier", title: "<script>opening</script>", status: "done" },
			{ label: "Now", title: "Open studio", status: "in_progress" },
			{ label: "Next", title: "A reading room", status: "planned" },
		],
	});
	expect(html).toContain("<ol");
	expect(html.indexOf("Earlier") < html.indexOf("Now")).toBe(true);
	expect(html.indexOf("Now") < html.indexOf("Next")).toBe(true);
	expect(html).toContain('data-status="done"');
	expect(html).toContain("in progress");
	expect(html).toContain("planned");
	expect(html).not.toContain("<script>");
	expect(html).not.toContain("datetime=");
	expect(() =>
		contentHtml(roadmap, { items: [{ status: "invented" }] }),
	).toThrow();
});
test("bento preserves every tile and resolved image and refuses destination-only actions", () => {
	const html = contentHtml(bento, {
		heading: "Material studies",
		items: [
			{
				title: "Clay",
				body: "First material",
				mediaId: "clay",
				ctaLabel: "Explore clay",
				ctaUrl: "/clay",
			},
			{ title: "Paper", body: "Second material", mediaId: "paper" },
			{ title: "Ink", body: "Third material" },
			{ title: "Light", body: "Fourth material" },
		],
	});
	expect((html.match(/<article/g) || []).length).toBe(4);
	expect(html).toContain('src="/clay.png"');
	expect(html).toContain('src="/paper.png"');
	expect(html).toContain('href="/clay"');
	expect(html).toContain("Fourth material");
	expect(() =>
		contentHtml(bento, { items: [{ ctaUrl: "/unlabelled" }] }),
	).toThrow("accessible label");
	expect(() =>
		contentHtml(bento, { items: [{ mediaId: "unresolved" }] }),
	).toThrow("Resolve public media");
});
test("team cards keep profile identity and links while leaving absent photos absent", () => {
	const html = contentHtml(team, {
		heading: "The sample team",
		members: [
			{
				name: "Sample maker",
				role: "Ceramics",
				bio: "Works with clay",
				mediaId: "clay",
				href: "/makers/sample",
			},
			{ name: "Sample reader", role: "Books", bio: "Keeps the library" },
		],
	});
	expect((html.match(/<article/g) || []).length).toBe(2);
	expect((html.match(/<img/g) || []).length).toBe(1);
	expect(html).toContain('alt="Sample maker"');
	expect(html).toContain("Read about Sample maker");
	expect(html).toContain("Keeps the library");
	expect(() =>
		contentHtml(team, {
			members: [{ name: "Bad link", href: "javascript:alert(1)" }],
		}),
	).toThrow();
});
test("alternating features keep semantic copy order and each target image without empty media columns", () => {
	const html = contentHtml(alternating, {
		items: [
			{
				title: "Look",
				body: "Observe a surface",
				mediaId: "clay",
				mediaAlt: "Clay detail",
			},
			{ title: "Record", body: "Write a note", mediaId: "paper" },
			{ title: "Return", body: "No image supplied" },
		],
	});
	expect((html.match(/<article/g) || []).length).toBe(3);
	expect(html).toContain('alt="Clay detail"');
	expect(html).toContain('data-has-media="false"');
	expect(
		html.indexOf("Observe a surface") < html.indexOf('src="/clay.png"'),
	).toBe(true);
	expect(html.indexOf("Write a note") < html.indexOf('src="/paper.png"')).toBe(
		true,
	);
	expect(html).toContain("No image supplied");
});
test("hero preserves nullable heading, both authored actions, target media and explicit link validation", () => {
	const empty = contentHtml(hero, { title: null });
	expect(empty).not.toContain("<h1");
	const html = contentHtml(hero, {
		eyebrow: "Sample journal",
		title: "A place to notice",
		body: "Quiet observations",
		primaryCtaLabel: "Read",
		primaryCtaUrl: "/journal",
		secondaryCtaLabel: "Visit",
		secondaryCtaUrl: "/visit",
		mediaId: "clay",
	});
	expect(html).toContain("<h1");
	expect(html).toContain('href="/journal"');
	expect(html).toContain('href="/visit"');
	expect(html).toContain('src="/clay.png"');
	expect(() => contentHtml(hero, { primaryCtaUrl: "/destination" })).toThrow(
		"accessible label",
	);
});

test("footnotes preserve exact authored targets and rich marks while rejecting ambiguous keys", () => {
	const body = {
		type: "doc",
		content: [
			{
				type: "paragraph",
				content: [
					{
						type: "text",
						text: "Original field note",
						marks: [
							{ type: "bold" },
							{ type: "link", attrs: { href: "/journal" } },
						],
					},
				],
			},
		],
	};
	const html = contentHtml(footnotes, {
		notes: [
			{ key: "field-note", body },
			{ key: "return-note", body },
		],
	});
	expect(html).toContain('id="field-note"');
	expect(html).toContain('href="#field-note"');
	expect(html).toContain("<strong>");
	expect(html).toContain('href="/journal"');
	expect(html).toContain('id="return-note"');
	expect(() =>
		contentHtml(footnotes, { notes: [{ key: "two words", body }] }),
	).toThrow();
	expect(() =>
		contentHtml(footnotes, {
			notes: [
				{ key: "same", body },
				{ key: "same", body },
			],
		}),
	).toThrow();
});
test("editorial pricing preserves plan association, features and literal price labels without billing controls", () => {
	const html = contentHtml(pricing, {
		plans: [
			{
				name: "Reading room",
				priceLabel: "Free",
				features: ["Read the notebook"],
				cta: { label: "Read", href: "/read" },
			},
			{
				name: "Workshop",
				description: "A guided session",
				priceLabel: "Ask for a quote",
				features: ["Work alongside a maker"],
			},
		],
		rows: [{ label: "Format", values: ["Self guided", "Small group"] }],
	});
	expect(html).toContain('scope="col"');
	expect(html).toContain('scope="row"');
	expect(html).toContain("Ask for a quote");
	expect(html).toContain("Work alongside a maker");
	expect(html).toContain('href="/read"');
	expect(html.indexOf("Self guided") < html.indexOf("Small group")).toBe(true);
	expect(html).not.toContain("<input");
	expect(html).not.toContain("<button");
	expect(() =>
		contentHtml(pricing, {
			plans: [{ name: "A" }, { name: "B" }],
			rows: [{ label: "Mismatch", values: ["Only one"] }],
		}),
	).toThrow();
	expect(() =>
		contentHtml(pricing, {
			plans: [],
			rows: [{ label: "Orphaned", values: ["Preserve me"] }],
		}),
	).toThrow();
});
test("comparison renders row/column headers, preserves every value and refuses malformed or orphaned rows", () => {
	const html = contentHtml(comparison, {
		heading: "Ways to read",
		columns: ["Approach", "Notebook", "Conversation"],
		rows: [
			{ label: "Pace", cells: ["Self paced", "Shared"] },
			{ label: "Materials", cells: ["Paper & ink", "Voice"] },
		],
	});
	expect((html.match(/scope="col"/g) || []).length).toBe(3);
	expect((html.match(/scope="row"/g) || []).length).toBe(2);
	expect(html).toContain("Paper &amp; ink");
	expect(html.indexOf("Self paced") < html.indexOf("Shared")).toBe(true);
	expect(contentHtml(comparison, { columns: null, rows: [] })).toContain(
		"Choose columns to compare",
	);
	expect(() =>
		contentHtml(comparison, {
			columns: null,
			rows: [{ label: "Orphaned", cells: ["Preserve me"] }],
		}),
	).toThrow();
	expect(() =>
		contentHtml(comparison, {
			columns: ["Feature", "One", "Two"],
			rows: [{ label: "Extra", cells: ["A", "B", "Do not drop"] }],
		}),
	).toThrow();
});
