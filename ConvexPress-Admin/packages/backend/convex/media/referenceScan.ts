import { ConvexError, getDocumentSize, v } from "convex/values";
import type { GenericDocument } from "convex/server";
import type { Id, TableNames } from "../_generated/dataModel";
import { mediaReferenceOwners, typedMediaReferences } from "./referenceInventory.generated";
import { opaqueMediaContainers, MEDIA_REFERENCE_PAGE, MEDIA_REFERENCE_TOTAL } from "./referencePolicy";
/** A table whose documents may reference media: a typed or opaque owner, never
 * the media item's own dependents (mediaSizes, mediaMeta). */
export type MediaReferenceTable = (typeof mediaReferenceOwners)[number];
export const referenceTables: readonly MediaReferenceTable[] = mediaReferenceOwners;
const referenceTableSet: ReadonlySet<string> = new Set(referenceTables);
/** Boundary check for a table name read back from storage or a function argument. */
export function isMediaReferenceTable(table: string): table is MediaReferenceTable {
  return referenceTableSet.has(table);
}
export const mediaReferenceTableValidator = v.union(...referenceTables.map(table => v.literal(table)));
export const referenceValidator = v.object({ table: mediaReferenceTableValidator, documentId: v.string(), field: v.string(), path: v.string(), mediaId: v.id("media"), opaque: v.boolean() });
export type ScannedReference = { table: MediaReferenceTable; documentId: string; field: string; path: string; mediaId: Id<"media">; opaque: boolean };
export type MediaReferenceDescriptor = { readonly path: readonly string[]; readonly optional: boolean };
export const inventory: Readonly<Partial<Record<TableNames, readonly MediaReferenceDescriptor[]>>> = typedMediaReferences;
export function referenceFailure(message = "Media references exceed the safe transaction budget; nothing was deleted."): never {
  throw new ConvexError({ code: "MEDIA_REFERENCE_BUDGET", message });
}
export function completeReferencePage(page: { page: readonly GenericDocument[]; isDone: boolean; pageStatus?: string | null; splitCursor?: string | null }) {
  const bytes = page.page.reduce((sum, row) => sum + getDocumentSize(row), 0);
  // Convex may return a potential split cursor on ordinary complete pages.
  // Only pageStatus requests a split; the cursor alone does not imply truncation.
  if (!page.isDone || page.pageStatus != null || page.page.length > MEDIA_REFERENCE_PAGE.numItems || bytes > MEDIA_REFERENCE_PAGE.maximumBytesRead) referenceFailure();
  return { rows: page.page.length, bytes };
}
export function scanReferences(table: MediaReferenceTable, doc: Readonly<Record<string, unknown>> & { _id: string }, mediaIds: readonly string[], normalize?: (value: string) => string | null): ScannedReference[] {
  const ids = new Set(mediaIds), refs: ScannedReference[] = [];
  const add = (id: string, path: string[], field: string, opaque: boolean) => {
    refs.push({ table, documentId: doc._id, field, path: path.join("."), mediaId: id as Id<"media">, opaque });
    if (refs.length > 1000) referenceFailure();
  };
  for (const descriptor of inventory[table] ?? []) {
    function visit(value: unknown, remaining: readonly string[], path: string[]) {
      if (!remaining.length) {
        if (typeof value === "string") {
          const id = ids.has(value) ? value : normalize?.(value);
          if (id && ids.has(id)) add(id, path, descriptor.path.join("."), false);
        }
        return;
      }
      const [key, ...rest] = remaining;
      if (key === "*") { if (Array.isArray(value)) value.forEach((entry, i) => visit(entry, rest, [...path, String(i)])); }
      else if (value && typeof value === "object") visit((value as Record<string, unknown>)[key!], rest, [...path, key!]);
    }
    visit(doc, descriptor.path, []);
  }
  let nodes = 0;
  function opaque(value: unknown, path: string[], depth: number) {
    if (++nodes > 20000 || depth > 64) referenceFailure("Authored media references exceed supported structural bounds; nothing was deleted.");
    if (typeof value === "string") {
      // Includes serialized JSON/HTML references. No parsing/rewriting that could
      // alter rich-text structure, encoding, or plugin invariants.
      const normalized = normalize?.(value);
      for (const id of ids) if (value.includes(id) || normalized === id) add(id, path, path[0]!, true);
      const trimmed = value.trimStart();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        let parsed: unknown; try { parsed = JSON.parse(value); } catch { return; }
        opaque(parsed, [...path, "$json"], depth + 1);
      }
    } else if (Array.isArray(value)) value.forEach((item, i) => opaque(item, [...path, String(i)], depth + 1));
    else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) opaque(item, [...path, key], depth + 1);
  }
  for (const field of opaqueMediaContainers[table] ?? []) if (doc[field] !== undefined) opaque(doc[field], [field], 0);
  return refs;
}
export function addReferenceBudget(total: { rows: number; bytes: number; queries: number }, read: { rows: number; bytes: number }) {
  total.rows += read.rows; total.bytes += read.bytes; total.queries++;
  if (total.rows > MEDIA_REFERENCE_TOTAL.rows || total.bytes > MEDIA_REFERENCE_TOTAL.bytes || total.queries > MEDIA_REFERENCE_TOTAL.queries) referenceFailure();
}

export function beforeReferenceRead(total: { rows: number; bytes: number; queries: number }) {
  if (total.rows >= MEDIA_REFERENCE_TOTAL.rows || total.bytes >= MEDIA_REFERENCE_TOTAL.bytes || total.queries >= MEDIA_REFERENCE_TOTAL.queries) referenceFailure();
}
