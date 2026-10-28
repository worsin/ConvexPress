/**
 * Knowledge Base System - KbDoc normalization
 *
 * `normalizeKbDoc` turns any ProseMirror-shaped value into a valid KbDoc v1:
 *   - documents from the admin editor;
 *   - TipTap JSON written by older ConvexPress builds (`image` nodes, level 1
 *     headings, `taskList`, unknown wrappers);
 *   - the loose tree `kbDocFromHtml` builds from legacy HTML.
 *
 * Unknown nodes are unwrapped (their children kept), unknown marks and
 * attributes are dropped, links with unsafe URLs lose the link, and figures
 * without a usable image are removed. The result never contains anything the
 * renderer does not know how to escape. Only a value that is not a document at
 * all, or one that exceeds KB_DOC_LIMITS, is refused.
 */

import { ConvexError } from "convex/values";

import {
  CONVEX_ID_PATTERN,
  KB_CALLOUT_TONES,
  KB_DOC_LIMITS,
  KB_DOC_VERSION,
  KB_FIGURE_FRAMES,
  KB_FIGURE_SIZES,
  type KbBlock,
  type KbCalloutTone,
  type KbDoc,
  type KbFigure,
  type KbFigureFrame,
  type KbFigureSize,
  type KbInline,
  type KbListItem,
  type KbMark,
  type KbTableCell,
  type KbTableRow,
  type KbText,
} from "./model";

type Loose = { type?: unknown; attrs?: unknown; content?: unknown; text?: unknown; marks?: unknown };

