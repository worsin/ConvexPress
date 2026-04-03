/**
 * renderContent - TipTap JSON-to-HTML Rendering Pipeline
 *
 * Converts TipTap document JSON (stored in Convex) into safe HTML strings
 * for the website frontend SSR rendering.
 *
 * Handles all standard TipTap nodes (paragraph, heading, list, table, etc.)
 * as well as all custom ConvexPress block extensions:
 *   - callout (info/warning/error/success)
 *   - embed (YouTube/Vimeo/Twitter/generic)
 *   - button (CTA with variant/alignment)
 *   - spacer (configurable height)
 *   - divider (solid/dashed/dotted/double)
 *   - columns (2/3/4 column layouts)
 *   - reusableBlock (resolved externally before rendering)
 *
 * Security: All user-supplied text is HTML-escaped. URLs are validated.
 */
import { parseTipTapDocument } from "@/lib/schemas/content";
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
/** A TipTap JSON node */
interface TipTapNode {
  type: string;
  attrs?: Record<string, any>;
  content?: TipTapNode[];
  text?: string;
  marks?: TipTapMark[];
}
/** A TipTap inline mark */
interface TipTapMark {
  type: string;
  attrs?: Record<string, any>;
}
/** Options for rendering */
export interface RenderOptions {
  /** Resolved reusable blocks: map of blockId -> rendered HTML */
  reusableBlocks?: Map<string, string>;
  /** Base URL for relative links */
  baseUrl?: string;
  /** Whether to add heading IDs for anchor linking */
  headingIds?: boolean;
  /** Whether to add lazy loading to images */
  lazyLoadImages?: boolean;
  /** Whether to wrap embeds in responsive containers */
  responsiveEmbeds?: boolean;
}
const DEFAULT_OPTIONS: Required<RenderOptions> = {
  reusableBlocks: new Map(),
  baseUrl: "",
  headingIds: true,
  lazyLoadImages: true,
  responsiveEmbeds: true,
};
// ---------------------------------------------------------------------------
// Main Entry
// ---------------------------------------------------------------------------
/**
 * Render a TipTap JSON document to an HTML string.
 *
 * @param json - JSON string or parsed TipTap document object
 * @param options - Rendering options
 * @returns Safe HTML string
 */
export function renderContent(
  json: string | TipTapNode | null | undefined,
  options?: RenderOptions,
): string {
  if (!json) return "";
  const opts = { ...DEFAULT_OPTIONS, ...options };
  // Use Zod-validated parsing for type safety
  const validatedDoc = parseTipTapDocument(json);
  if (!validatedDoc || !validatedDoc.content) return "";
  // Cast to internal TipTapNode type for rendering
  const doc = validatedDoc as unknown as TipTapNode;
  if (doc.type !== "doc" || !doc.content) return "";
  return doc.content.map((node) => renderNode(node, opts)).join("");
}
/**
 * Extract plain text from a TipTap JSON document (for excerpts, search).
 */
export function extractPlainText(
  json: string | TipTapNode | null | undefined,
): string {
  if (!json) return "";
  // Use Zod-validated parsing for type safety
  const validatedDoc = parseTipTapDocument(json);
  if (!validatedDoc || !validatedDoc.content) return "";
  const doc = validatedDoc as unknown as TipTapNode;
  return extractText(doc).trim();
}
/**
 * Count words in a TipTap JSON document.
 */
export function countWords(
  json: string | TipTapNode | null | undefined,
): number {
  const text = extractPlainText(json);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}
/**
 * Estimate reading time in minutes.
 */
