/**
 * Knowledge Base System - KbDoc to HTML
 *
 * The one renderer for article bodies: the website's template packs, the
 * support widget, the admin preview and every integrator get the same markup.
 * Input must be a normalized KbDoc (normalize.ts); every text and attribute is
 * escaped here, and only the elements below are ever emitted:
 *
 *   p h2 h3 h4 ul ol li blockquote aside figure img video figcaption pre code
 *   hr table thead tbody tr th td details summary div strong em u s kbd span a br
 *
 * Styling hooks are `kb-*` classes; consumers wrap the output in `.kb-doc`.
 * Media and article links are resolved through the caller's resolvers, so a
 * missing image is left out and a link to a hidden article becomes plain text.
 */

import type { KbBlock, KbCalloutTone, KbDoc, KbFigure, KbInline, KbMark } from "./model";

export type KbRenderMedia = {
  url: string;
  mimeType?: string;
  width?: number;
  height?: number;
  /** The library's alt text, used when the figure has none. */
  altText?: string;
};

export type KbRenderOptions = {
  media?: (mediaId: string) => KbRenderMedia | null | undefined;
  /** Where a link to another article points; null renders the text unlinked. */
  articleHref?: (articleId: string, anchor: string | null) => string | null | undefined;
};

const CALLOUT_TITLES: Record<KbCalloutTone, string> = {
  note: "Note",
  tip: "Tip",
  warning: "Warning",
  important: "Important",
};

export function escapeKbHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function attr(name: string, value: string | number | null | undefined): string {
  return value === null || value === undefined || value === "" ? "" : ` ${name}="${escapeKbHtml(String(value))}"`;
}

function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

function wrapMark(mark: KbMark, html: string, options: KbRenderOptions): string {
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
    case "kbd":
      return `<kbd class="kb-kbd">${html}</kbd>`;
    case "ui":
      return `<span class="kb-ui">${html}</span>`;
    case "link": {
      const { href, articleId, anchor } = mark.attrs;
      if (articleId) {
        const target = options.articleHref?.(articleId, anchor) ?? null;
        if (!target) return html;
        return `<a${attr("href", target)}${attr("data-kb-article", articleId)}${attr("data-kb-anchor", anchor)}>${html}</a>`;
      }
      if (!href) return html;
      return isExternal(href)
        ? `<a${attr("href", href)} rel="noopener noreferrer" target="_blank">${html}</a>`
        : `<a${attr("href", href)}>${html}</a>`;
    }
  }
}

function renderInline(content: KbInline[] | undefined, options: KbRenderOptions): string {
  let html = "";
  for (const node of content ?? []) {
    if (node.type === "hardBreak") {
      html += "<br>";
      continue;
    }
    let text = escapeKbHtml(node.text);
    const marks = node.marks ?? [];
    // Marks are stored outermost first; wrap from the innermost outward.
    for (let i = marks.length - 1; i >= 0; i--) text = wrapMark(marks[i]!, text, options);
    html += text;
  }
  return html;
}

function renderFigure(figure: KbFigure, options: KbRenderOptions): string {
  const { mediaId, src, alt, caption, size, frame } = figure.attrs;
  const media = mediaId ? options.media?.(mediaId) ?? null : src ? { url: src } : null;
  if (!media?.url) return "";
  const classes = ["kb-figure", `kb-figure--${size}`, frame === "screenshot" ? "kb-figure--screenshot" : ""].filter(Boolean).join(" ");
  const altText = alt || media.altText || "";
  const body = media.mimeType?.startsWith("video/")
    ? `<video${attr("src", media.url)} controls preload="metadata" playsinline${attr("width", media.width)}${attr("height", media.height)}${attr("aria-label", altText)}></video>`
    : `<img${attr("src", media.url)} alt="${escapeKbHtml(altText)}"${attr("width", media.width)}${attr("height", media.height)} loading="lazy" decoding="async">`;
  return `<figure class="${classes}">${body}${caption ? `<figcaption>${escapeKbHtml(caption)}</figcaption>` : ""}</figure>`;
}

