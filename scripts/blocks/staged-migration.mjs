import { legacyTextToRichText } from "./legacy-richtext.mjs";
import { attrsSchema } from "./schema.mjs";
import { dependencyFields, canonicalJson } from "./generator.mjs";

const clone = value => structuredClone(value);
const equal = (a, b) => JSON.stringify(canonicalJson(a)) === JSON.stringify(canonicalJson(b));
function visit(root, path, callback, actual = []) {
  const [head, ...tail] = path;
  if (head === "*") {
    if (!Array.isArray(root)) throw new Error(`Expected a repeater at ${actual.join(".")}`);
    root.forEach((_, index) => tail.length ? visit(root[index], tail, callback, [...actual, String(index)]) : callback(root, index, [...actual, String(index)]));
  } else if (root && typeof root === "object" && Object.hasOwn(root, head)) {
    if (tail.length) visit(root[head], tail, callback, [...actual, head]); else callback(root, head, [...actual, head]);
  }
}
function checkOriginalFields(value, fields, at = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const key of Object.keys(value)) if (!Object.hasOwn(fields, key)) throw new Error(`Unknown original attribute ${[...at, key].join(".")}; retain it for review`);
  for (const [key, schema] of Object.entries(fields)) {
    let current = schema;
    while (current?._zod?.def?.innerType) current = current._zod.def.innerType;
    if (current?._zod?.def?.type === "object") checkOriginalFields(value[key], current.shape, [...at, key]);
    if (current?._zod?.def?.type === "array" && current._zod.def.element?._zod?.def?.type === "object" && Array.isArray(value[key])) value[key].forEach((item, index) => checkOriginalFields(item, current._zod.def.element.shape, [...at, key, String(index)]));
  }
}
function sourceField(schema, path) {
  let current = schema;
  for (const key of path) {
    while (current?._zod?.def?.innerType) current = current._zod.def.innerType;
    current = key === "*" ? current._zod.def.element : current.shape[key];
  }
  return current;
}
/** Pure staged same-environment migration. Callers must retain the returned
 * revision and legacyRender until the new renderer/treatment passes acceptance.
 * This function writes nothing and refuses a second/unknown version. */
export async function migrateLegacyBlock({ block, spec, legacySchema, websiteSchema, sourceScope, targetScope, packId, resolveTreatment, resolveReference }) {
  if (!equal(sourceScope, targetScope) || !sourceScope?.websiteKey || !sourceScope?.instanceKey) throw new Error("Schema migration requires the exact source environment; promotion uses a separate authorized pipeline");
  if (block.name !== spec.name || block.version !== (spec.migration?.fromVersion ?? spec.version)) throw new Error("Block version/name does not match the migration source");
  if (block.innerBlocks?.length || block.children?.length) throw new Error("Nested legacy content requires the separate block-tree migration");
  if (!block.id || typeof block.id !== "string") throw new Error("Block ID is required");
  checkOriginalFields(block.attrs, legacySchema.shape);
  const original = clone(block);
  // Materialize the actual previous renderer defaults, not editor defaults.
  const legacyAttrs = (websiteSchema ?? legacySchema).parse(clone(block.attrs));
  const attrs = clone(legacyAttrs), treatments = [];
  for (const transform of spec.migration?.transforms ?? []) {
    visit(attrs, transform.path, (parent, key, at) => {
      if (transform.kind === "empty-to-null") {
        if (parent[key] === "" || (Array.isArray(parent[key]) && parent[key].length === 0)) parent[key] = null;
      } else if (transform.kind === "text-to-richtext") {
        if (parent[key] !== null) sourceField(legacySchema, transform.path).parse(parent[key]);
        parent[key] = legacyTextToRichText(parent[key], transform.mode);
      } else if (transform.kind === "pack-treatment") {
        sourceField(legacySchema, transform.path).parse(parent[key]);
        treatments.push({ path: at, value: clone(parent[key]) }); delete parent[key];
      }
    });
  }
  // Refuse unsafe content before invoking any external treatment/lookup hook.
  attrsSchema(spec.fields, spec.constraints).parse(attrs);
  let style;
  if (treatments.length) {
    if (!resolveTreatment || !/^[a-z][a-z0-9-]*$/.test(packId ?? "")) throw new Error(`A verified pack treatment is required for ${treatments.map(t => t.path.join(".")).join(", ")}`);
    const result = await resolveTreatment({ blockName: spec.name, fromVersion: block.version, packId, targetScope, properties: clone(treatments) });
    if (!result || result.verified !== true || result.packId !== packId || !equal(result.targetScope, targetScope) || !equal(result.properties, treatments) || !/^[a-z][a-z0-9-]{0,100}$/.test(result.style ?? "")) throw new Error("Pack treatment has not been verified for these exact legacy values, pack and environment");
    style = result.style;
  }
  const pending = [];
  for (const field of dependencyFields(spec.fields)) if (field.type === "reference" && ["tag", "user"].includes(field.of)) {
    visit(attrs, field.path, (parent, key, at) => { if (parent[key] !== "" && parent[key] !== null && parent[key] !== undefined) pending.push({ parent, key, path: at, field, value: parent[key] }); });
  }
  for (const ref of pending) {
    const at = ref.path.join(".");
    if (!resolveReference) throw new Error(`Reviewed target ${ref.field.of} resolution is required at ${at}`);
    const result = await resolveReference({ of: ref.field.of, storage: ref.field.storage ?? "id", value: ref.value, path: ref.path, targetScope });
    if (!result || !equal(result.targetScope, targetScope) || typeof result.value !== "string" || !result.value) throw new Error(`Reference resolution targets a different environment at ${at}`);
    if (ref.field.of === "user" && (result.kind !== "author" || result.reviewed !== true || result.sourceValue !== ref.value)) throw new Error(`A reviewed target-author mapping is required at ${at}; customer identity mapping is forbidden`);
    if (ref.field.of === "tag" && (result.taxonomy !== "tags" || result.sourceValue !== ref.value || result.storage !== (ref.field.storage ?? "id"))) throw new Error(`Tag must resolve in the intended target taxonomy at ${at}`);
    ref.parent[ref.key] = result.value;
  }
  const normalized = attrsSchema(spec.fields, spec.constraints).parse(attrs);
  return {
    block: { ...clone(block), version: spec.version, attrs: normalized, ...(style ? { style } : {}) },
    revision: { original, sourceScope: clone(sourceScope) },
    legacyRender: { name: block.name, version: block.version, attrs: legacyAttrs },
    activation: "requires-render-acceptance",
  };
}
