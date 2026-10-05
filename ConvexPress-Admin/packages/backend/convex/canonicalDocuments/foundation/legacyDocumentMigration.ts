/** Lossless document conversion only. Unsupported structure is an error; callers
 * must preserve the complete source revision and never commit a partial result. */
import { validateCanonicalTree, CANONICAL_TREE_LIMITS } from "./generated/instances";
import { dependencyDescriptors } from "./generated/metadata";
import { validateBlockAttrs } from "./generated/schemas";
import type { BlockName, CanonicalBlockInstance, CanonicalTree } from "./generated/types";
import { sha256Hex, canonicalJson } from "./shared/fingerprints";
import { legacyHtmlDocument } from "./legacyHtmlMigration";

type Path = (string | number)[];
type JsonObject = Record<string, unknown>;
export class LegacyMigrationError extends Error {
  readonly code = "LEGACY_CONVERSION_REQUIRED";
  constructor(readonly path: Path, message: string) { super(message); this.name = "LegacyMigrationError"; }
}
function fail(path: Path, message: string): never { throw new LegacyMigrationError(path, message); }
function object(value: unknown, allowed: readonly string[], path: Path): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "Expected a document object");
  const row = value as JsonObject;
  for (const key of Object.keys(row)) if (!allowed.includes(key)) fail([...path, key], "This authored property requires a lossless adapter");
  return row;
}
function children(value: unknown, path: Path): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(path, "Document children must be an array");
  return value;
}
function emptyAttrs(value: unknown, path: Path): void { if (value !== undefined) object(value, [], path); }
function paragraph(value: unknown, path: Path): JsonObject {
  const row = object(value, ["type", "content", "attrs"], path);
  if (row.type !== "paragraph") fail(path, "Nested lists and multi-block items require their own adapter");
  emptyAttrs(row.attrs, [...path, "attrs"]);
  // The generated RichText schema validates every inline node and mark. Do not
  // normalize prose, flatten marks, drop blank paragraphs or parse HTML.
  return { type: "paragraph", content: children(row.content, [...path, "content"]) };
}
const inlineDoc = (content: unknown[]) => ({ type: "doc", content: [{ type: "paragraph", content }] });
/** A separate import review prevents previously undisplayed text from becoming
 * visible through an ordinary migration. Unsupported HTML/JSON still refuse. */
