/** Lossless document conversion only. Unsupported structure is an error; callers
 * must preserve the complete source revision and never commit a partial result. */
import { validateCanonicalTree, CANONICAL_TREE_LIMITS } from "./generated/instances";
import { dependencyDescriptors } from "./generated/metadata";
import { validateBlockAttrs } from "./generated/schemas";
import type { BlockName, CanonicalBlockInstance, CanonicalTree } from "./generated/types";
import { sha256Hex, canonicalJson } from "./shared/fingerprints";

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
export function migrateLegacyDocument(args: { postId: string; content: string }): CanonicalTree {
  if (typeof args.postId !== "string" || !args.postId) fail([], "A persisted document identity is required");
  if (typeof args.content !== "string" || new TextEncoder().encode(args.content).byteLength > CANONICAL_TREE_LIMITS.bytes) fail(["content"], "The source document exceeds the canonical migration byte limit");
  let source: unknown;
  try { source = JSON.parse(args.content); } catch { fail(["content"], "HTML and plain text need an explicit document adapter"); }
  const root = object(source, ["type", "content"], ["content"]);
  if (root.type !== "doc") fail(["content"], "Expected a TipTap document root");
  const sourceNodes = children(root.content, ["content"]);
  const blocks: CanonicalBlockInstance[] = [];
  function append(name: BlockName, attrs: unknown, path: Path) {
    let validated: unknown;
    try { validated = validateBlockAttrs(name, attrs); }
    catch { fail(path, "The authored value exceeds or differs from the target block contract"); }
    blocks.push({ id: `migration_${sha256Hex(canonicalJson({ postId: args.postId, path })).slice(0, 32)}`, name, version: dependencyDescriptors[name].version, attrs: validated } as CanonicalBlockInstance);
  }
  for (let index = 0; index < sourceNodes.length; index++) {
    const path: Path = ["content", index];
    const node = object(sourceNodes[index], ["type", "attrs", "content"], path);
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
        const items = children(node.content, [...path, "content"]).map((value, itemIndex) => {
          const at = [...path, "content", itemIndex];
          const item = object(value, ["type", "attrs", "content"], at);
          if (item.type !== (node.type === "taskList" ? "taskItem" : "listItem")) fail(at, "List item type is incompatible");
          const body = children(item.content, [...at, "content"]);
          if (body.length !== 1) fail([...at, "content"], "A multi-block list item needs a target contract");
          const text = { type: "doc", content: [paragraph(body[0], [...at, "content", 0])] };
          if (node.type === "taskList") {
            const attrs = object(item.attrs, ["checked"], [...at, "attrs"]);
            if (typeof attrs.checked !== "boolean") fail([...at, "attrs", "checked"], "The task completion value must be explicit");
            return { text, done: attrs.checked };
          }
          emptyAttrs(item.attrs, [...at, "attrs"]);
          return { text };
        });
        append("core/list", { style: node.type === "orderedList" ? "ordered" : node.type === "taskList" ? "task" : "bullet", items }, path); break;
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
  return validateCanonicalTree(blocks);
}
