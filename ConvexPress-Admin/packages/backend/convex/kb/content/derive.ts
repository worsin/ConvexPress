/**
 * Knowledge Base System - fields derived from a KbDoc
 *
 * The plain text (search, RAG, Meilisearch, excerpts), the outline (table of
 * contents and deep links), reading time, and the media and article ids an
 * article references. Writers never supply these; the server computes them
 * from the normalized document on every write.
 */

import type { KbBlock, KbDoc, KbInline, KbOutlineEntry } from "./model";

const WORDS_PER_MINUTE = 200;
/** A screenshot takes a reader about as long as a short paragraph. */
const SECONDS_PER_FIGURE = 12;

function inlineText(content: KbInline[] | undefined): string {
  return (content ?? []).map((node) => (node.type === "text" ? node.text : "\n")).join("");
}

function blockText(block: KbBlock, out: string[]) {
  switch (block.type) {
    case "paragraph":
    case "heading":
      out.push(inlineText(block.content));
      return;
    case "codeBlock":
      out.push(inlineText(block.content));
      return;
    case "bulletList":
    case "orderedList":
      for (const item of block.content) for (const child of item.content) blockText(child, out);
      return;
    case "blockquote":
      for (const child of block.content) blockText(child, out);
      return;
    case "callout":
      if (block.attrs.title) out.push(block.attrs.title);
      for (const child of block.content) blockText(child, out);
      return;
    case "details":
      out.push(block.attrs.summary);
      for (const child of block.content) blockText(child, out);
      return;
    case "figure":
      // Alt text and captions describe the screenshot; readers search for them.
      if (block.attrs.alt) out.push(block.attrs.alt);
      if (block.attrs.caption) out.push(block.attrs.caption);
      return;
    case "table":
      for (const row of block.content) out.push(row.content.map((cell) => {
        const parts: string[] = [];
        for (const child of cell.content) blockText(child, parts);
        return parts.join(" ");
      }).join(" · "));
      return;
    case "horizontalRule":
      return;
  }
}

/** One line per block, whitespace collapsed within each line. */
export function kbPlainText(doc: KbDoc): string {
  const lines: string[] = [];
  for (const block of doc.content) blockText(block, lines);
  return lines
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function kbOutline(doc: KbDoc): KbOutlineEntry[] {
  return doc.content.flatMap((block) =>
    block.type === "heading"
      ? [{ id: block.attrs.id, level: block.attrs.level, text: inlineText(block.content).replace(/\s+/g, " ").trim() }]
      : [],
  );
}

function walk(blocks: KbBlock[], visit: (block: KbBlock) => void) {
  for (const block of blocks) {
    visit(block);
    switch (block.type) {
      case "bulletList":
      case "orderedList":
        for (const item of block.content) walk(item.content, visit);
        break;
      case "blockquote":
      case "callout":
      case "details":
        walk(block.content, visit);
        break;
      case "table":
        for (const row of block.content) for (const cell of row.content) walk(cell.content, visit);
        break;
      default:
        break;
    }
  }
}

function inlineOf(block: KbBlock): KbInline[] {
  return block.type === "paragraph" || block.type === "heading" ? block.content ?? [] : [];
}

export function kbMediaIds(doc: KbDoc): string[] {
  const ids = new Set<string>();
  walk(doc.content, (block) => {
    if (block.type === "figure" && block.attrs.mediaId) ids.add(block.attrs.mediaId);
  });
  return [...ids];
}

export function kbLinkedArticleIds(doc: KbDoc): string[] {
  const ids = new Set<string>();
  walk(doc.content, (block) => {
    for (const node of inlineOf(block)) {
      if (node.type !== "text") continue;
      for (const mark of node.marks ?? []) if (mark.type === "link" && mark.attrs.articleId) ids.add(mark.attrs.articleId);
    }
  });
  return [...ids];
}

export function kbFigureCount(doc: KbDoc): number {
  let figures = 0;
  walk(doc.content, (block) => {
    if (block.type === "figure") figures++;
  });
  return figures;
}

export function kbReadingTimeMinutes(plainText: string, figures: number): number {
  const words = plainText.split(/\s+/).filter(Boolean).length;
  const seconds = (words / WORDS_PER_MINUTE) * 60 + figures * SECONDS_PER_FIGURE;
  return Math.max(1, Math.round(seconds / 60));
}

/** The first paragraphs' text, cut at a word boundary. */
export function kbExcerpt(doc: KbDoc, maxLength = 300): string {
  const parts: string[] = [];
  for (const block of doc.content) {
    if (block.type === "heading" && parts.length) break;
    if (block.type === "paragraph") parts.push(inlineText(block.content).replace(/\s+/g, " ").trim());
    if (parts.join(" ").length >= maxLength) break;
  }
  const text = parts.filter(Boolean).join(" ") || kbPlainText(doc).replace(/\n/g, " ");
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const space = cut.lastIndexOf(" ");
  return `${(space > maxLength * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}
