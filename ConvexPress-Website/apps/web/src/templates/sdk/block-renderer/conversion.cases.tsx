import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { prepareBlocks, type RendererDefinition } from "./model";
import catalog from "../../../../../../../blocks/.generated/catalog.json";
import map from "../../../../../../../blocks/core/map/render";
import script from "../../../../../../../blocks/core/script-embed/render";
import newsletter from "../../../../../../../blocks/core/newsletter-signup/render";
import cta from "../../../../../../../blocks/core/cta-with-form/render";
export function conversionTree(view: RendererDefinition, attrs: unknown) {
	const spec = catalog.find((item) => item.name === view.blockName)!;
	return prepareBlocks(
		[{ id: "conversion", name: view.blockName, version: spec.version, attrs }],
		{ [view.blockName]: view },
		{
			enabledPlugins: [],
			capabilities: [
				"map.approvedProvider",
				"embed.approvedScript",
				"form.submission",
			],
			disabledBlocks: [],
		},
	);
}
test("map preserves coordinates/address/directions and missing coordinates never manufacture a location", () => {
	const html = renderToStaticMarkup(
		conversionTree(map, {
			address: "Sample place",
			latitude: 40.7,
			longitude: -111.6,
			directions: {
				label: "Directions",
				href: "https://example.invalid/directions",
			},
		}),
	);
	expect(html).toContain("Sample place");
	expect(html).toContain("mlat=40.7");
	expect(html).toContain("mlon=-111.6");
	expect(html).toContain('href="https://example.invalid/directions"');
	expect(html).not.toContain("<iframe");
	const absent = renderToStaticMarkup(
		conversionTree(map, { address: "Choose a location" }),
	);
	expect(absent).toContain("Choose verified coordinates");
	expect(absent).not.toContain("openstreetmap.org");
	expect(() => conversionTree(map, { latitude: 91, longitude: 0 })).toThrow();
});
test("script embeds use only the schema's reviewed provider ID modes and never insert first-party scripts", () => {
	for (const attrs of [
		{ provider: "youtube", resourceId: "M7lc1UVf-VE" },
		{ provider: "vimeo", resourceId: "76979871" },
	]) {
		const html = renderToStaticMarkup(conversionTree(script, attrs));
		expect(html).toContain("Load video");
		expect(html).not.toContain("<script");
		expect(html).not.toContain("<iframe");
	}
	expect(() =>
		renderToStaticMarkup(
			conversionTree(script, {
				provider: "youtube",
				resourceId: "javascript:alert",
			}),
		),
	).toThrow();
	expect(() =>
		conversionTree(script, { provider: "custom", resourceId: "123" }),
	).toThrow();
});
test("both signup compositions preserve authored copy while disconnected forms cannot pretend success", () => {
	for (const view of [newsletter, cta]) {
		const html = renderToStaticMarkup(
			conversionTree(view, {
				heading: "Notes from the studio",
				body: "Authored copy",
				placeholder: "Your address",
				submitLabel: "Join the notes",
			}),
		);
		for (const value of [
			"Notes from the studio",
			"Authored copy",
			"Your address",
			"Join the notes",
			"Email address",
			"not connected",
		])
			expect(html).toContain(value);
		expect(html).toContain("disabled");
		expect(html).not.toContain("You're subscribed.");
		expect(html).not.toContain("Check your inbox");
	}
});
test("form and provider capabilities are host requirements and cannot be supplied by authored attrs", () => {
	for (const view of [map, script, newsletter, cta]) {
		const spec = catalog.find((item) => item.name === view.blockName)!;
		expect(() =>
			prepareBlocks(
				[
					{
						id: "missing-capability",
						name: view.blockName,
						version: spec.version,
						attrs: {},
					},
				],
				{ [view.blockName]: view },
				{ enabledPlugins: [], capabilities: [], disabledBlocks: [] },
			),
		).toThrow();
	}
	expect(() =>
		conversionTree(newsletter, { transport: { scopeKey: "forged" } }),
	).toThrow();
	expect(() =>
		conversionTree(cta, { recipientEmail: "unapproved@example.invalid" }),
	).toThrow();
});