export function reviewLegacyDocumentSource(args: { postId: string; content: string }): { blocks: CanonicalTree; importedContent?: "plain-text" | "html" } {
  if (typeof args.content !== "string" || new TextEncoder().encode(args.content).byteLength > CANONICAL_TREE_LIMITS.bytes) fail(["content"], "The source document exceeds the canonical migration byte limit");
  let isJson = true;
  try { JSON.parse(args.content); } catch { isJson = false; }
  if (isJson) return { blocks: migrateLegacyDocument(args) };
  if (/^\s*[[{]/u.test(args.content)) {
    fail(["content"], "Malformed structured content requires an explicit lossless adapter");
  }
  if (/<[!/?a-z]/iu.test(args.content)) {
    const document = legacyHtmlDocument(args.content, message => fail(["content"], message));
    return { importedContent: "html", blocks: migrateLegacyDocument({ ...args, content: JSON.stringify(document) }) };
  }
  const content: unknown[] = [];
  for (const [index, line] of args.content.split(/\r\n|\r|\n/u).entries()) {
    if (index) content.push({ type: "hardBreak" });
    if (line) content.push({ type: "text", text: line });
  }
  return { importedContent: "plain-text", blocks: migrateLegacyDocument({ ...args, content: JSON.stringify(inlineDoc(content)) }) };
}
export function migrateLegacyDocument(args: { postId: string; content: string }): CanonicalTree {
  if (typeof args.postId !== "string" || !args.postId) fail([], "A persisted document identity is required");
  if (typeof args.content !== "string" || new TextEncoder().encode(args.content).byteLength > CANONICAL_TREE_LIMITS.bytes) fail(["content"], "The source document exceeds the canonical migration byte limit");
  let source: unknown;
  try { source = JSON.parse(args.content); } catch { fail(["content"], "HTML and plain text need an explicit document adapter"); }
  const root = object(source, ["type", "content"], ["content"]);
  if (root.type !== "doc") fail(["content"], "Expected a TipTap document root");
  const sourceNodes = children(root.content, ["content"]);
  let count = 0;
  function make(name: BlockName, attrs: unknown, path: Path, depth: number, childBlocks?: CanonicalBlockInstance[]): CanonicalBlockInstance {
    if (++count > CANONICAL_TREE_LIMITS.nodes || depth > CANONICAL_TREE_LIMITS.depth) fail(path, "The converted document exceeds the canonical depth/node budget");
    let validated: unknown;
    try { validated = validateBlockAttrs(name, attrs); }
    catch { fail(path, "The authored value exceeds or differs from the target block contract"); }
    return { id: `migration_${sha256Hex(canonicalJson({ postId: args.postId, path })).slice(0, 32)}`, name, version: dependencyDescriptors[name].version, attrs: validated, ...(childBlocks === undefined ? {} : { children: childBlocks }) } as CanonicalBlockInstance;
  }
  function convert(nodes: unknown[], parent: Path, depth: number): CanonicalBlockInstance[] {
    // Check before descending, rather than relying on the final tree validator
    // after recursively building an arbitrarily deep source document.
    if (depth > CANONICAL_TREE_LIMITS.depth) fail(parent, "The converted document exceeds the canonical depth/node budget");
    const blocks: CanonicalBlockInstance[] = [];
    const append = (name: BlockName, attrs: unknown, path: Path, childBlocks?: CanonicalBlockInstance[]) => blocks.push(make(name, attrs, path, depth, childBlocks));
    for (let index = 0; index < nodes.length; index++) {
    const path: Path = [...parent, index];
    const node = object(nodes[index], ["type", "attrs", "content"], path);
    switch (node.type) {
      case "paragraph": append("core/paragraph", { body: { type: "doc", content: [paragraph(node, path)] } }, path); break;
      case "heading": {
        const attrs = object(node.attrs, ["level"], [...path, "attrs"]);
        append("core/heading", { level: attrs.level, text: inlineDoc(children(node.content, [...path, "content"])) }, path); break;
      }
      case "bulletList": case "orderedList": case "taskList": {
        if (node.type === "orderedList") {
          const attrs = node.attrs === undefined ? {} : object(node.attrs, ["start"], [...path, "attrs"]);
          if (attrs.start !== undefined && attrs.start !== 1) fail([...path, "attrs", "start"], "A non-default ordered-list start needs a target contract");
        } else emptyAttrs(node.attrs, [...path, "attrs"]);
        const entries = children(node.content, [...path, "content"]).map((value, itemIndex) => {
          const at = [...path, "content", itemIndex];
          const item = object(value, ["type", "attrs", "content"], at);
          if (item.type !== (node.type === "taskList" ? "taskItem" : "listItem")) fail(at, "List item type is incompatible");
          const body = children(item.content, [...at, "content"]);
          if (!body.length) fail([...at, "content"], "List items require their authored paragraph");
          const first = paragraph(body[0], [...at, "content", 0]);
          if (node.type === "taskList") {
            if (body.length !== 1) fail([...at, "content"], "A multi-block task item needs a completion-state target contract");
            const attrs = object(item.attrs, ["checked"], [...at, "attrs"]);
            if (typeof attrs.checked !== "boolean") fail([...at, "attrs", "checked"], "The task completion value must be explicit");
            return { at, body, first, done: attrs.checked };
          }
          emptyAttrs(item.attrs, [...at, "attrs"]);
          return { at, body, first };
        });
        const style = node.type === "orderedList" ? "ordered" : node.type === "taskList" ? "task" : "bullet";
        if (entries.some(entry => entry.body.length > 1)) {
          // Each child is one complete list item. Using groups retains multiple
          // paragraphs and nested lists in place; it never flattens their text.
          const items = entries.map(entry => make("core/group", {}, entry.at, depth + 1, convert(entry.body, [...entry.at, "content"], depth + 2)));
          append("core/list", { style, items: [] }, path, items);
        } else {
          const items = entries.map(entry => ({ text: { type: "doc", content: [entry.first] }, ...("done" in entry ? { done: entry.done } : {}) }));
          append("core/list", { style, items }, path);
        }
        break;
      }
      case "codeBlock": {
        const attrs = node.attrs === undefined ? {} : object(node.attrs, ["language"], [...path, "attrs"]);
        const code = children(node.content, [...path, "content"]).map((value, childIndex) => {
          const at = [...path, "content", childIndex];
          const child = object(value, ["type", "text"], at);
          if (child.type !== "text" || typeof child.text !== "string") fail(at, "Code nodes must contain unmarked literal text");
          return child.text;
        }).join("");
        append("core/code", { language: attrs.language ?? "", code }, path); break;
      }
      case "horizontalRule":
        emptyAttrs(node.attrs, [...path, "attrs"]);
        if (children(node.content, [...path, "content"]).length) fail(path, "A divider cannot discard children");
        append("core/divider", {}, path); break;
      default: fail(path, `A lossless ${String(node.type ?? "unknown")} adapter is required`);
    }
    }
    return blocks;
  }
  return validateCanonicalTree(convert(sourceNodes, ["content"], 1));
}
