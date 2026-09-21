import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PrimitiveProvider } from "../primitives";
import { installPackRenderers } from "./pack-registry";
import { defineBlock, prepareBlocks } from "./model";
const baseline = defineBlock("core/heading", () => <p>Library heading</p>);
const journal = defineBlock("core/heading", () => <p>Journal heading</p>);
const library = { "core/heading": baseline };
const manifests = [
	{
		id: "journal",
		blocks: { renderers: { "core/heading": "./blocks/core/heading.tsx" } },
	},
];
const modules = { "/packs/journal/blocks/core/heading.tsx": journal };
test("pack resolution uses its own provider identity with a Library baseline and no cross-pack fallback", () => {
	const registry = installPackRenderers(library, manifests, modules),
		View = registry["core/heading"].View;
	for (const pack of ["journal", "depot", "core", "unknown"]) {
		const html = renderToStaticMarkup(
			<PrimitiveProvider packId={pack}>
				<View attrs={{}} resources={{ media: {} }} />
			</PrimitiveProvider>,
		);
		expect(html).toContain(
			pack === "journal" ? "Journal heading" : "Library heading",
		);
		expect(html.includes('data-pack-block="journal:core/heading"')).toBe(
			pack === "journal",
		);
	}
	expect(
		renderToStaticMarkup(<View attrs={{}} resources={{ media: {} }} />),
	).toContain("Library heading");
});
test("renderer ownership rejects undeclared modules, wrong identity, data changes and path escape", () => {
	expect(() => installPackRenderers(library, [], modules)).toThrow(
		"Undeclared",
	);
	expect(() => installPackRenderers(library, manifests, {})).toThrow("Missing");
	expect(() =>
		installPackRenderers(library, [...manifests, ...manifests], modules),
	).toThrow("duplicate");
	expect(() =>
		installPackRenderers(
			library,
			[
				{
					id: "journal",
					blocks: {
						renderers: { "core/heading": "../depot/blocks/core/heading.tsx" },
					},
				},
			],
			modules,
		),
	).toThrow("owned file");
	expect(() =>
		installPackRenderers(library, manifests, {
			"/packs/journal/blocks/core/heading.tsx": {
				...journal,
				blockName: "core/paragraph",
			},
		}),
	).toThrow("identity");
	expect(() =>
		installPackRenderers(library, manifests, {
			"/packs/journal/blocks/core/heading.tsx": {
				...journal,
				dataResolver: "forms.form",
			},
		}),
	).toThrow("data contract");
});
test("an installed treatment never bypasses disabled-block or invalid-attribute validation", () => {
	const registry = installPackRenderers(library, manifests, modules);
	const tree = [{ id: "title", name: "core/heading", version: 2, attrs: {} }];
	expect(() =>
		prepareBlocks(
			tree,
			registry,
			{
				enabledPlugins: [],
				capabilities: [],
				disabledBlocks: ["core/heading"],
			},
			{ media: {} },
		),
	).toThrow("disabled");
	expect(() =>
		prepareBlocks(
			[{ ...tree[0], attrs: { level: 99 } }],
			registry,
			{ enabledPlugins: [], capabilities: [], disabledBlocks: [] },
			{ media: {} },
		),
	).toThrow();
});

import journalCta from "../../packs/journal/blocks/core/cta-band";
import depotCta from "../../packs/depot/blocks/core/cta-band";
test("named styles reach owned renderers and template switches fall back without changing authored content", () => {
  const base = defineBlock("core/cta-band", ({ style }) => <p data-library-style={style}>Library CTA</p>);
  const registry = installPackRenderers({ "core/cta-band": base }, ["journal", "depot"].map(id => ({ id, blocks: { renderers: { "core/cta-band": "./blocks/core/cta-band.tsx" } } })), {
    "/packs/journal/blocks/core/cta-band.tsx": journalCta,
    "/packs/depot/blocks/core/cta-band.tsx": depotCta,
  });
  const tree = [{ id: "cta", name: "core/cta-band", version: 2, attrs: { heading: "A new chapter" }, style: "inset" }];
  const before = JSON.stringify(tree);
  const html = (pack: string, input = tree) => renderToStaticMarkup(<PrimitiveProvider packId={pack}>{prepareBlocks(input, registry, { enabledPlugins: [], capabilities: [], disabledBlocks: [] }, { media: {} }, undefined, pack)}</PrimitiveProvider>);
  expect(html("journal")).toContain('data-block-style="inset"');
  expect(html("depot")).toContain('data-block-style="default"');
  expect(html("depot", [{ ...tree[0], style: "outline" }])).toContain('data-block-style="outline"');
  expect(html("core")).toContain('data-library-style="default"');
  expect(html("journal")).toContain("A new chapter");
  expect(JSON.stringify(tree)).toBe(before);
});
