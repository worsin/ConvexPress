import { searchTextDescriptors } from "./generated/search-text";
import { validateBlockAttrs } from "./generated/schemas";

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
function proseText(value: string): string {
  return value.split(/\n\s*\n/u).map(paragraph => paragraph.replace(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/gu, token => {
    if (token.startsWith("**")) return token.slice(2, -2);
    if (token.startsWith("*")) return token.slice(1, -1);
    return /^\[([^\]]+)\]\(([^)]+)\)$/u.exec(token)![1];
  })).join("\n\n");
}

/** Candidate text, NOT a public DTO. Callers must authorize the current document,
 * ancestors, visibility, plugins and immutable definitions before public use.
 * Never follows references or invokes dynamic resolvers (including search itself). */
export function authoredBlockSearchText(name: string, input: unknown): string {
  if (!Object.prototype.hasOwnProperty.call(descriptors, name)) throw Error("Unknown search block");
  const attrs = validateBlockAttrs(name, input);
  const pieces: string[] = [];
  let remaining = MAX_TEXT;
  for (const field of descriptors[name]) {
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
