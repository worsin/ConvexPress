import { useState } from "react";
import { prepareBlocks } from "../src/templates/sdk/block-renderer/model";
import { stagedRenderers } from "../src/templates/sdk/block-renderer/discovery";

const rich = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
export function contentFamilyTree(style = "bullet", kind = "note", sample = "editorial") {
  const empty = sample === "empty";
  const long = sample === "maximum";
  const nodes = [
    { id: "content-list", name: "core/list", version: 2, attrs: { style, items: empty ? [] : [
      { text: rich(long ? "W".repeat(500) : "Choose a place you know well."), done: true },
      { text: rich("Notice one thing you have never noticed before."), done: false },
      { text: rich("Write it down before the detail disappears.") },
    ] } },
    { id: "content-quote", name: "core/quote", version: 2, attrs: {
      text: empty ? null : long ? "W".repeat(800) : "The smallest details often tell the most honest story.",
      cite: long ? "W".repeat(120) : "Notes from the studio", source: empty ? "" : "https://example.com/notebook",
    } },
    { id: "content-definitions", name: "core/definition-list", version: 1, attrs: { items: empty ? [] : [
      { term: long ? "W".repeat(160) : "Field note", definition: rich(long ? "W".repeat(12000) : "A short observation recorded where it happened. Specific, immediate, and entirely your own.") },
      { term: "Reading measure", definition: rich("The width of a line of text. A comfortable measure gives the eye a clear path through an idea.") },
    ] } },
    { id: "content-callout", name: "core/callout", version: 1, attrs: { kind, title: empty ? "" : long ? "W".repeat(160) : "Leave room for a surprise", body: rich(empty ? "" : long ? "W".repeat(12000) : "A useful notebook holds questions as well as answers. Keep a little space for what comes next.") } },
    { id: "content-code", name: "core/code", version: 2, attrs: {
      language: sample === "unknown" ? "unregistered" : "typescript", filename: long ? "W".repeat(120) : "field-note.ts",
      code: empty ? "" : long ? "const observation = '" + "W".repeat(2000) + "';" : "// Keep the observation, not the noise.\nexport const note = {\n  place: 'The workroom',\n  detail: 'Light on the north wall',\n  revisited: true,\n};",
    } },
    { id: "content-pullquote", name: "core/pullquote", version: 1, attrs: { text: empty ? "" : long ? "W".repeat(3000) : "Make a little time.\nNotice a little more.", cite: long ? "W".repeat(240) : "A practice worth keeping" } },
  ];
  return nodes.map(node => ({ ...node, layout: { width: "contained", spacing: "compact" } }));
}

export function ContentFamilyStudy({ packId }: { packId: string }) {
  const [style, setStyle] = useState("bullet");
  const [kind, setKind] = useState("note");
  const [sample, setSample] = useState("editorial");
  return <details className="canonical-study" data-content-family>
    <summary>Editorial content: lists, quotations and code</summary>
    <label>List presentation <select value={style} onChange={e => setStyle(e.target.value)}>{["bullet", "ordered", "task"].map(value => <option key={value}>{value}</option>)}</select></label>
    <label>Content family sample <select value={sample} onChange={e => setSample(e.target.value)}>{["editorial", "empty", "maximum", "unknown"].map(value => <option key={value}>{value}</option>)}</select></label>
    <label>Callout kind <select value={kind} onChange={e => setKind(e.target.value)}>{["note", "tip", "important", "warning"].map(value => <option key={value}>{value}</option>)}</select></label>
    <div data-content-family-canvas>{prepareBlocks(contentFamilyTree(style, kind, sample), stagedRenderers, { enabledPlugins: [], capabilities: [], disabledBlocks: [] }, { media: {} }, undefined, packId)}</div>
  </details>;
}
