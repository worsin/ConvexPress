/** Pure canonical instance contract, copied by the existing block generator. */
export const CANONICAL_TREE_LIMITS = Object.freeze({ nodes: 80, depth: 8, bytes: 512 * 1024 });
export const MENU_VISIBILITY_VALUES = Object.freeze(["everyone", "signedIn", "signedOut"]);
export const BLOCK_LAYOUT_VALUES = Object.freeze({
  width: ["contained", "wide", "full"], tone: ["default", "muted", "inverted", "accent"],
  spacing: ["none", "compact", "default", "spacious"], align: ["start", "center"],
});
const identifier = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/u;
const anchorIdentifier = /^[A-Za-z][A-Za-z0-9_-]{0,100}$/u;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
export class CanonicalTreeError extends Error {
  constructor(code, path, message) { super(message); this.name = "CanonicalTreeError"; this.code = code; this.path = path; }
}
function fail(code, path, message) { throw new CanonicalTreeError(code, path, message); }
function checkSize(tree) {
  let serialized;
  try { serialized = JSON.stringify(tree); } catch { fail("INVALID_JSON", "blocks", "Canonical trees must be bounded JSON"); }
  if (serialized === undefined) fail("INVALID_TREE", "blocks", "Expected canonical array");
  if (new TextEncoder().encode(serialized).length > CANONICAL_TREE_LIMITS.bytes) fail("TREE_BUDGET", "blocks", "Canonical tree exceeds 512KiB");
}
export function createCanonicalLayoutSchema(z) {
  return z.object(Object.fromEntries(Object.entries(BLOCK_LAYOUT_VALUES).map(([key, values]) => [key, z.enum(values).optional()]))).strict();
}
export function createCanonicalNodeSchema(z) {
  return z.object({
    id: z.string().regex(identifier), name: z.string().min(1).max(160), version: z.number().int().min(1),
    attrs: z.record(z.string(), z.unknown()), children: z.array(z.unknown()).optional(),
    layout: createCanonicalLayoutSchema(z).optional(), style: z.string().min(1).max(128).optional(),
    treatment: z.object({ name: z.string().min(1).max(80), values: z.record(z.string(), z.union([z.string(), z.number()])) }).strict().optional(),
    visibility: z.enum(MENU_VISIBILITY_VALUES).optional(),
    lock: z.object({ move: z.boolean().optional(), remove: z.boolean().optional(), edit: z.boolean().optional() }).strict().optional(),
    anchor: z.string().regex(anchorIdentifier).optional(),
  }).strict();
}
function valuesAt(value, path, displayPath) {
  if (!path.length) return [{ value, path: displayPath }];
  const [key, ...rest] = path;
  if (key === "*") return Array.isArray(value) ? value.flatMap((item, index) => valuesAt(item, rest, `${displayPath}.${index}`)) : [];
  return value && typeof value === "object" && own(value, key) ? valuesAt(value[key], rest, `${displayPath}.${key}`) : [];
}
/** Descriptors are generated from explicit domId fields, never from link/field names. */
export function collectCanonicalAnchors(attrs, descriptors, path = "attrs") {
  return descriptors.flatMap(descriptor => valuesAt(attrs, descriptor.path, path).flatMap(entry => {
    if (entry.value === undefined || entry.value === null || entry.value === "") return [];
    if (typeof entry.value !== "string" || !anchorIdentifier.test(entry.value)) fail("INVALID_ANCHOR", entry.path, "Authored DOM IDs must be semantic identifiers");
    return [{ value: entry.value, path: entry.path }];
  }));
}
export function validateCanonicalTree(input, contract) {
  checkSize(input);
  if (!Array.isArray(input)) fail("INVALID_TREE", "blocks", "Expected canonical block array");
  const ids = new Set(), anchors = new Set();
  let count = 0;
  const visit = (value, depth, path) => {
    if (++count > CANONICAL_TREE_LIMITS.nodes || depth > CANONICAL_TREE_LIMITS.depth) fail("TREE_BUDGET", path, "Maximum 80 blocks and eight levels");
    const parsed = contract.nodeSchema.safeParse(value);
    if (!parsed.success) fail("INVALID_INSTANCE", path, "Instance fields do not match the closed canonical contract");
    const node = parsed.data;
    if (ids.has(node.id)) fail("DUPLICATE_BLOCK_ID", `${path}.id`, "Block IDs must be unique within the document");
    ids.add(node.id);
    // Installed Library names always retain their generated contracts. Only a
    // host-provided, exact-version composed registry can extend the vocabulary.
    const installed = own(contract.descriptors, node.name);
    const composed = !installed && /^composed\/[a-z][a-z0-9-]*$/.test(node.name)
      ? contract.resolveComposedBlock?.(node.name, node.version) : undefined;
    if (!installed && !composed) fail("UNKNOWN_BLOCK", `${path}.name`, "No canonical block specification for this name and version");
    const descriptor = installed ? contract.descriptors[node.name] : composed.descriptor;
    if (node.version !== descriptor.version) fail("VERSION_MISMATCH", `${path}.version`, "Explicit block version migration is required");
    if (node.children !== undefined && !descriptor.supports.children) fail("INVALID_CHILDREN", `${path}.children`, "This block does not support children");
    for (const key of Object.keys(node.layout ?? {})) if (!descriptor.supports.layout.includes(key)) fail("UNSUPPORTED_LAYOUT", `${path}.layout.${key}`, "This block does not support this layout intent");
    if (node.anchor !== undefined && !descriptor.supports.anchor) fail("UNSUPPORTED_ANCHOR", `${path}.anchor`, "This block does not support an instance anchor");
    // Style is a bounded saved identity. Active-template rendering resolves unknown
    // identities to default so switching templates never invalidates saved content.
    if (node.style !== undefined && !descriptor.supports.styles) fail("UNSUPPORTED_STYLE", `${path}.style`, "This block does not support styles");
    if (node.visibility !== undefined && !descriptor.supports.visibility) fail("UNSUPPORTED_VISIBILITY", `${path}.visibility`, "This block does not support visibility rules");
    if (node.treatment !== undefined) {
      try {
        if (composed) {
          if (!composed.validateTreatment) throw Error("No composed treatment contract");
          composed.validateTreatment(node.treatment);
        } else {
          if (!contract.validateTreatment) throw Error("No treatment contract");
          contract.validateTreatment(node.name, node.treatment);
        }
      }
      catch { fail("INVALID_TREATMENT", `${path}.treatment`, "Treatment does not match the block's closed finite axes"); }
    }
    let attrs;
    try { attrs = composed ? composed.validateAttrs(node.attrs) : contract.validateAttrs(node.name, node.attrs); }
    catch { fail("INVALID_ATTRS", `${path}.attrs`, "Attributes do not match their generated canonical schema"); }
    const authoredAnchors = collectCanonicalAnchors(attrs, composed ? composed.anchors : contract.anchors[node.name] ?? [], `${path}.attrs`);
    if (node.anchor !== undefined) authoredAnchors.push({ value: node.anchor, path: `${path}.anchor` });
    for (const entry of authoredAnchors) {
      if (anchors.has(entry.value)) fail("DUPLICATE_ANCHOR", entry.path, `Duplicate page-wide DOM ID: ${entry.value}`);
      anchors.add(entry.value);
    }
    return { ...node, attrs, ...(node.children === undefined ? {} : { children: node.children.map((child, index) => visit(child, depth + 1, `${path}.children.${index}`)) }) };
  };
  const result = input.map((node, index) => visit(node, 1, `blocks.${index}`));
  checkSize(result); // Defaults may enlarge an otherwise small input.
  return result;
}
export function createCanonicalTreeSchema(z, contract) {
  return z.unknown().transform((input, ctx) => {
    try { return validateCanonicalTree(input, contract); }
    catch (error) {
      if (!(error instanceof CanonicalTreeError)) throw error;
      ctx.addIssue({ code: "custom", message: `${error.code}: ${error.message}`, path: error.path.split(".") });
      return z.NEVER;
    }
  });
}

