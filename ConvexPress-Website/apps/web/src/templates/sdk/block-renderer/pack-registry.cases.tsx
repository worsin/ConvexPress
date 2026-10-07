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
import coreHero from "../../packs/core/blocks/core/hero";
import journalHero from "../../packs/journal/blocks/core/hero";
import depotHero from "../../packs/depot/blocks/core/hero";
import asterHero from "../../packs/aster-house/blocks/core/hero";
test("Hero named treatments preserve authored copy and safe actions in every pack", () => {
  const owned = { core: coreHero, journal: journalHero, depot: depotHero, "aster-house": asterHero };
  const attrs = { eyebrow: "Field notes", title: "A quieter day", body: "Leave room for an idea.", primaryCtaLabel: "Explore", primaryCtaUrl: "#details", secondaryCtaLabel: "Contact", secondaryCtaUrl: "mailto:hello@example.test" };
  const before = JSON.stringify(attrs);
  for (const [pack, renderer] of Object.entries(owned)) {
    for (const style of ["editorial", "poster"]) {
      const html = renderToStaticMarkup(<PrimitiveProvider packId={pack}>{prepareBlocks([{id:"hero",name:"core/hero",version:2,attrs,style}],{"core/hero":renderer},{enabledPlugins:[],capabilities:[],disabledBlocks:[]},{media:{}},undefined,pack)}</PrimitiveProvider>);
      expect(html).toContain(`data-hero-style="${style}"`);
      for (const text of Object.values(attrs)) expect(html).toContain(text);
      expect((html.match(/<h1\b/g) ?? []).length).toBe(1);
      expect(html).not.toContain("<img");
    }
    const fallback = renderToStaticMarkup(<PrimitiveProvider packId={pack}>{prepareBlocks([{id:"hero",name:"core/hero",version:2,attrs,style:"unavailable"}],{"core/hero":renderer},{enabledPlugins:[],capabilities:[],disabledBlocks:[]},{media:{}},undefined,pack)}</PrimitiveProvider>);
    expect(fallback).not.toContain("data-hero-style=");
    expect(fallback).toContain(attrs.title);
  }
  expect(JSON.stringify(attrs)).toBe(before);
});
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

import journalFeatures from "../../packs/journal/blocks/core/feature-grid";
import depotFeatures from "../../packs/depot/blocks/core/feature-grid";
import journalTestimonials from "../../packs/journal/blocks/core/testimonials";
import depotTestimonials from "../../packs/depot/blocks/core/testimonials";
import baselineFeatures from "../../../../../../../blocks/core/feature-grid/render";
import baselineTestimonials from "../../../../../../../blocks/core/testimonials/render";

test("flagship collection styles preserve all items and references across styles and pack fallback", () => {
  const modules = {
    "/packs/journal/blocks/core/feature-grid.tsx": journalFeatures,
    "/packs/depot/blocks/core/feature-grid.tsx": depotFeatures,
    "/packs/journal/blocks/core/testimonials.tsx": journalTestimonials,
    "/packs/depot/blocks/core/testimonials.tsx": depotTestimonials,
  };
  const registry = installPackRenderers({ "core/feature-grid": baselineFeatures, "core/testimonials": baselineTestimonials }, ["journal", "depot"].map(id => ({id, blocks: {renderers: {"core/feature-grid":"./blocks/core/feature-grid.tsx", "core/testimonials":"./blocks/core/testimonials.tsx"}}})), modules);
  const cases = [
    { name: "core/feature-grid", styles: ["cards", "minimal"], max: 12, item: {title:"Distinct feature",description:"Preserved description",icon:"star",link:{label:"Explore details",href:"#details"}} },
    { name: "core/testimonials", styles: ["editorial", "wall"], max: 20, item: {quote:"Preserved quotation",name:"Fictional guest",role:"Workshop",portrait:{id:"portrait",alt:"Preserved portrait",focalPoint:{x:0.4,y:0.3}}} },
  ];
  for (const entry of cases) for (const count of [0, 1, entry.max]) for (const style of entry.styles) {
    const tree = [{id:"collection",name:entry.name,version:2,style,attrs:{heading:"Preserved heading",items:Array.from({length:count},()=>structuredClone(entry.item))}}];
    const before = JSON.stringify(tree);
    const html = (pack: string) => renderToStaticMarkup(<PrimitiveProvider packId={pack}>{prepareBlocks(tree,registry,{enabledPlugins:[],capabilities:[],disabledBlocks:[]},{media:{portrait:{src:"/portrait.png",alt:"Resource fallback",mimeType:"image/png"}}},undefined,pack)}</PrimitiveProvider>);
    for (const pack of ["journal","depot"]) {
      const output = html(pack);
      expect(output).toContain(`data-block-style="${style}"`);
      expect(output).toContain("Preserved heading");
      if (entry.name === "core/feature-grid") {
        expect((output.match(/href="#details"/g) ?? []).length).toBe(count);
        expect((output.match(/Distinct feature/g) ?? []).length).toBe(count);
      } else {
        expect((output.match(/Preserved quotation/g) ?? []).length).toBe(count);
        expect((output.match(/alt="Preserved portrait"/g) ?? []).length).toBe(count);
      }
    }
    for (const pack of ["core","aster-house"]) {
      expect(html(pack)).not.toContain(`data-block-style="${style}"`);
      expect(html(pack)).toContain("Preserved heading");
    }
    expect(JSON.stringify(tree)).toBe(before);
  }
});
