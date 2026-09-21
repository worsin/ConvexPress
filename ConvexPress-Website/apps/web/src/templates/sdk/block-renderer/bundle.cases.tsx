import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import block from "../../../../../../../blocks/commerce/bundle-offer/render";
import {
	BundleProvider,
	type BundleHostProps,
	type BundleInteraction,
} from "./bundle";
import { bundleOfferResultSchema } from "../block-data/portable/bundleOfferContracts";
import { bundleDemo } from "../../../../block-demo/bundle-adapter";

function html(live = false) {
	const view = (
		<block.View
			blockId="offer"
			attrs={{ title: "<My set>", body: "Made for you" }}
			resources={{ media: {} }}
			data={{ bundle: bundleDemo }}
		/>
	);
	const Host = ({ offer, children }: BundleHostProps) =>
		children({
			choices: offer.defaults,
			quote: offer.quote,
			ready: true,
			busy: false,
			message: "Live test",
			change: () => {},
			reset: () => {},
			add: async () => {},
		});
	return renderToStaticMarkup(
		live ? <BundleProvider host={Host}>{view}</BundleProvider> : view,
	);
}
test("bundle renderer exposes configured choices and prices with accessible native controls", () => {
	const result = html(true);
	expect(result).toContain("&lt;My set&gt;");
	expect(result).toContain("$55.80");
	expect(result).toContain("$62.00");
	expect(result).toContain('aria-label="The Field Notebook option"');
	expect(result).toContain('aria-label="Increase The Field Notebook quantity"');
	expect(result).toContain("Sand — unavailable");
	expect(result).toContain('href="/cart"');
});
test("a renderer without a live host cannot perform a purchase", () => {
	const result = html();
	expect(result).toMatch(/<fieldset[^>]*disabled=""/u);
	expect(result).toMatch(/<button[^>]*cp-bundle-add[^>]*disabled=""/u);
	expect(result).toContain("Open the bundle");
});
test("bundle DTO rejects unbound choices, private fields and unsafe image sources", () => {
	for (const bundle of [
		{ ...bundleDemo, defaults: [{ componentId: "foreign", quantity: 1 }] },
		{
			...bundleDemo,
			defaults: [
				{ componentId: "notebook", variantId: "private", quantity: 1 },
			],
		},
		{ ...bundleDemo, authorId: "private" },
		{ ...bundleDemo, images: ["javascript:alert(1)"] },
		{
			...bundleDemo,
			components: [...bundleDemo.components, bundleDemo.components[0]],
		},
	])
		expect(() => bundleOfferResultSchema.parse({ bundle })).toThrow();
});
test("unavailable bundle state never reuses the previous offer or its purchase controls", () => {
	const result = renderToStaticMarkup(
		<block.View
			blockId="offer"
			attrs={{}}
			resources={{ media: {} }}
			data={{ bundle: null }}
		/>,
	);
	expect(result).toContain("not available right now");
	expect(result).not.toContain("Add set to cart");
	expect(result).not.toContain("$55.80");
});

function renderState(overrides: Partial<BundleInteraction>) {
	const Host = ({ offer, children }: BundleHostProps) =>
		children({
			choices: offer.defaults,
			quote: offer.quote,
			ready: true,
			busy: false,
			message: "",
			change: () => {},
			reset: () => {},
			add: async () => {},
			...overrides,
		});
	return renderToStaticMarkup(
		<BundleProvider host={Host}>
			<block.View
				blockId="offer"
				attrs={{}}
				resources={{ media: {} }}
				data={{ bundle: bundleDemo }}
			/>
		</BundleProvider>,
	);
}
test("unavailable bundle choices explain why purchase is disabled even without a host message", () => {
	const result = renderState({
		quote: { ...bundleDemo.quote!, available: false },
	});
	expect(result).toMatch(/cp-bundle-add[^>]*disabled=""/u);
	expect(result).toContain("This set is unavailable with the current choices.");
	expect(result).not.toContain("checked when you add your set");
	expect(result).toContain('aria-label="Include The Morning Mug"');
	expect(result).toContain('aria-label="Include A Good Pencil"');
});
test("bundle quantity limits provide an actionable disabled-state explanation", () => {
	const result = renderState({
		choices: [
			{ componentId: "notebook", variantId: "forest", quantity: 3 },
			{ componentId: "mug", quantity: 2 },
			{ componentId: "pencil", quantity: 1 },
		],
		quote: { ...bundleDemo.quote!, available: false },
	});
	expect(result).toContain(
		"Remove 1 item to keep this set within its 5-item limit.",
	);
	expect(result).toMatch(/cp-bundle-add[^>]*disabled=""/u);
});
test("bundle status preserves host guidance and never offers a purchase while unpriced", () => {
	const result = renderState({
		quote: null,
		message: "Reconnect to check availability.",
	});
	expect(result).toContain("Reconnect to check availability.");
	expect(result).toMatch(/cp-bundle-add[^>]*disabled=""/u);
	const unpriced = renderState({ quote: null });
	expect(unpriced).toContain("Choose available options to calculate your set.");
	expect(unpriced).not.toContain("checked when you add your set");
});
