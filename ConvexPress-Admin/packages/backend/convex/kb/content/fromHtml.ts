/**
 * Knowledge Base System - legacy HTML and plain text to KbDoc
 *
 * Articles written before KbDoc stored HTML or plain text. This converter maps
 * the HTML elements a help article uses onto KbDoc nodes and marks, unwraps
 * layout wrappers, keeps the text of anything it doesn't recognise, and drops
 * active content (scripts, frames, forms, SVG) entirely. The loose tree it
 * builds goes through normalizeKbDoc like any other input, so the result is
 * held to the same rules as an editor document.
 */

import { Parser } from "htmlparser2";

import { normalizeKbDoc } from "./normalize";
import type { KbDoc } from "./model";

type Element = { tag: string; attrs: Record<string, string>; children: Node[] };
type Node = Element | string;
type LooseMark = { type: string; attrs?: Record<string, unknown> };
type LooseNode = { type: string; attrs?: Record<string, unknown>; content?: LooseNode[]; text?: string; marks?: LooseMark[] };

const DROPPED = new Set([
  "script", "style", "iframe", "frame", "frameset", "object", "embed", "noscript", "template", "head", "title", "meta",
  "link", "base", "form", "input", "button", "select", "option", "textarea", "svg", "math", "canvas", "audio", "video",
  "source", "track", "map", "area", "dialog",
]);
const VOID = new Set(["br", "hr", "img", "wbr", "col", "input", "meta", "link", "source", "track", "area", "base", "embed"]);
const MARK_TAGS: Record<string, LooseMark["type"]> = {
  strong: "bold", b: "bold", em: "italic", i: "italic", u: "underline", ins: "underline",
  s: "strike", strike: "strike", del: "strike", code: "code", kbd: "kbd", samp: "code", tt: "code",
};
const CALLOUT_CLASS = /\b(callout|admonition|alert|notice|note|info|tip|hint|success|warning|caution|danger|important)\b/i;

function parseHtml(html: string): Element {
  const root: Element = { tag: "#root", attrs: {}, children: [] };
  const stack: Element[] = [root];
  const parser = new Parser(
    {
      onopentag(tag, attrs) {
        const element: Element = { tag: tag.toLowerCase(), attrs, children: [] };
        stack[stack.length - 1]!.children.push(element);
        if (!VOID.has(element.tag)) stack.push(element);
      },
      ontext(text) {
        stack[stack.length - 1]!.children.push(text);
      },
      onclosetag(tag) {
        const name = tag.toLowerCase();
        if (VOID.has(name)) return;
        for (let i = stack.length - 1; i > 0; i--) {
          if (stack[i]!.tag === name) {
            stack.length = i;
            break;
          }
        }
      },
    },
    { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true, recognizeSelfClosing: true },
  );
  parser.write(html);
  parser.end();
  return root;
}

function textOf(node: Node): string {
  if (typeof node === "string") return node;
  if (DROPPED.has(node.tag)) return "";
  if (node.tag === "br") return "\n";
  return node.children.map(textOf).join("");
}

function withMark(marks: LooseMark[], mark: LooseMark): LooseMark[] {
  return [...marks.filter((existing) => existing.type !== mark.type), mark];
}

function calloutTone(className: string): string {
  if (/\b(warning|caution|danger|alert)\b/i.test(className)) return "warning";
  if (/\b(tip|hint|success)\b/i.test(className)) return "tip";
  if (/\bimportant\b/i.test(className)) return "important";
  return "note";
}

class Converter {
  nodes(children: Node[], marks: LooseMark[]): LooseNode[] {
    return children.flatMap((child) => this.node(child, marks));
  }

