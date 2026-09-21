import { useState } from "react";
import { PrimitiveProvider, type PackPartsRegistry } from "../src/templates/sdk/primitives";
import { resolveComposition, type Composition } from "../src/templates/sdk/block-data/portable/composition";
import { CompositionView } from "../src/templates/sdk/block-renderer/composition";
import { demoProducts } from "./products-adapter";
import { demoHref } from "./composed-content";

export const compositionExample: Composition = { version: 1, root: {
  el: "Section", props: { width: "wide", spacing: "spacious" }, children: [
    { el: "Stack", props: { gap: "lg" }, children: [
      { el: "Eyebrow", bind: "'Considered essentials'" },
      { el: "Heading", props: { level: 2, size: "display" }, bind: "attrs.heading" },
      { el: "Text", props: { size: "lg" }, bind: "attrs.intro" },
      { el: "Text", if: "attrs.empty", bind: "'Nothing in this collection yet. Come back for the next edit.'" },
      { el: "Grid", props: { columns: { base: 1, md: 3 }, gap: "lg" }, each: "data.items", as: "item", children: [
        { el: "Card", props: { variant: "outline", padding: "default" }, if: "item.available", children: [
          { el: "Stack", props: { gap: "md" }, children: [
            { el: "Image", props: { aspect: "4/5" }, bind: { media: "item.image" } },
            { el: "Heading", props: { level: 3, size: "md" }, bind: "item.title" },
            { el: "Text", bind: "item.excerpt" },
            { el: "Stat", bind: { label: "'A daily companion'", value: "currency(item.amount, item.currency)" } },
            { el: "Button", props: { variant: "outline" }, bind: { label: "'Explore ' + item.title", href: "item.href" } },
          ] },
        ] },
      ] },
    ] },
  ],
} };
export function compositionFixture(packId: string, scenario = "ready") {
  const items = demoProducts.slice(0, 3).map((item, index) => ({
    ...item, currency: "USD", image: { src: item.src.startsWith("/") ? item.src : `/${item.src}`, alt: item.alt },
    available: !(scenario === "unavailable" && index === 0),
    href: scenario === "unsafe" && index === 0 ? "javascript:alert(1)" : demoHref({ page: "product", item: item.id }, `pack=${packId}`),
  }));
  return {
    attrs: { heading: "A little room for the everyday.", intro: "Useful objects, quietly made. Choose something to make your daily rituals feel a little more considered.", empty: scenario === "empty" },
    data: { items: scenario === "empty" ? [] : items },
  };
}
export function CompositionStudy({ packId, registry }: { packId: string; registry: PackPartsRegistry }) {
  const [scenario, setScenario] = useState("ready");
  const scope = compositionFixture(packId, scenario);
  let error: string | undefined;
  try { resolveComposition(compositionExample, scope); }
  catch (failure) { error = failure instanceof Error ? failure.message : "Composition failed validation"; }
  return <section id="runtime-composition" className="composition-study" aria-labelledby="composition-study-title">
    <div className="composition-study-tools">
      <div><p className="lab-kicker">Runtime composition study</p><h2 id="composition-study-title">One definition. Every template.</h2><p>Fictional catalog · preview only · no purchase actions.</p></div>
      <label>Composition state <select value={scenario} onChange={event => setScenario(event.target.value)}>
        <option value="ready">Three objects</option><option value="empty">Empty collection</option><option value="unavailable">First object unavailable</option><option value="unsafe">Invalid link rejected</option>
      </select></label>
    </div>
    <div className="composition-study-canvas" data-composition-state={error ? "rejected" : scenario}>
      {error ? <div role="alert"><h3>This composition could not be displayed.</h3><p>The definition or supplied data failed validation. No part of the composition was rendered.</p><details><summary>Validation details</summary><pre>{error}</pre></details></div> : <PrimitiveProvider packId={packId} registry={registry}><CompositionView composition={compositionExample} {...scope} /></PrimitiveProvider>}
    </div>
    <details className="composition-study-source"><summary>View the authored definition</summary><pre>{JSON.stringify(compositionExample, null, 2)}</pre></details>
  </section>;
}
