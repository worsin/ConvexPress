import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { prepareBlocks } from "./model";
import fieldGuide from "../../../../../../../blocks/reference/field-guide/render";
import { FieldGuideView } from "../../../blocks/field-guide/View";
import { fieldGuideAttrsSchema } from "../../../blocks/field-guide/schema";
import {
	validateBlockAttrs,
	validateBlockTreatment,
} from "../../../../../../../blocks/.generated/schemas";
import { PrimitiveProvider } from "../primitives";
import journal from "../../packs/journal/parts/primitives";
import depot from "../../packs/depot/parts/primitives";
const policy = { enabledPlugins: [], capabilities: [], disabledBlocks: [] };
const parts = { journal, depot };
function project(root) {
	const copy = root.cloneNode(true);
	copy.querySelectorAll(".cp-sr-only").forEach((node) => node.remove());
	root = copy;
	return {
		heading: root.querySelector("h2")?.textContent,
		paragraphs: [...root.querySelectorAll("p")].map((p) => p.textContent),
		terms: [...root.querySelectorAll("dt,dd")].map((p) => p.textContent),
		links: [...root.querySelectorAll("a")].map((a) => ({
			label: a.textContent,
			href: a.getAttribute("href"),
			target: a.getAttribute("target"),
			rel: a.getAttribute("rel"),
		})),
	};
}
test("editorial axes preserve actual legacy render content, empty nodes, literal text and CTA halves across all packs", () => {
	const cases = [
		{},
		{ body: "", note: "" },
		{
			body: " **literal**\n  keep text ",
			note: null,
			items: [
				{ label: "A", value: "1" },
				{ label: "B", value: "2" },
			],
			count: 1,
		},
		{ showDetails: false, note: "Hidden" },
		{ link: { label: "No destination", href: "", newTab: false } },
		{ link: { label: "", href: "/field", newTab: false } },
		{
			heading: "Exact heading",
			link: { label: "Read", href: "/field", newTab: true },
		},
	];
	for (const packId of ["core", "journal", "depot", "aster-house"])
		for (const input of cases) {
			const old = fieldGuideAttrsSchema.parse(input);
			const { spacing, alignment, ink, font, ...attrs } = old;
			const treatment = validateBlockTreatment("reference/field-guide", {
				name: "editorial",
				values: { spacing, alignment, ink, font },
			});
			const node = {
				id: "guide",
				name: "reference/field-guide",
				version: 2,
				attrs: validateBlockAttrs("reference/field-guide", attrs),
				treatment,
			};
			const before = new JSDOM(
				renderToStaticMarkup(<FieldGuideView attrs={old} />),
			).window.document.body;
			const after = new JSDOM(
				renderToStaticMarkup(
					<PrimitiveProvider packId={packId} registry={parts}>
						{prepareBlocks(
							[node],
							{ "reference/field-guide": fieldGuide },
							policy,
							{ media: {} },
							undefined,
							packId,
						)}
					</PrimitiveProvider>,
				),
			).window.document.body;
			expect(project(after)).toEqual(project(before));
		}
});
test("all finite axes render only with explicit pack support and malformed treatment refuses", () => {
	const attrs = validateBlockAttrs("reference/field-guide", {});
	for (let spacing = 0; spacing <= 8; spacing++)
		for (const alignment of ["left", "center", "right"])
			for (const ink of ["foreground", "primary", "muted"])
				for (const font of ["body", "display"]) {
					const node = {
						id: "guide",
						name: "reference/field-guide",
						version: 2,
						attrs,
						treatment: {
							name: "editorial",
							values: { spacing, alignment, ink, font },
						},
					};
					const html = renderToStaticMarkup(
						prepareBlocks(
							[node],
							{ "reference/field-guide": fieldGuide },
							policy,
							{ media: {} },
							undefined,
							"core",
						),
					);
					expect(html).toContain(`data-spacing="${spacing}"`);
					expect(html).toContain(`data-alignment="${alignment}"`);
					expect(html).toContain(`data-ink="${ink}"`);
					expect(html).toContain(`data-font="${font}"`);
				}
	const node = {
		id: "guide",
		name: "reference/field-guide",
		version: 2,
		attrs,
		treatment: {
			name: "editorial",
			values: { spacing: 4, alignment: "left", ink: "primary", font: "body" },
		},
	};
	expect(() =>
		prepareBlocks(
			[node],
			{ "reference/field-guide": fieldGuide },
			policy,
			{ media: {} },
			undefined,
			"unknown",
		),
	).toThrow("does not support");
	expect(() =>
		prepareBlocks(
			[
				{
					...node,
					treatment: {
						...node.treatment,
						values: { ...node.treatment.values, spacing: 9 },
					},
				},
			],
			{ "reference/field-guide": fieldGuide },
			policy,
			{ media: {} },
			undefined,
			"core",
		),
	).toThrow("generated block contract");
});