export function estimateReadingTime(
  json: string | TipTapNode | null | undefined,
  wordsPerMinute = 200,
): number {
  const words = countWords(json);
  return Math.max(1, Math.ceil(words / wordsPerMinute));
}
// ---------------------------------------------------------------------------
// Node Rendering
// ---------------------------------------------------------------------------
function renderNode(node: TipTapNode, opts: Required<RenderOptions>): string {
  switch (node.type) {
    case "paragraph":
      return renderParagraph(node, opts);
    case "heading":
      return renderHeading(node, opts);
    case "bulletList":
      return renderList(node, "ul", opts);
    case "orderedList":
      return renderList(node, "ol", opts);
    case "listItem":
      return renderListItem(node, opts);
    case "taskList":
      return renderTaskList(node, opts);
    case "taskItem":
      return renderTaskItem(node, opts);
    case "blockquote":
      return renderBlockquote(node, opts);
    case "codeBlock":
      return renderCodeBlock(node, opts);
    case "horizontalRule":
      return "<hr />";
    case "hardBreak":
      return "<br />";
    case "image":
      return renderImage(node, opts);
    case "table":
      return renderTable(node, opts);
    case "tableRow":
      return renderTableRow(node, opts);
    case "tableCell":
      return renderTableCell(node, "td", opts);
    case "tableHeader":
      return renderTableCell(node, "th", opts);
    // Custom blocks
    case "callout":
      return renderCallout(node, opts);
    case "embed":
      return renderEmbed(node, opts);
    case "button":
      return renderButton(node, opts);
    case "spacer":
      return renderSpacer(node, opts);
    case "divider":
      return renderDivider(node, opts);
    case "columns":
      return renderColumns(node, opts);
    case "column":
      return renderColumn(node, opts);
    case "reusableBlock":
      return renderReusableBlock(node, opts);
    case "text":
      return renderText(node);
    default:
      // Fallback: render content if it exists
      if (node.content) {
        return node.content.map((n) => renderNode(n, opts)).join("");
      }
      return "";
  }
}
// ---------------------------------------------------------------------------
// Standard Nodes
// ---------------------------------------------------------------------------
function renderParagraph(
  node: TipTapNode,
  opts: Required<RenderOptions>,
): string {
  const textAlign = node.attrs?.textAlign;
  const style = textAlign && textAlign !== "left"
    ? ` style="text-align: ${escapeAttr(textAlign)};"`
    : "";
  const inner = renderInline(node, opts);
  return `<p${style}>${inner}</p>`;
}
function renderHeading(
  node: TipTapNode,
  opts: Required<RenderOptions>,
): string {
  const level = Math.min(6, Math.max(1, node.attrs?.level || 2));
  const tag = `h${level}`;
  const inner = renderInline(node, opts);
  let idAttr = "";
  if (opts.headingIds) {
    const slug = slugify(extractText(node));
    if (slug) {
      idAttr = ` id="${escapeAttr(slug)}"`;
    }
  }
  const textAlign = node.attrs?.textAlign;
  const style = textAlign && textAlign !== "left"
    ? ` style="text-align: ${escapeAttr(textAlign)};"`
    : "";
  return `<${tag}${idAttr}${style}>${inner}</${tag}>`;
}
function renderList(
  node: TipTapNode,
  tag: "ul" | "ol",
  opts: Required<RenderOptions>,
): string {
  const attrs: string[] = [];
  if (tag === "ol" && node.attrs?.start && node.attrs.start !== 1) {
    attrs.push(` start="${node.attrs.start}"`);
  }
  const inner = (node.content || [])
    .map((n) => renderNode(n, opts))
    .join("");
  return `<${tag}${attrs.join("")}>${inner}</${tag}>`;
}
function renderListItem(
  node: TipTapNode,
  opts: Required<RenderOptions>,
): string {
  const inner = (node.content || [])
    .map((n) => renderNode(n, opts))
    .join("");
  return `<li>${inner}</li>`;
}
function renderTaskList(
  node: TipTapNode,
  opts: Required<RenderOptions>,
): string {
  const inner = (node.content || [])
    .map((n) => renderNode(n, opts))
    .join("");
  return `<ul data-type="taskList" class="task-list">${inner}</ul>`;
}
function renderTaskItem(
  node: TipTapNode,
  opts: Required<RenderOptions>,
): string {
  const checked = node.attrs?.checked ? "checked" : "";
  const inner = (node.content || [])
    .map((n) => renderNode(n, opts))
    .join("");
  return `<li data-type="taskItem" class="task-item${node.attrs?.checked ? " task-item--done" : ""}"><label><input type="checkbox" ${checked} disabled /></label><div>${inner}</div></li>`;
}
function renderBlockquote(
  node: TipTapNode,
  opts: Required<RenderOptions>,
): string {
  const inner = (node.content || [])
    .map((n) => renderNode(n, opts))
    .join("");
  return `<blockquote>${inner}</blockquote>`;
}
function renderCodeBlock(
  node: TipTapNode,
  _opts: Required<RenderOptions>,
): string {
  const language = node.attrs?.language;
  const langClass = language ? ` class="language-${escapeAttr(language)}"` : "";
  const inner = extractText(node);
  return `<pre><code${langClass}>${escapeHtml(inner)}</code></pre>`;
}
function renderImage(
  node: TipTapNode,
  opts: Required<RenderOptions>,
): string {
  const rawSrc = node.attrs?.src;
  const src = rawSrc ? sanitizeUrl(rawSrc) : "";
  if (!src) return "";
  const attrs: string[] = [
    `src="${escapeAttr(src)}"`,
  ];
  if (node.attrs?.alt) {
    attrs.push(`alt="${escapeAttr(node.attrs.alt)}"`);
  } else {
    attrs.push(`alt=""`);
  }
  if (node.attrs?.title) {
    attrs.push(`title="${escapeAttr(node.attrs.title)}"`);
  }
  if (node.attrs?.width) {
    attrs.push(`width="${escapeAttr(String(node.attrs.width))}"`);
  }
  if (node.attrs?.height) {
    attrs.push(`height="${escapeAttr(String(node.attrs.height))}"`);
  }
  if (opts.lazyLoadImages) {
    attrs.push(`loading="lazy"`);
  }
  attrs.push(`class="editor-image"`);
  return `<img ${attrs.join(" ")} />`;
}
function renderTable(
  node: TipTapNode,
  opts: Required<RenderOptions>,
): string {
  const inner = (node.content || [])
    .map((n) => renderNode(n, opts))
    .join("");
  return `<table>${inner}</table>`;
}
function renderTableRow(
  node: TipTapNode,
  opts: Required<RenderOptions>,
): string {
  const inner = (node.content || [])
    .map((n) => renderNode(n, opts))
    .join("");
  return `<tr>${inner}</tr>`;
}
function renderTableCell(
  node: TipTapNode,
  tag: "td" | "th",
  opts: Required<RenderOptions>,
): string {
  const attrs: string[] = [];
  if (node.attrs?.colspan && node.attrs.colspan > 1) {
    attrs.push(` colspan="${node.attrs.colspan}"`);
  }
  if (node.attrs?.rowspan && node.attrs.rowspan > 1) {
    attrs.push(` rowspan="${node.attrs.rowspan}"`);
  }
  const inner = (node.content || [])
    .map((n) => renderNode(n, opts))
    .join("");
  return `<${tag}${attrs.join("")}>${inner}</${tag}>`;
}
// ---------------------------------------------------------------------------
// Custom Block Nodes
// ---------------------------------------------------------------------------
function renderCallout(
  node: TipTapNode,
  opts: Required<RenderOptions>,
): string {
  const calloutType = node.attrs?.type || "info";
  const inner = (node.content || [])
    .map((n) => renderNode(n, opts))
    .join("");
  return `<div class="callout-block callout-block--${escapeAttr(calloutType)}" data-callout-type="${escapeAttr(calloutType)}" role="note">${inner}</div>`;
}
function renderEmbed(
  node: TipTapNode,
  opts: Required<RenderOptions>,
): string {
  const url = sanitizeUrl(node.attrs?.url || "");
  const provider = node.attrs?.provider || "generic";
  const embedUrl = sanitizeUrl(node.attrs?.embedUrl || url) || url;
  if (!url && !embedUrl) {
    return `<div class="embed-block embed-block--empty">Embedded content unavailable</div>`;
  }
  if (provider === "youtube" || provider === "vimeo") {
    const iframeHtml = `<iframe src="${escapeAttr(embedUrl)}" frameborder="0" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" loading="lazy" title="Embedded ${escapeAttr(provider)} video"></iframe>`;
    if (opts.responsiveEmbeds) {
      return `<div class="embed-block embed-block--${escapeAttr(provider)}" data-provider="${escapeAttr(provider)}"><div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;">${iframeHtml.replace("/>", ' style="position:absolute;top:0;left:0;width:100%;height:100%;" />')}</div></div>`;
    }
    return `<div class="embed-block embed-block--${escapeAttr(provider)}" data-provider="${escapeAttr(provider)}">${iframeHtml}</div>`;
  }
  if (provider === "twitter") {
    return `<div class="embed-block embed-block--twitter" data-provider="twitter"><blockquote class="twitter-tweet"><a href="${escapeAttr(url)}">${escapeHtml(url)}</a></blockquote></div>`;
  }
  // Generic embed
  return `<div class="embed-block embed-block--generic" data-provider="generic"><a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a></div>`;
}
function renderButton(
  node: TipTapNode,
  _opts: Required<RenderOptions>,
): string {
  const text = node.attrs?.text || "Click Here";
  const url = sanitizeUrl(node.attrs?.url || "") || "#";
  const variant = node.attrs?.variant || "primary";
  const alignment = node.attrs?.alignment || "left";
  return `<div class="button-block" style="text-align: ${escapeAttr(alignment)};"><a href="${escapeAttr(url)}" class="button-block__link button-block__link--${escapeAttr(variant)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a></div>`;
}
function renderSpacer(
  node: TipTapNode,
  _opts: Required<RenderOptions>,
): string {
  const height = Math.max(0, Math.min(500, node.attrs?.height || 40));
  return `<div class="spacer-block" style="height: ${height}px;" aria-hidden="true"></div>`;
}
function renderDivider(
  node: TipTapNode,
  _opts: Required<RenderOptions>,
): string {
  const style = node.attrs?.style || "solid";
  const validStyles = ["solid", "dashed", "dotted", "double"];
  const borderStyle = validStyles.includes(style) ? style : "solid";
  return `<div class="divider-block"><hr style="border: none; border-top: 2px ${borderStyle} currentColor; opacity: 0.3;" /></div>`;
}
function renderColumns(
  node: TipTapNode,
  opts: Required<RenderOptions>,
): string {
  const count = node.attrs?.count || 2;
  const inner = (node.content || [])
    .map((n) => renderNode(n, opts))
    .join("");
  return `<div class="columns-block" data-column-count="${count}" style="display: flex; gap: 1rem;">${inner}</div>`;
}
function renderColumn(
  node: TipTapNode,
  opts: Required<RenderOptions>,
): string {
  const inner = (node.content || [])
    .map((n) => renderNode(n, opts))
    .join("");
  return `<div class="column-block" style="flex: 1; min-width: 0;">${inner}</div>`;
}
function renderReusableBlock(
  node: TipTapNode,
  opts: Required<RenderOptions>,
): string {
  const blockId = node.attrs?.blockId;
  if (!blockId) return "";
  // Look up resolved content
  const resolved = opts.reusableBlocks.get(blockId);
  if (resolved) {
    return `<div class="reusable-block-content" data-block-id="${escapeAttr(blockId)}">${resolved}</div>`;
  }
  // Fallback: show a placeholder
  const title = node.attrs?.title || "Reusable Block";
  return `<div class="reusable-block-placeholder" data-block-id="${escapeAttr(blockId)}"><!-- Reusable Block: ${escapeHtml(title)} --></div>`;
}
// ---------------------------------------------------------------------------
// Inline / Text Rendering
// ---------------------------------------------------------------------------
function renderInline(
  node: TipTapNode,
  opts: Required<RenderOptions>,
): string {
  if (!node.content) return "";
  return node.content.map((n) => renderNode(n, opts)).join("");
}
function renderText(node: TipTapNode): string {
  let html = escapeHtml(node.text || "");
  if (!node.marks || node.marks.length === 0) return html;
  // Apply marks in order
  for (const mark of node.marks) {
    html = applyMark(html, mark);
  }
  return html;
}
function applyMark(html: string, mark: TipTapMark): string {
  switch (mark.type) {
    case "bold":
      return `<strong>${html}</strong>`;
    case "italic":
      return `<em>${html}</em>`;
    case "underline":
      return `<u>${html}</u>`;
    case "strike":
      return `<s>${html}</s>`;
    case "code":
      return `<code>${html}</code>`;
    case "highlight": {
      const color = mark.attrs?.color;
      if (color) {
        return `<mark style="background-color: ${escapeAttr(color)};">${html}</mark>`;
      }
      return `<mark>${html}</mark>`;
    }
    case "link": {
      const rawHref = mark.attrs?.href || "#";
      const href = sanitizeUrl(rawHref) || "#";
      const target = mark.attrs?.target || "_blank";
      const rel = target === "_blank" ? ' rel="noopener noreferrer"' : "";
      return `<a href="${escapeAttr(href)}" target="${escapeAttr(target)}"${rel}>${html}</a>`;
    }
    case "textStyle": {
      const styles: string[] = [];
      if (mark.attrs?.color) {
        styles.push(`color: ${escapeAttr(mark.attrs.color)}`);
      }
      if (mark.attrs?.fontSize) {
        styles.push(`font-size: ${escapeAttr(mark.attrs.fontSize)}`);
      }
      if (styles.length > 0) {
        return `<span style="${styles.join("; ")};">${html}</span>`;
      }
      return html;
    }
    case "superscript":
      return `<sup>${html}</sup>`;
    case "subscript":
      return `<sub>${html}</sub>`;
    default:
      return html;
  }
}
// ---------------------------------------------------------------------------
// Text Extraction (plain text)
// ---------------------------------------------------------------------------
function extractText(node: TipTapNode): string {
  if (node.text) return node.text;
  if (!node.content) return "";
  return node.content
    .map((n) => {
      if (n.type === "hardBreak") return "\n";
      return extractText(n);
    })
    .join("");
}
// ---------------------------------------------------------------------------
// Security Helpers
// ---------------------------------------------------------------------------
/** Escape HTML entities in text content. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
/** Escape a string for use in an HTML attribute value. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
/**
 * Validate and sanitize a URL for use in href/src attributes.
 * Blocks javascript:, data:, vbscript:, and blob: protocols.
 */