  private node(node: Node, marks: LooseMark[]): LooseNode[] {
    if (typeof node === "string") {
      const text = node.replace(/\s+/g, " ");
      return text ? [{ type: "text", text, ...(marks.length ? { marks } : {}) }] : [];
    }
    const { tag, attrs, children } = node;
    if (DROPPED.has(tag)) return [];
    const mark = MARK_TAGS[tag];
    if (mark) return this.nodes(children, withMark(marks, { type: mark }));
    switch (tag) {
      case "a":
        return this.nodes(children, withMark(marks, { type: "link", attrs: { href: attrs.href ?? "" } }));
      case "br":
        return [{ type: "hardBreak" }];
      case "p":
        return [{ type: "paragraph", content: this.nodes(children, marks) }];
      case "h1": case "h2": case "h3": case "h4": case "h5": case "h6":
        return [{ type: "heading", attrs: { level: Number(tag.slice(1)), ...(attrs.id ? { id: attrs.id } : {}) }, content: this.nodes(children, []) }];
      case "ul":
        return [{ type: "bulletList", content: this.items(children) }];
      case "ol":
        return [{ type: "orderedList", attrs: { start: Number(attrs.start ?? 1), ...(/\bsteps?\b/i.test(attrs.class ?? "") ? { kind: "steps" } : {}) }, content: this.items(children) }];
      case "li":
        return [{ type: "listItem", content: this.nodes(children, marks) }];
      case "blockquote":
        return [{ type: "blockquote", content: this.nodes(children, []) }];
      case "pre": {
        const code = children.find((child): child is Element => typeof child !== "string" && child.tag === "code");
        const language = /\blanguage-([a-z0-9+#.-]+)/i.exec(code?.attrs.class ?? attrs.class ?? "")?.[1] ?? "";
        const text = textOf(node).replace(/^\n/, "");
        return [{ type: "codeBlock", attrs: { language }, content: text ? [{ type: "text", text }] : [] }];
      }
      case "hr":
        return [{ type: "horizontalRule" }];
      case "img":
        return [{ type: "figure", attrs: { src: attrs.src ?? "", alt: attrs.alt ?? "", caption: attrs.title ?? "" } }];
      case "figure": {
        const image = findFirst(node, "img");
        const caption = findFirst(node, "figcaption");
        if (!image) return this.nodes(children, marks);
        return [{ type: "figure", attrs: { src: image.attrs.src ?? "", alt: image.attrs.alt ?? "", caption: caption ? textOf(caption) : image.attrs.title ?? "" } }];
      }
      case "table":
        return [{ type: "table", content: this.rows(node) }];
      case "details": {
        const summary = children.find((child): child is Element => typeof child !== "string" && child.tag === "summary");
        const body = children.filter((child) => child !== summary);
        return [{ type: "details", attrs: { summary: summary ? textOf(summary) : "" }, content: this.nodes(body, []) }];
      }
      case "aside":
      case "div":
      case "section": {
        const className = `${attrs.class ?? ""} ${attrs.role ?? ""}`;
        if (tag === "aside" || CALLOUT_CLASS.test(className)) {
          return [{ type: "callout", attrs: { tone: calloutTone(className) }, content: this.nodes(children, []) }];
        }
        return this.nodes(children, marks);
      }
      default:
        // Layout wrappers and unknown inline elements (span, mark, small,
        // abbr, sup, …) keep their content and lose the element.
        return this.nodes(children, marks);
    }
  }

  private items(children: Node[]): LooseNode[] {
    return children.flatMap((child) => {
      if (typeof child === "string") return child.trim() ? [{ type: "listItem", content: [{ type: "text", text: child }] }] : [];
      if (child.tag === "li") return this.node(child, []);
      if (child.tag === "ul" || child.tag === "ol") return this.node(child, []);
      return [{ type: "listItem", content: this.node(child, []) }];
    });
  }

  private rows(table: Element): LooseNode[] {
    const rows: Element[] = [];
    const collect = (element: Element) => {
      for (const child of element.children) {
        if (typeof child === "string") continue;
        if (child.tag === "tr") rows.push(child);
        else if (child.tag === "thead" || child.tag === "tbody" || child.tag === "tfoot") collect(child);
      }
    };
    collect(table);
    return rows.map((row) => ({
      type: "tableRow",
      content: row.children
        .filter((cell): cell is Element => typeof cell !== "string" && (cell.tag === "td" || cell.tag === "th"))
        .map((cell) => ({
          type: cell.tag === "th" ? "tableHeader" : "tableCell",
          attrs: { colspan: Number(cell.attrs.colspan ?? 1), rowspan: Number(cell.attrs.rowspan ?? 1) },
          content: this.nodes(cell.children, []),
        })),
    }));
  }
}

function findFirst(element: Element, tag: string): Element | null {
  for (const child of element.children) {
    if (typeof child === "string") continue;
    if (child.tag === tag) return child;
    const found = findFirst(child, tag);
    if (found) return found;
  }
  return null;
}

export function kbDocFromHtml(html: string): KbDoc {
  const root = parseHtml(html);
  return normalizeKbDoc({ type: "doc", content: new Converter().nodes(root.children, []) });
}

/** Blank lines separate paragraphs; single newlines are line breaks. */
export function kbDocFromPlainText(text: string): KbDoc {
  const paragraphs = text.replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  return normalizeKbDoc({
    type: "doc",
    content: paragraphs.map((paragraph) => ({
      type: "paragraph",
      content: paragraph.split("\n").flatMap((line, index) => [
        ...(index > 0 ? [{ type: "hardBreak" }] : []),
        { type: "text", text: line },
      ]),
    })),
  });
}

export function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][a-z0-9-]*(\s[^<>]*)?\/?>/i.test(value);
}
