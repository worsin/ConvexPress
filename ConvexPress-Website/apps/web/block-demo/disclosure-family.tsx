import { useState } from "react";
import { prepareBlocks } from "../src/templates/sdk/block-renderer/model";
import { stagedRenderers } from "../src/templates/sdk/block-renderer/discovery";
import notebook from "./assets/aster-house-field-notebook.png";
import mug from "./assets/aster-house-camp-mug.png";

const rich = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
export function disclosureFamilyTree(sample = "editorial") {
  const long = sample === "maximum", empty = sample === "empty";
  const titles = ["A place to begin", "A useful ritual", "Room to return"];
  const copy = ["Start with a small observation.\nWrite down what caught your attention.", "Take a few quiet minutes.\nLet the ordinary become interesting.", "Return to a page next week.\nNotice what has changed."];
  const nodes = [
    { id: "family-accordion", name: "core/accordion", version: 2, attrs: { heading: "Inside the notebook", body: "A little structure, plenty of possibility.", defaultOpen: sample === "outside" ? 99 : 1, items: empty ? [] : titles.map((title, i) => ({ title: long ? "W".repeat(120) : title, body: long ? "W".repeat(2000) : copy[i] })) } },
    { id: "family-faq", name: "core/faq", version: 2, attrs: { eyebrow: "Before you begin", heading: "A few good questions", body: "There is no perfect way to keep a notebook.", items: empty ? [] : [{ question: long ? "W".repeat(200) : "What should I write?", answer: long ? "W".repeat(1000) : copy[0] }, { question: "What if I miss a day?", answer: "Begin again.\nThe notebook can wait." }] } },
    { id: "family-tabs", name: "core/tabs", version: 2, attrs: { heading: "A practice of noticing", tabs: empty ? [] : titles.map((label, i) => ({ label: long ? "W".repeat(40) : label, body: long ? "W".repeat(2000) : copy[i] })) } },
    { id: "family-feature-tabs", name: "core/feature-tabs", version: 1, attrs: { tabs: empty ? [] : titles.map((label, i) => ({ label: long ? "W".repeat(80) : label, title: titles[i], body: rich(long ? "W".repeat(12000) : copy[i]), ...(i < 2 ? { media: { id: i === 0 ? "family-notebook" : "family-mug", alt: i === 0 ? "A field notebook" : "A ceramic mug" } } : {}) })) } },
    { id: "family-tabbed-content", name: "blocks/tabbed-content", version: 2, attrs: { heading: "Make room for the everyday", intro: "Useful objects, considered carefully.", tabs: empty ? [] : titles.map((label, i) => ({ label: long ? "W".repeat(60) : label, title: titles[i], body: long ? "W".repeat(3000) : copy[i], mediaId: i === 0 ? "family-notebook" : "", mediaAlt: "A field notebook", ctaLabel: "Explore the collection", ctaUrl: "/collection" })) } },
  ];
  return nodes.map(node => ({ ...node, layout: { width: "contained", spacing: "compact" } }));
}

export function DisclosureFamilyStudy({ packId }: { packId: string }) {
  const [sample, setSample] = useState("editorial");
  const [direction, setDirection] = useState<"ltr" | "rtl">("ltr");
  return <details className="canonical-study" data-disclosure-family>
    <summary>Interactive content: disclosures and tabs</summary>
    <label>Disclosure family sample <select value={sample} onChange={e => setSample(e.target.value)}>{["editorial", "empty", "maximum", "outside"].map(value => <option key={value}>{value}</option>)}</select></label>
    <label>Reading direction <select value={direction} onChange={e => setDirection(e.target.value as "ltr" | "rtl")}><option value="ltr">Left to right</option><option value="rtl">Right to left</option></select></label>
    <div data-disclosure-family-canvas dir={direction}>{prepareBlocks(disclosureFamilyTree(sample), stagedRenderers, { enabledPlugins: [], capabilities: ["reference.targetResolution"], disabledBlocks: [] }, { media: { "family-notebook": { src: notebook, alt: "A field notebook" }, "family-mug": { src: mug, alt: "A ceramic mug" } } }, undefined, packId)}</div>
  </details>;
}