function renderBlocks(blocks: KbBlock[], options: KbRenderOptions): string {
  return blocks.map((block) => renderBlock(block, options)).join("");
}

/** A list item holding one paragraph renders its text directly. */
function renderItemContent(blocks: KbBlock[], options: KbRenderOptions): string {
  const [first, ...rest] = blocks;
  if (first?.type === "paragraph") return renderInline(first.content, options) + renderBlocks(rest, options);
  return renderBlocks(blocks, options);
}

function renderBlock(block: KbBlock, options: KbRenderOptions): string {
  switch (block.type) {
    case "paragraph":
      return `<p>${renderInline(block.content, options)}</p>`;
    case "heading":
      return `<h${block.attrs.level}${attr("id", block.attrs.id)}>${renderInline(block.content, options)}</h${block.attrs.level}>`;
    case "bulletList":
      return `<ul>${block.content.map((item) => `<li>${renderItemContent(item.content, options)}</li>`).join("")}</ul>`;
    case "orderedList": {
      const steps = block.attrs.kind === "steps";
      const start = block.attrs.start !== 1 ? attr("start", block.attrs.start) : "";
      const items = block.content.map((item) => `<li>${renderItemContent(item.content, options)}</li>`).join("");
      // Step badges count with the list-item counter, which honours `start`.
      return `<ol${steps ? ' class="kb-steps"' : ""}${start}>${items}</ol>`;
    }
    case "blockquote":
      return `<blockquote>${renderBlocks(block.content, options)}</blockquote>`;
    case "callout": {
      const title = block.attrs.title || CALLOUT_TITLES[block.attrs.tone];
      const role = block.attrs.tone === "warning" || block.attrs.tone === "important" ? "alert" : "note";
      return `<aside class="kb-callout kb-callout--${block.attrs.tone}" role="${role}"><p class="kb-callout__title">${escapeKbHtml(title)}</p>${renderBlocks(block.content, options)}</aside>`;
    }
    case "figure":
      return renderFigure(block, options);
    case "codeBlock": {
      const language = block.attrs.language ? ` class="language-${escapeKbHtml(block.attrs.language)}"` : "";
      return `<pre class="kb-code"><code${language}>${escapeKbHtml((block.content ?? []).map((node) => node.text).join(""))}</code></pre>`;
    }
    case "horizontalRule":
      return "<hr>";
    case "table": {
      const [head, ...body] = block.content;
      const headIsHeader = head !== undefined && head.content.every((cell) => cell.type === "tableHeader");
      const row = (cells: typeof block.content[number]) =>
        `<tr>${cells.content
          .map((cell) => {
            const tag = cell.type === "tableHeader" ? "th" : "td";
            const span = attr("colspan", cell.attrs.colspan > 1 ? cell.attrs.colspan : null) + attr("rowspan", cell.attrs.rowspan > 1 ? cell.attrs.rowspan : null);
            const scope = tag === "th" ? (headIsHeader && cells === head ? ' scope="col"' : ' scope="row"') : "";
            return `<${tag}${scope}${span}>${renderItemContent(cell.content, options)}</${tag}>`;
          })
          .join("")}</tr>`;
      const thead = headIsHeader ? `<thead>${row(head)}</thead>` : "";
      const rows = (headIsHeader ? body : block.content).map(row).join("");
      return `<div class="kb-table"><table>${thead}<tbody>${rows}</tbody></table></div>`;
    }
    case "details":
      return `<details class="kb-details"${block.attrs.open ? " open" : ""}><summary>${escapeKbHtml(block.attrs.summary)}</summary><div class="kb-details__body">${renderBlocks(block.content, options)}</div></details>`;
  }
}

export function renderKbDoc(doc: KbDoc, options: KbRenderOptions = {}): string {
  return renderBlocks(doc.content, options);
}
