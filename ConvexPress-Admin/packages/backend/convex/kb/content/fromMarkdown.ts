/**
 * Knowledge Base System - a small Markdown dialect to KbDoc
 *
 * For content written in code (a site's help-center setup, say), where KbDoc
 * JSON is too verbose to author by hand. The result goes through
 * normalizeKbDoc, so anything this produces is a valid stored document.
 *
 * Blocks (separated by blank lines):
 *   ## Heading / ### / ####        `#` is read as `##` (the title is the h1)
 *   paragraph                      single line breaks join with a space
 *   - item / * item                bullet list
 *   1. item                        numbered list
 *   ::: steps  (numbered list) :::  a numbered list shown as steps
 *   ::: tip|note|warning|important Title  …  :::   callout
 *   ::: details Summary  …  :::    collapsed section
 *   ![alt](media:<ref> "caption"){wide|full|plain}   figure, alone on its line;
 *                                  framed as a screenshot unless {plain}
 *   | a | b |  /  |---|---|  / rows  table (first row is the header)
 *   ---                            horizontal rule
 *
 * Inline: **bold**, *italic*, `code`, ++kbd++, {{UI label}}, [text](href),
 * [text](article:<ref>#anchor). References (`<ref>`) are resolved by the
 * caller; an article or image that doesn't resolve is dropped (a link keeps
 * its text). Lists hold paragraphs; list items don't nest.
 */

import type { KbBlock, KbDoc, KbInline, KbListItem, KbMark } from "./model";
import { KB_DOC_VERSION } from "./model";
import { normalizeKbDoc } from "./normalize";

export type KbMarkdownResolvers = {
  /** An article's id for `article:<ref>` links, or null when it doesn't exist yet. */
  article?: (ref: string) => string | null;
  /** A media library id for `media:<ref>` figures, or null when it isn't uploaded. */
  media?: (ref: string) => string | null;
};

const CALLOUT_TONES = new Set(["tip", "note", "warning", "important"]);
const FENCE_OPEN = /^:::\s*([a-z]+)\s*(.*)$/;
const FIGURE = /^!\[([^\]]*)\]\(media:([^\s)]+)(?:\s+"([^"]*)")?\)(?:\{(wide|full|plain)\})?$/;
const TABLE_RULE = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/;

export function kbDocFromMarkdown(markdown: string, resolve: KbMarkdownResolvers = {}): KbDoc {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const content = parseBlocks(lines, resolve);
  return normalizeKbDoc({ type: "doc", attrs: { version: KB_DOC_VERSION }, content });
}

