import { useState } from "react";
import { prepareBlocks } from "../src/templates/sdk/block-renderer/model";
import { stagedRenderers } from "../src/templates/sdk/block-renderer/discovery";

const text = (value: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: value }] }] });
const marks = ["bold", "italic", "strike", "underline", "code"];
export function TextFamilyStudy({ packId }: { packId: string }) {
  const [level, setLevel] = useState(2);
  const [sample, setSample] = useState("editorial");
  const [tone, setTone] = useState("default");
  const [align, setAlign] = useState("start");
  const heading = sample === "empty" ? null : text(sample === "maximum" ? "W".repeat(200) : "A little space. A better story.");
  const body = sample === "empty" ? { type: "doc", content: [] } : sample === "maximum" ? text("W".repeat(20000)) : {
    type: "doc", content: [
      { type: "paragraph", content: [
        { type: "text", text: "Every detail has a purpose. " },
        ...marks.flatMap(mark => [{ type: "text", text: mark, marks: [{ type: mark }] }, { type: "text", text: " · " }]),
        { type: "text", text: "A considered link", marks: [{ type: "link", attrs: { href: "https://example.com/story", target: "_blank" } }] },
        { type: "hardBreak" }, { type: "text", text: "And a fresh line, without a new paragraph." },
      ] },
      { type: "paragraph", content: [] },
      { type: "paragraph", content: [{ type: "text", text: "Keep the words. Let the template set the mood." }] },
    ],
  };
  const layout = { tone, align, spacing: "compact", width: "contained" };
  const tree = [
    { id: "family-heading", name: "core/heading", version: 2, attrs: { text: heading, level, anchor: "family-heading-target" }, layout },
    { id: "family-paragraph", name: "core/paragraph", version: 2, attrs: { body }, layout },
    { id: "family-divider", name: "core/divider", version: 2, attrs: {}, layout },
    { id: "family-spacer", name: "core/spacer", version: 2, attrs: {}, layout },
  ];
  return <details className="canonical-study" data-text-family>
    <summary>Text family: content and accessibility</summary>
    <label>Heading level <select value={level} onChange={e => setLevel(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6].map(n => <option key={n}>{n}</option>)}</select></label>
    <label>Content sample <select value={sample} onChange={e => setSample(e.target.value)}>{["editorial", "empty", "maximum"].map(v => <option key={v}>{v}</option>)}</select></label>
    <label>Text family tone <select value={tone} onChange={e => setTone(e.target.value)}>{["default", "muted", "inverted", "accent"].map(v => <option key={v}>{v}</option>)}</select></label>
    <label>Text family alignment <select value={align} onChange={e => setAlign(e.target.value)}>{["start", "center"].map(v => <option key={v}>{v}</option>)}</select></label>
    <div data-text-family-canvas>{prepareBlocks(tree, stagedRenderers, { enabledPlugins: [], capabilities: [], disabledBlocks: [] }, { media: {} }, undefined, packId)}</div>
  </details>;
}