function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  // Block dangerous protocols
  if (/^(javascript|data|vbscript|blob):/i.test(trimmed)) {
    return "";
  }
  // Allow relative URLs, fragments, and safe protocols
  if (trimmed.startsWith("/") || trimmed.startsWith("#") || trimmed.startsWith("//")) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol)) {
      return trimmed;
    }
    return "";
  } catch {
    // Not a valid absolute URL — allow if it looks like a relative path
    if (/^[a-zA-Z0-9]/.test(trimmed) && !trimmed.includes(":")) {
      return trimmed;
    }
    return "";
  }
}
// ---------------------------------------------------------------------------
// Utility Helpers
// ---------------------------------------------------------------------------
/** Generate a URL-friendly slug from text (for heading IDs). */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
// ---------------------------------------------------------------------------
// Table of Contents Extraction
// ---------------------------------------------------------------------------
export interface TocEntry {
  level: number;
  text: string;
  id: string;
}
/**
 * Extract table of contents entries from a TipTap JSON document.
 * Only extracts headings (h1-h6).
 */
export function extractTableOfContents(
  json: string | TipTapNode | null | undefined,
): TocEntry[] {
  if (!json) return [];
  // Use Zod-validated parsing for type safety
  const validatedDoc = parseTipTapDocument(json);
  if (!validatedDoc || !validatedDoc.content) return [];
  const doc = validatedDoc as unknown as TipTapNode;
  const entries: TocEntry[] = [];
  for (const node of doc.content ?? []) {
    if (node.type === "heading") {
      const level = node.attrs?.level || 2;
      const text = extractText(node);
      const id = slugify(text);
      if (text && id) {
        entries.push({ level, text, id });
      }
    }
  }
  return entries;
}