/** Authoring safeguards, not permission grants. Call with the stored tree and the
 * validated candidate. Unlocking changes only lock flags until a separate save.
 * New siblings may be inserted around a move-locked block; existing siblings
 * cannot cross it, and moving an ancestor cannot bypass its protection. */
export function assertCanonicalBlockLocks(previous, next) {
  const index = tree => {
    checkSize(tree);
    if (!Array.isArray(tree)) fail("INVALID_TREE", "blocks", "Expected canonical array");
    const rows = new Map();
    const visit = (nodes, parent, ancestors) => {
      if (!Array.isArray(nodes)) fail("INVALID_TREE", "blocks", "Expected canonical children");
      for (const node of nodes) {
        if (!node || typeof node !== "object" || typeof node.id !== "string") fail("INVALID_INSTANCE", "blocks", "Expected canonical block identity");
        if (rows.has(node.id)) fail("DUPLICATE_BLOCK_ID", "blocks", "Block IDs must be unique");
        if (rows.size >= CANONICAL_TREE_LIMITS.nodes || ancestors.length >= CANONICAL_TREE_LIMITS.depth) fail("TREE_BUDGET", "blocks", "Maximum 80 blocks and eight levels");
        rows.set(node.id, { node, parent, ancestors, siblings: nodes.map(item => item.id) });
        visit(node.children ?? [], node.id, [...ancestors, node.id]);
      }
    };
    visit(tree, null, []);
    return rows;
  };
  const before = index(previous), after = index(next);
  const ordered = value => {
    if (Array.isArray(value)) return value.map(ordered);
    if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, ordered(value[key])]));
    return value;
  };
  const content = node => {
    const { lock: _lock, children, ...authored } = node;
    return { ...authored, ...(children ? { children: children.map(content) } : {}) };
  };
  const same = (a, b) => JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
  for (const [id, saved] of before) {
    const candidate = after.get(id);
    if (!candidate) {
      if (saved.node.lock?.remove) fail("BLOCK_REMOVE_LOCKED", `blocks.${id}`, "Unlock removal and save before removing this block or its parent.");
      continue;
    }
    if (saved.node.lock?.edit && !same(content(saved.node), content(candidate.node))) fail("BLOCK_EDIT_LOCKED", `blocks.${id}`, "Unlock editing and save before changing this block or its contents.");
    if (saved.node.lock?.move) {
      for (const protectedId of [...saved.ancestors, id]) {
        const oldPosition = before.get(protectedId), newPosition = after.get(protectedId);
        if (!newPosition || oldPosition.parent !== newPosition.parent) fail("BLOCK_MOVE_LOCKED", `blocks.${id}`, "Unlock movement and save before moving this block or its parent.");
        const retained = new Set(oldPosition.siblings.filter(sibling => after.get(sibling)?.parent === oldPosition.parent));
        const oldSiblings = oldPosition.siblings.filter(sibling => retained.has(sibling));
        const newSiblings = newPosition.siblings.filter(sibling => retained.has(sibling));
        const oldBefore = new Set(oldSiblings.slice(0, oldSiblings.indexOf(protectedId)));
        const newBefore = new Set(newSiblings.slice(0, newSiblings.indexOf(protectedId)));
        if (oldBefore.size !== newBefore.size || [...oldBefore].some(sibling => !newBefore.has(sibling))) fail("BLOCK_MOVE_LOCKED", `blocks.${id}`, "Unlock movement and save before changing this block's order.");
      }
    }
  }
}
