import * as generatedInventory from "./referenceInventory.generated";
type Index = { indexDescriptor: string; fields: readonly string[] };
type IndexTable = {
  export(): { indexes: Index[]; stagedDbIndexes: Index[] };
  index(name: string, fields: string[]): unknown;
};
/** Exact indexes first; a composite is valid only when the equality field is its
 * first field. Remaining columns change ordering, not the complete match set. */
export function chooseMediaReferenceIndex(indexes: readonly Index[], field: string): string | undefined {
  return indexes.filter(index => index.fields[0] === field)
    .sort((a, b) => a.fields.length - b.fields.length || a.indexDescriptor.localeCompare(b.indexDescriptor))[0]?.indexDescriptor;
}
/** Generated, immutable table+field lookup; works without evaluating schema.ts. */
export function mediaReferenceIndex(table: string, field: string): string {
  const indexes: Readonly<Record<string, Readonly<Record<string, string>>>> = generatedInventory.mediaReferenceIndexes;
  const name = Object.prototype.hasOwnProperty.call(indexes, table) && Object.prototype.hasOwnProperty.call(indexes[table], field) ? indexes[table][field] : undefined;
  if (!name) throw new Error(`Missing generated media reference index: ${table}.${field}`);
  return name;
}
export function ensureMediaReferenceIndex(definition: IndexTable, field: string, table: string): string {
  const exported = definition.export();
  const existing = chooseMediaReferenceIndex(exported.indexes, field);
  if (existing) return existing;
  const name = `by_media_ref_${field.replaceAll(".", "_")}`;
  // A staged index cannot serve queries. Refuse a same-name/field collision
  // rather than creating another duplicate or silently using an unavailable index.
  if ([...exported.indexes, ...exported.stagedDbIndexes].some(index =>
    index.indexDescriptor === name || (index.fields.length === 1 && index.fields[0] === field)))
    throw new Error(`Conflicting or staged media reference index: ${table}.${field}`);
  definition.index(name, [field]);
  return name;
}
export function withMediaReferenceIndexes<T extends Record<string, unknown>>(tables: T): T {
  for (const [table, descriptors] of Object.entries(generatedInventory.typedMediaReferences)) {
    if (table === "mediaMeta" || table === "mediaSizes") continue;
    for (const descriptor of descriptors) {
      if ((descriptor.path as readonly string[]).includes("*")) continue;
      const field = descriptor.path.join(".");
      // Schema decisions derive from these actual TableDefinitions. The offline
      // generator records the same selection for independently loaded query modules.
      ensureMediaReferenceIndex(tables[table] as IndexTable, field, table);
    }
  }
  return tables;
}
