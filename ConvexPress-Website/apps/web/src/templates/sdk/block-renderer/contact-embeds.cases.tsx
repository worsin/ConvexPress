import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { prepareBlocks, type RendererDefinition } from "./model";
import catalog from "../../../../../../../blocks/.generated/catalog.json";
import contact from "../../../../../../../blocks/blocks/contact-stack/render";
import booking from "../../../../../../../blocks/core/booking-cta/render";
import embed from "../../../../../../../blocks/core/embed/render";
import iframe from "../../../../../../../blocks/core/iframe/render";

export function contactTree(
	view: RendererDefinition,
	attrs: unknown,
	enabled = true,
) {
	const spec = catalog.find((item) => item.name === view.blockName)!;
	return prepareBlocks(
		[
			{
				id: "contact-fixture",
				name: view.blockName,
				version: spec.version,
				attrs,
			},
		],
		{ [view.blockName]: view },
		{
			enabledPlugins: [],
			capabilities: enabled ? ["embed.sandbox"] : [],
			disabledBlocks: [],
		},
	);
}
const html = (view: RendererDefinition, attrs: unknown, enabled = true) =>
	renderToStaticMarkup(contactTree(view, attrs, enabled));
test("contact and booking keep authored details and real navigation without invented forms or confirmation", () => {
	const rendered = html(contact, {
		heading: "Visit the workshop",
		phone: "+1 (202) 555-0142",
		email: "hello@example.invalid",
		address: "First line\nSecond line",
		hours: "By arrangement",
		items: [{ label: "A note", value: "", href: "" }],
	});
	for (const text of [
		"Visit the workshop",
		"First line",
		"Second line",
		"By arrangement",
		"A note",
		'href="tel:+12025550142"',
		'href="mailto:hello@example.invalid"',
	])
		expect(rendered).toContain(text);
	expect(rendered).not.toContain("<iframe");
	expect(rendered).not.toContain("<form");
	const invitation = html(booking, {
		heading: "An afternoon of making",
		ctaLabel: "Plan a visit",
		ctaUrl: "/contact",
	});
	expect(invitation).toContain('href="/contact"');
	expect(invitation).toContain("Plan a visit");
	expect(invitation).not.toContain("<form");
	expect(html(booking, {})).not.toContain("<a ");
});
test("reviewed embeds have stable visible SSR consent, fallback links and no connected iframe", () => {
	const cases: [RendererDefinition, unknown, string][] = [
		[
			embed,
			{ url: "https://youtu.be/M7lc1UVf-VE", caption: "Authored caption" },
			"YouTube",
		],
		[
			iframe,
			{
				url: { label: "Film", href: "https://vimeo.com/76979871" },
				title: "A film",
			},
			"Vimeo",
		],
		[
			contact,
			{
				mapEmbedUrl:
					"https://www.openstreetmap.org/export/embed.html?bbox=-112,40,-111,41&layer=mapnik",
			},
			"OpenStreetMap",
		],
		[
			booking,
			{
				embedUrl:
					"https://calendly.com/convexpress-example-invalid/studio-visit",
			},
			"Calendly",
		],
	];
	for (const [view, attrs, provider] of cases) {
		const output = html(view, attrs);
		expect(output).toContain(`Open on ${provider}`);
		expect(output).toContain("Loading connects to");
		expect(output).not.toContain("<iframe");
		expect(output).not.toContain("<script");
	}
	expect(
		html(embed, { url: "", caption: "A caption without a video" }),
	).toContain("A caption without a video");
	expect(html(iframe, {})).toContain("No embedded content selected.");
});
test("stored attrs cannot grant capabilities, change iframe sandbox or execute arbitrary provider URLs", () => {
	expect(() =>
		html(embed, { url: "https://youtu.be/M7lc1UVf-VE" }, false),
	).toThrow();
	expect(() => html(iframe, {}, false)).toThrow();
	expect(() => html(contact, {}, false)).toThrow();
	expect(() => html(booking, {}, false)).toThrow();
	expect(() =>
		html(iframe, {
			url: { label: "Unsafe", href: "https://example.invalid/player" },
		}),
	).toThrow();
	expect(() => html(embed, { url: "javascript:alert(1)" })).toThrow();
	expect(() =>
		html(iframe, {
			url: { label: "Film", href: "https://vimeo.com/76979871" },
			sandbox: "allow-top-navigation",
		}),
	).toThrow();
	expect(() =>
		html(booking, { embedUrl: "https://youtu.be/M7lc1UVf-VE" }),
	).toThrow();
});