function refuse(message: string): never {
  throw new ConvexError({ code: "INVALID_CONTENT", message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function attrsOf(node: Loose): Record<string, unknown> {
  return isRecord(node.attrs) ? node.attrs : {};
}

function childrenOf(node: Loose): Loose[] {
  return Array.isArray(node.content) ? node.content.filter(isRecord) : [];
}

function str(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function intIn(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
}

/**
 * Link targets the renderer may emit: http(s), mailto, tel, a path within the
 * site, or an anchor on the same page. Protocol-relative (`//host`) and every
 * other scheme are refused.
 */
export function safeKbHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const href = value.trim();
  if (!href || href.length > KB_DOC_LIMITS.urlCharacters) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(href)) return null;
  if (href.startsWith("#")) return /^#[A-Za-z0-9][A-Za-z0-9_-]*$/.test(href) ? href : null;
  if (href.startsWith("/")) return href.startsWith("//") ? null : href;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(href)?.[1]?.toLowerCase();
  if (scheme === "http" || scheme === "https") {
    try {
      const url = new URL(href);
      return url.hostname ? url.toString() : null;
    } catch {
      return null;
    }
  }
  if (scheme === "mailto" || scheme === "tel") return href;
  return null;
}

/** Images may come from https URLs or the site's own paths. */
export function safeKbImageSrc(value: unknown): string | null {
  const href = safeKbHref(value);
  if (!href) return null;
  if (href.startsWith("/") || href.startsWith("https://")) return href;
  return null;
}

export function kbHeadingId(text: string): string {
  const id = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .slice(0, KB_DOC_LIMITS.headingIdCharacters)
    .replace(/-+$/, "");
  return /^[a-z]/.test(id) ? id : `section-${id || "1"}`.replace(/-+$/, "");
}

const MARK_ORDER: KbMark["type"][] = ["link", "bold", "italic", "underline", "strike", "ui", "kbd", "code"];

class Normalizer {
  private nodes = 0;
  private textCharacters = 0;
  private figures = 0;
  private readonly headingIds = new Set<string>();

  private count(depth: number) {
    if (++this.nodes > KB_DOC_LIMITS.nodes) refuse(`Article content has more than ${KB_DOC_LIMITS.nodes} elements.`);
    if (depth > KB_DOC_LIMITS.depth) refuse("Article content is nested too deeply.");
  }

  doc(value: unknown): KbDoc {
    if (!isRecord(value) || value.type !== "doc") refuse("Article content must be a document.");
    return { type: "doc", attrs: { version: KB_DOC_VERSION }, content: this.blocks(childrenOf(value), 1, "doc") };
  }

  /** Block content, with loose inline content wrapped into paragraphs. */
  private blocks(nodes: Loose[], depth: number, parent: "doc" | "container" | "callout" | "cell" | "item"): KbBlock[] {
    const result: KbBlock[] = [];
    let pending: KbInline[] = [];
    const flush = () => {
      const content = trimInline(pending);
      if (content.length) result.push({ type: "paragraph", content });
      pending = [];
    };
    for (const node of nodes) {
      if (node.type === "text" || node.type === "hardBreak" || isInlineWrapper(node.type)) {
        pending.push(...this.inline([node], depth, []));
        continue;
      }
      flush();
      result.push(...this.block(node, depth, parent));
    }
    flush();
    return result;
  }

  private block(node: Loose, depth: number, parent: "doc" | "container" | "callout" | "cell" | "item"): KbBlock[] {
    this.count(depth);
    const attrs = attrsOf(node);
    switch (node.type) {
      case "paragraph": {
        const content = trimInline(this.inline(childrenOf(node), depth + 1, []));
        return content.length ? [{ type: "paragraph", content }] : [];
      }
      case "heading": {
        const content = trimInline(this.inline(childrenOf(node), depth + 1, []));
        if (!content.length) return [];
        const level = intIn(attrs.level, 1, 6, 2);
        // Headings inside callouts, cells and list items read as bold lines.
        if (parent !== "doc") return [{ type: "paragraph", content: content.map(boldText) }];
        return [{ type: "heading", attrs: { level: level <= 2 ? 2 : level === 3 ? 3 : 4, id: this.headingId(attrs.id, content) }, content }];
      }
      case "bulletList":
      case "taskList": {
        const items = this.items(childrenOf(node), depth + 1);
        return items.length ? [{ type: "bulletList", content: items }] : [];
      }
      case "orderedList": {
        const items = this.items(childrenOf(node), depth + 1);
        if (!items.length) return [];
        return [{ type: "orderedList", attrs: { start: intIn(attrs.start, 1, 10_000, 1), kind: attrs.kind === "steps" ? "steps" : "list" }, content: items }];
      }
      case "listItem":
      case "taskItem": {
        const items = this.items([node], depth);
        return items.length ? [{ type: "bulletList", content: items }] : [];
      }
      case "blockquote": {
        const content = this.blocks(childrenOf(node), depth + 1, "container");
        return content.length ? [{ type: "blockquote", content }] : [];
      }
      case "callout": {
        const content = this.blocks(childrenOf(node), depth + 1, "callout").filter((block) => block.type !== "callout" && block.type !== "table" && block.type !== "details");
        if (!content.length) return [];
        const tone: KbCalloutTone = oneOf(attrs.tone, KB_CALLOUT_TONES, "note");
        return [{ type: "callout", attrs: { tone, title: str(attrs.title, KB_DOC_LIMITS.calloutTitleCharacters) }, content }];
      }
      case "figure":
      case "image": {
        const figure = this.figure(attrs);
        return figure ? [figure] : [];
      }
      case "codeBlock": {
        const text = rawText(node).replace(/\r\n?/g, "\n");
        this.text(text);
        const language = str(attrs.language, KB_DOC_LIMITS.languageCharacters).toLowerCase().replace(/[^a-z0-9+#.-]/g, "");
        return [{ type: "codeBlock", attrs: { language }, ...(text ? { content: [{ type: "text", text }] } : {}) }];
      }
      case "horizontalRule":
        return [{ type: "horizontalRule" }];
      case "table": {
        if (parent !== "doc" && parent !== "container") return this.blocks(childrenOf(node), depth + 1, parent);
        const rows = childrenOf(node)
          .flatMap((row) => (row.type === "tableRow" ? [row] : childrenOf(row).filter((r) => r.type === "tableRow")))
          .slice(0, KB_DOC_LIMITS.tableRows)
          .map((row) => this.row(row, depth + 1))
          .filter((row): row is KbTableRow => row !== null);
        return rows.length ? [{ type: "table", content: rows }] : [];
      }
      case "details": {
        const content = this.blocks(childrenOf(node).filter((child) => child.type !== "detailsSummary"), depth + 1, "container");
        const summaryNode = childrenOf(node).find((child) => child.type === "detailsSummary");
        const summary = str(attrs.summary, KB_DOC_LIMITS.summaryCharacters) || (summaryNode ? str(rawText(summaryNode), KB_DOC_LIMITS.summaryCharacters) : "");
        if (!summary && !content.length) return [];
        return [{ type: "details", attrs: { summary: summary || "Details", open: attrs.open === true }, content }];
      }
      default:
        // Wrappers (div, section, detailsContent, unknown extensions): keep the children.
        return this.blocks(childrenOf(node), depth + 1, parent);
    }
  }

  private items(nodes: Loose[], depth: number): KbListItem[] {
    const items: KbListItem[] = [];
    for (const node of nodes) {
      this.count(depth);
      if (node.type === "listItem" || node.type === "taskItem") {
        const content = this.blocks(childrenOf(node), depth + 1, "item").filter((block) => block.type !== "table");
        if (content.length) items.push({ type: "listItem", content });
      } else if (node.type === "bulletList" || node.type === "orderedList") {
        // A list directly inside a list belongs to the previous item.
        const nested = this.block(node, depth, "item");
        const last = items[items.length - 1];
        if (last) last.content.push(...nested);
        else if (nested.length) items.push({ type: "listItem", content: nested });
      } else {
        const content = this.blocks([node], depth + 1, "item");
        if (content.length) items.push({ type: "listItem", content });
      }
    }
    return items;
  }

  private row(node: Loose, depth: number): KbTableRow | null {
    this.count(depth);
    const cells: KbTableCell[] = childrenOf(node)
      .filter((cell) => cell.type === "tableCell" || cell.type === "tableHeader")
      .slice(0, KB_DOC_LIMITS.tableColumns)
      .map((cell) => {
        this.count(depth + 1);
        const attrs = attrsOf(cell);
        const content = this.blocks(childrenOf(cell), depth + 2, "cell").filter((block) => block.type === "paragraph" || block.type === "bulletList" || block.type === "orderedList");
        return {
          type: cell.type === "tableHeader" ? "tableHeader" : "tableCell",
          attrs: { colspan: intIn(attrs.colspan, 1, KB_DOC_LIMITS.tableColumns, 1), rowspan: intIn(attrs.rowspan, 1, KB_DOC_LIMITS.tableRows, 1) },
          content: content.length ? content : [{ type: "paragraph" }],
        };
      });
    return cells.length ? { type: "tableRow", content: cells } : null;
  }

  private figure(attrs: Record<string, unknown>): KbFigure | null {
    const mediaId = typeof attrs.mediaId === "string" && CONVEX_ID_PATTERN.test(attrs.mediaId) ? attrs.mediaId : null;
    const src = mediaId ? null : safeKbImageSrc(attrs.src);
    if (!mediaId && !src) return null;
    if (++this.figures > KB_DOC_LIMITS.figures) refuse(`Article content has more than ${KB_DOC_LIMITS.figures} images.`);
    const size: KbFigureSize = oneOf(attrs.size, KB_FIGURE_SIZES, "content");
    const frame: KbFigureFrame = oneOf(attrs.frame, KB_FIGURE_FRAMES, "none");
    const alt = str(attrs.alt, KB_DOC_LIMITS.altCharacters);
    const caption = str(attrs.caption ?? attrs.title, KB_DOC_LIMITS.captionCharacters);
    this.text(alt + caption);
    return { type: "figure", attrs: { mediaId, src, alt, caption, size, frame } };
  }

  private inline(nodes: Loose[], depth: number, inherited: KbMark[]): KbInline[] {
    const result: KbInline[] = [];
    for (const node of nodes) {
      this.count(depth);
      if (node.type === "hardBreak") {
        result.push({ type: "hardBreak" });
        continue;
      }
      if (node.type === "text") {
        const text = typeof node.text === "string" ? node.text : "";
        if (!text) continue;
        this.text(text);
        const marks = mergeMarks(inherited, this.marks(node.marks, depth));
        result.push(marks.length ? { type: "text", text, marks } : { type: "text", text });
        continue;
      }
      // An inline wrapper (legacy) or a block found inside inline content:
      // keep its text so nothing the author wrote disappears.
      const wrapperMarks = isInlineWrapper(node.type) ? this.marks(node.marks, depth) : [];
      result.push(...this.inline(childrenOf(node), depth + 1, mergeMarks(inherited, wrapperMarks)));
    }
    return mergeAdjacentText(result);
  }

  private marks(value: unknown, depth: number): KbMark[] {
    if (!Array.isArray(value)) return [];
    const marks: KbMark[] = [];
    for (const raw of value) {
      if (!isRecord(raw)) continue;
      this.count(depth);
      const type = raw.type;
      switch (type) {
        case "bold":
        case "strong":
          marks.push({ type: "bold" });
          break;
        case "italic":
        case "em":
          marks.push({ type: "italic" });
          break;
        case "underline":
        case "strike":
        case "code":
        case "kbd":
        case "ui":
          marks.push({ type });
          break;
        case "link": {
          const attrs = isRecord(raw.attrs) ? raw.attrs : {};
          const articleId = typeof attrs.articleId === "string" && CONVEX_ID_PATTERN.test(attrs.articleId) ? attrs.articleId : null;
          const anchor = articleId && typeof attrs.anchor === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(attrs.anchor) ? attrs.anchor : null;
          const href = articleId ? null : safeKbHref(attrs.href);
          if (articleId || href) marks.push({ type: "link", attrs: { href, articleId, anchor } });
          break;
        }
        default:
          break;
      }
    }
    return mergeMarks([], marks);
  }

  private headingId(requested: unknown, content: KbInline[]): string {
    let base = typeof requested === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(requested) ? requested : kbHeadingId(inlineText(content));
    if (!base) base = "section";
    let id = base;
    for (let n = 2; this.headingIds.has(id); n++) id = `${base.slice(0, KB_DOC_LIMITS.headingIdCharacters - 4)}-${n}`;
    this.headingIds.add(id);
    return id;
  }

  private text(text: string) {
    this.textCharacters += text.length;
    if (this.textCharacters > KB_DOC_LIMITS.textCharacters) refuse("Article content is too long.");
  }
}

function isInlineWrapper(type: unknown): boolean {
  return type === "span" || type === "inline";
}

function rawText(node: Loose): string {
  if (node.type === "text") return typeof node.text === "string" ? node.text : "";
  if (node.type === "hardBreak") return "\n";
  return childrenOf(node).map(rawText).join("");
}

function inlineText(content: KbInline[]): string {
  return content.map((node) => (node.type === "text" ? node.text : " ")).join("");
}

function boldText(node: KbInline): KbInline {
  if (node.type !== "text") return node;
  return { ...node, marks: mergeMarks(node.marks ?? [], [{ type: "bold" }]) };
}

function markKey(mark: KbMark): string {
  return mark.type === "link" ? `link:${mark.attrs.articleId ?? ""}#${mark.attrs.anchor ?? ""}|${mark.attrs.href ?? ""}` : mark.type;
}

/** One mark of each type (the innermost link wins), in a fixed order. */
function mergeMarks(outer: KbMark[], inner: KbMark[]): KbMark[] {
  const byType = new Map<KbMark["type"], KbMark>();
  for (const mark of [...outer, ...inner]) byType.set(mark.type, mark);
  // Code and kbd text is literal; it carries no other formatting but a link.
  if (byType.has("code") || byType.has("kbd")) {
    for (const type of ["bold", "italic", "underline", "strike", "ui"] as const) byType.delete(type);
    if (byType.has("code")) byType.delete("kbd");
  }
  return MARK_ORDER.flatMap((type) => {
    const mark = byType.get(type);
    return mark ? [mark] : [];
  });
}

function sameMarks(left: KbMark[] | undefined, right: KbMark[] | undefined): boolean {
  const a = (left ?? []).map(markKey).join(","), b = (right ?? []).map(markKey).join(",");
  return a === b;
}

function mergeAdjacentText(nodes: KbInline[]): KbInline[] {
  const result: KbInline[] = [];
  for (const node of nodes) {
    const last = result[result.length - 1];
    if (node.type === "text" && last?.type === "text" && sameMarks(last.marks, node.marks)) {
      result[result.length - 1] = { ...last, text: last.text + node.text } satisfies KbText;
    } else result.push(node);
  }
  return result;
}

/** Drop breaks and whitespace at the edges of a block. */
function trimInline(nodes: KbInline[]): KbInline[] {
  const result = [...nodes];
  while (result[0] && (result[0].type === "hardBreak" || !result[0].text.trim())) result.shift();
  while (result.length) {
    const last = result[result.length - 1]!;
    if (last.type === "hardBreak" || !last.text.trim()) result.pop();
    else break;
  }
  const first = result[0], last = result[result.length - 1];
  if (first?.type === "text") result[0] = { ...first, text: first.text.trimStart() };
  if (last?.type === "text") result[result.length - 1] = { ...(result[result.length - 1] as KbText), text: (result[result.length - 1] as KbText).text.trimEnd() };
  return result;
}

/** Normalize any document-shaped value into a valid KbDoc v1. */
export function normalizeKbDoc(value: unknown): KbDoc {
  return new Normalizer().doc(value);
}
