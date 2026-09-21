import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z, attrsSchema } from "./schema.mjs";
import { createCanonicalNodeSchema, validateCanonicalTree } from "./instance-runtime.mjs";

const patternSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  title: z.string().min(1).max(100), description: z.string().min(1).max(400),
  category: z.enum(["intro", "story", "features", "collection", "contact"]),
  blocks: z.array(z.unknown()).min(1).max(80),
}).strict();
const anchorFields = (fields, parent = []) => fields.flatMap(field => {
  const at = [...parent, field.id];
  if (field.domId) return [{ path: at }];
  if (field.item) return anchorFields([{ ...field.item, id: "*" }], at);
  return field.fields ? anchorFields(field.fields, field.type === "repeater" ? [...at, "*"] : at) : [];
});
/** Starter sections are portable authored content. Site records must be picked
 * after insertion; no demo/customer IDs may travel in a distributed template. */
function checkPortable(fields, attrs) {
  for (const field of fields) {
    const value = attrs?.[field.id];
    if (value === undefined || value === null || value === "") continue;
    if (["media", "reference", "menu", "form"].includes(field.type) || field.format === "resource-id")
      throw Error("Starter patterns cannot contain site-owned resource references");
    if (field.type === "object") checkPortable(field.fields, value);
    if (field.type === "repeater") for (const item of value)
      checkPortable(field.item ? [{ ...field.item, id: "item" }] : field.fields, field.item ? { item } : item);
  }
}
export function parsePattern(input, blocks, pack) {
  const pattern = patternSchema.parse(input);
  const specs = Object.fromEntries(blocks.map(({ spec }) => [spec.name, spec]));
  const contract = {
    nodeSchema: createCanonicalNodeSchema(z),
    descriptors: Object.fromEntries(blocks.map(({ spec }) => [spec.name, { version: spec.version, supports: spec.supports }])),
    anchors: Object.fromEntries(blocks.map(({ spec }) => [spec.name, anchorFields(spec.fields)])),
    validateAttrs: (name, attrs) => attrsSchema(specs[name].fields, specs[name].constraints).parse(attrs),
    validateTreatment(name, input) {
      const definition = (specs[name].treatments ?? []).find(t => t.name === input.name);
      if (!definition || !pack.treatments?.[name]?.includes(input.name)) throw Error("Unavailable pattern treatment");
      return z.object({ name: z.literal(definition.name), values: z.object(Object.fromEntries(definition.axes.map(axis => [axis.id,
        axis.type === "select" ? z.enum(axis.options) : z.number().int().min(axis.min).max(axis.max)
      ]))).strict() }).strict().parse(input);
    },
  };
  const tree = validateCanonicalTree(pattern.blocks, contract);
  const visit = nodes => { for (const node of nodes) {
    if (pack.hidden?.includes(node.name)) throw Error("Starter patterns cannot offer hidden blocks");
    if (node.style && node.style !== "default" && !pack.styles?.[node.name]?.includes(node.style)) throw Error("Unavailable pattern style");
    checkPortable(specs[node.name].fields, node.attrs); visit(node.children ?? []); } };
  visit(tree);
  return { ...pattern, id: `${pack.id}/${pattern.id}`, packId: pack.id, blocks: tree };
}
export async function discoverPatterns(root, pack, manifest, blocks) {
  const directory = path.join(root, pack.path, "patterns");
  let files;
  try {
    if ((await lstat(directory)).isSymbolicLink()) throw Error("Pattern directory cannot be a symlink");
    files = await readdir(directory, { withFileTypes: true });
  } catch (error) { if (error.code !== "ENOENT") throw error; files = []; }
  const declared = manifest?.blocks?.patterns;
  if (declared !== undefined && declared !== "./patterns/*.json") throw Error("Patterns use the fixed ./patterns/*.json convention");
  if (files.length && !declared) throw Error(`Undeclared patterns for ${pack.id}`);
  if (files.length > 64) throw Error("A template supports up to 64 starter patterns");
  const result = [];
  for (const file of files.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!file.isFile() || !/^[a-z][a-z0-9-]*\.json$/.test(file.name)) throw Error(`Invalid pattern file ${file.name}`);
    const body = await readFile(path.join(directory, file.name), "utf8");
    if (Buffer.byteLength(body) > 512 * 1024) throw Error("Oversized pattern");
    const input = JSON.parse(body);
    if (input.id !== file.name.slice(0, -5)) throw Error("Pattern identity must match its filename");
    result.push(parsePattern(input, blocks, pack));
  }
  if (declared && !result.length) throw Error(`No declared patterns found for ${pack.id}`);
  return result;
}
