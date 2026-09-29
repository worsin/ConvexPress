import { searchTextDescriptors } from "./generated/search_text";
import { validateBlockAttrs } from "./generated/schemas";
import { searchableFields } from "./generated/spec_runtime.mjs";
import { composedAttrsSchema, type ComposedDefinition } from "./composedDefinitions";
import type { ResolvedCompositionNode } from "./composition";

interface TextField { readonly path: readonly string[]; readonly type: "text" | "richtext" | "prose" }
const descriptors: Readonly<Record<string, readonly TextField[]>> = searchTextDescriptors;
const MAX_TEXT = 100_000;

function valuesAt(value: unknown, path: readonly string[]): unknown[] {
  if (!path.length) return [value];
  const [head, ...tail] = path;
  if (head === "*") return Array.isArray(value) ? value.flatMap(item => valuesAt(item, tail)) : [];
  return value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, head)
    ? valuesAt((value as Record<string, unknown>)[head], tail) : [];
}

/** Already validated richtext; marks and their URLs are deliberately ignored.
 * Adjacent marked runs form one word; paragraph and hard-break boundaries do not. */
function richText(value: unknown): string {
  const doc = value as { content: { content?: ({ type: "text"; text: string } | { type: "hardBreak" })[] }[] };
  return doc.content.map(paragraph => (paragraph.content ?? []).map(node => node.type === "text" ? node.text : "\n").join("")).join("\n");
}

/** Match the SDK Prose adapter's deliberately small inline grammar exactly.
 * Unsupported Markdown is rendered literally, so it must stay literal here. */
export function proseText(value: string): string {
  return value.split(/\n\s*\n/u).map(paragraph => paragraph.replace(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/gu, token => {
    if (token.startsWith("**")) return token.slice(2, -2);
    if (token.startsWith("*")) return token.slice(1, -1);
    return /^\[([^\]]+)\]\(([^)]+)\)$/u.exec(token)![1];
  })).join("\n\n");
}

/** Candidate text, NOT a public DTO. Callers must authorize the current document,
 * ancestors, visibility, plugins and immutable definitions before public use.
 * Never follows references or invokes dynamic resolvers (including search itself). */
export function authoredBlockSearchText(name: string, input: unknown, project?: (attrs: unknown) => unknown): string {
  if (!Object.prototype.hasOwnProperty.call(descriptors, name)) throw Error("Unknown search block");
  const attrs = validateBlockAttrs(name, input);
  return declaredSearchText(project ? project(attrs) : attrs, descriptors[name]);
}

function declaredSearchText(attrs: unknown, fields: readonly TextField[]): string {
  const pieces: string[] = [];
  let remaining = MAX_TEXT;
  for (const field of fields) {
    for (const value of valuesAt(attrs, field.path)) {
      if (value === null || value === undefined) continue;
      const text = (field.type === "richtext" ? richText(value) : field.type === "prose" ? proseText(String(value)) : String(value)).replace(/\s+/gu, " ").trim();
      if (!text) continue;
      const piece = text.slice(0, remaining);
      pieces.push(piece);
      remaining -= piece.length + 1;
      if (remaining <= 0) return pieces.join(" ");
    }
  }
  return pieces.join(" ");
}

/** Authored candidate corpus from an exact definition. Conditions and pack
 * alternatives are intentionally a superset; current presentation is authority. */
export function authoredComposedSearchText(definition: ComposedDefinition, input: unknown): string {
  return declaredSearchText(composedAttrsSchema(definition).parse(input), searchableFields(definition.spec.fields, definition.spec.searchText ?? []));
}

/** A resolved, validated SDK presentation only. Enumerate visible prose, never
 * stringify props: links, media IDs/URLs, anchors and configuration are not text.
 * The caller supplies already-authorized child text at the actual child slot. */
export function resolvedCompositionSearchText(root: ResolvedCompositionNode | null, children: string): string {
  const parts: string[] = [];
  let remaining = MAX_TEXT;
  const append = (value: unknown) => {
    if (typeof value !== "string" || remaining <= 0) return;
    const text = value.replace(/\s+/gu, " ").trim().slice(0, remaining);
    if (text) { parts.push(text); remaining -= text.length + 1; }
  };
  const visit = (node: ResolvedCompositionNode) => {
    if (remaining <= 0) return;
    const p = node.props;
    switch (node.el) {
      case "Heading": case "Eyebrow": case "Text": append(node.text); break;
      case "RichText": append(richText(p.content)); break;
      case "Image": append(p.caption); break;
      case "Video": append(p.title); break;
      case "Button": case "Link": case "Badge": append(p.label); break;
      case "Stat": append(p.value); append(p.label); append(p.detail); break;
      case "Quote": append(p.quote); append(p.attribution); append(p.source); break;
      case "List": case "Marquee": for (const value of p.items as string[]) append(value); break;
      case "Accordion": case "Tabs":
        for (const item of p.items as { title: string; body: string }[]) { append(item.title); append(item.body); }
        break;
      case "Slot": append(children); break;
    }
    node.children.forEach(visit);
  };
  if (root) visit(root);
  return parts.join(" ");
}