function parseBlocks(lines: string[], resolve: KbMarkdownResolvers): KbBlock[] {
  const blocks: KbBlock[] = [];
  let i = 0;
  const isBlank = (line: string | undefined) => line === undefined || line.trim() === "";
  while (i < lines.length) {
    const line = lines[i]!.trim();
    if (!line) {
      i++;
      continue;
    }

    const fence = FENCE_OPEN.exec(line);
    if (fence && fence[1]) {
      // Find the matching close, allowing nested fences.
      let depth = 1;
      let end = i + 1;
      for (; end < lines.length; end++) {
        const inner = lines[end]!.trim();
        if (/^:::\s*$/.test(inner)) depth--;
        else if (FENCE_OPEN.test(inner)) depth++;
        if (depth === 0) break;
      }
      const inner = parseBlocks(lines.slice(i + 1, end), resolve);
      const kind = fence[1];
      const label = (fence[2] ?? "").trim();
      if (kind === "steps") {
        for (const block of inner) blocks.push(block.type === "orderedList" ? { ...block, attrs: { ...block.attrs, kind: "steps" } } : block);
      } else if (kind === "details") {
        blocks.push({ type: "details", attrs: { summary: label || "Details", open: false }, content: inner });
      } else if (CALLOUT_TONES.has(kind)) {
        blocks.push({ type: "callout", attrs: { tone: kind as "tip", title: label }, content: inner });
      } else {
        blocks.push(...inner);
      }
      i = end + 1;
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading && heading[1] && heading[2]) {
      const level = Math.max(2, heading[1].length) as 2 | 3 | 4;
      blocks.push({ type: "heading", attrs: { level, id: "" }, content: parseInline(heading[2], resolve) });
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(line)) {
      blocks.push({ type: "horizontalRule" });
      i++;
      continue;
    }

    const figure = FIGURE.exec(line);
    if (figure && figure[2]) {
      const mediaId = resolve.media?.(figure[2]) ?? null;
      if (mediaId) {
        const option = figure[4];
        blocks.push({
          type: "figure",
          attrs: {
            mediaId,
            src: null,
            alt: figure[1] ?? "",
            caption: figure[3] ?? "",
            size: option === "wide" || option === "full" ? option : "content",
            frame: option === "plain" ? "none" : "screenshot",
          },
        });
      }
      i++;
      continue;
    }

    if (line.startsWith("|") && TABLE_RULE.test((lines[i + 1] ?? "").trim())) {
      const rows: string[][] = [];
      for (; i < lines.length && lines[i]!.trim().startsWith("|"); i++) {
        if (rows.length === 1 && TABLE_RULE.test(lines[i]!.trim())) continue;
        rows.push(splitRow(lines[i]!.trim()));
      }
      blocks.push({
        type: "table",
        content: rows.map((cells, rowIndex) => ({
          type: "tableRow",
          content: cells.map((cell) => ({
            type: rowIndex === 0 ? "tableHeader" : "tableCell",
            attrs: { colspan: 1, rowspan: 1 },
            content: [{ type: "paragraph", content: parseInline(cell, resolve) }],
          })),
        })),
      });
      continue;
    }

    const bullet = /^[-*]\s+/;
    const numbered = /^\d+[.)]\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const marker = ordered ? numbered : bullet;
      const items: KbListItem[] = [];
      let start = 1;
      if (ordered) start = Number.parseInt(line, 10) || 1;
      while (i < lines.length && marker.test(lines[i]!.trim())) {
        const parts = [lines[i]!.trim().replace(marker, "")];
        i++;
        // Indented lines continue the item; a blank line followed by an indented line adds a paragraph.
        const paragraphs: string[][] = [parts];
        while (i < lines.length) {
          const next = lines[i]!;
          if (!isBlank(next) && /^\s{2,}\S/.test(next) && !marker.test(next.trim())) {
            paragraphs[paragraphs.length - 1]!.push(next.trim());
            i++;
          } else if (isBlank(next) && /^\s{2,}\S/.test(lines[i + 1] ?? "") && !marker.test((lines[i + 1] ?? "").trim())) {
            paragraphs.push([]);
            i++;
          } else break;
        }
        items.push({ type: "listItem", content: paragraphs.filter((p) => p.length).map((p) => ({ type: "paragraph", content: parseInline(p.join(" "), resolve) })) });
        // A blank line between items of the same list doesn't end it.
        if (isBlank(lines[i]) && marker.test((lines[i + 1] ?? "").trim())) i++;
      }
      blocks.push(ordered ? { type: "orderedList", attrs: { start, kind: "list" }, content: items } : { type: "bulletList", content: items });
      continue;
    }

    // Paragraph: until a blank line or the start of another block.
    const text: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i]!.trim();
      if (!next || /^(#{1,4}\s|:::|[-*]\s|\d+[.)]\s|\||!\[)/.test(next) || /^(-{3,}|\*{3,})$/.test(next)) break;
      text.push(next);
      i++;
    }
    blocks.push({ type: "paragraph", content: parseInline(text.join(" "), resolve) });
  }
  return blocks;
}

function splitRow(row: string): string[] {
  return row
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

/** Inline tokens, outermost first. Marks don't nest except inside link text. */
const INLINE = /\*\*(.+?)\*\*|\{\{(.+?)\}\}|\+\+(.+?)\+\+|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?![*\w])/g;

function parseInline(text: string, resolve: KbMarkdownResolvers, marks: KbMark[] = []): KbInline[] {
  const out: KbInline[] = [];
  const push = (value: string, extra: KbMark[] = []) => {
    if (value) out.push({ type: "text", text: value, ...(marks.length || extra.length ? { marks: [...marks, ...extra] } : {}) });
  };
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    push(text.slice(last, at));
    last = at + match[0].length;
    if (match[1] !== undefined) out.push(...parseInline(match[1], resolve, [...marks, { type: "bold" }]));
    else if (match[2] !== undefined) push(match[2], [{ type: "ui" }]);
    else if (match[3] !== undefined) push(match[3], [{ type: "kbd" }]);
    else if (match[4] !== undefined) push(match[4], [{ type: "code" }]);
    else if (match[5] !== undefined && match[6] !== undefined) {
      const target = match[6];
      let link: KbMark | null = null;
      if (target.startsWith("article:")) {
        const [ref = "", anchor = null] = target.slice("article:".length).split("#");
        const articleId = resolve.article?.(ref) ?? null;
        if (articleId) link = { type: "link", attrs: { href: null, articleId, anchor } };
      } else {
        link = { type: "link", attrs: { href: target, articleId: null, anchor: null } };
      }
      out.push(...parseInline(match[5], resolve, link ? [...marks, link] : marks));
    } else if (match[7] !== undefined) out.push(...parseInline(match[7], resolve, [...marks, { type: "italic" }]));
  }
  push(text.slice(last));
  return out;
}
