import { z } from "zod";
import { validateCanonicalTree } from "./generated/instances";
import { dependencyDescriptors } from "./generated/metadata";
import type { CanonicalTree } from "./generated/types";
export type PromotionReference = {
    blockId: string;
    path: Array<string | number>;
    kind: string;
    storage: "id" | "slug";
    key: string;
};
export type CanonicalReference = Omit<PromotionReference, "key"> & {
    value: string;
};
export type PortableCanonicalTree = {
    contract: "canonical-promotion-tree-v1";
    blocks: CanonicalTree;
    references: PromotionReference[];
};
const MAX_BYTES = 500 * 1024, MAX_REFERENCES = 2000;
const referenceSchema = z.strictObject({ blockId: z.string().min(1).max(256), path: z.array(z.union([z.string().min(1).max(128), z.number().int().nonnegative()])).min(1).max(32), kind: z.string().min(1).max(128), storage: z.enum(["id", "slug"]), key: z.string().min(1).max(512).regex(/^[^\u0000-\u001f\u007f]+$/u) });
const transportSchema = z.strictObject({ contract: z.literal("canonical-promotion-tree-v1"), blocks: z.unknown(), references: z.array(referenceSchema).max(MAX_REFERENCES) });
export class CanonicalPromotionError extends Error {
    constructor(public readonly code: string, message: string) { super(message); this.name = "CanonicalPromotionError"; }
}
function refuse(code: string, message: string): never { throw new CanonicalPromotionError(code, message); }
function bounded(value: unknown): void {
    let encoded: string | undefined;
    try {
        encoded = JSON.stringify(value);
    }
    catch {
        refuse("PROMOTION_TREE_INVALID", "Expected serializable canonical content.");
    }
    if (encoded === undefined || new TextEncoder().encode(encoded).length > MAX_BYTES)
        refuse("PROMOTION_TREE_BUDGET", "Split the selection into smaller authored units.");
}
type Descriptor = {
    type: string;
    of?: string;
    storage?: string;
    path: readonly string[];
    valuePath: readonly string[];
};
type Slot = CanonicalReference & {
    attrs: Record<string, unknown>;
};
function locations(value: unknown, path: readonly string[], prefix: Array<string | number> = []): Array<{
    value: unknown;
    path: Array<string | number>;
}> {
    if (!path.length)
        return [{ value, path: prefix }];
    const [part, ...rest] = path;
    if (part === "*")
        return Array.isArray(value) ? value.flatMap((item, i) => locations(item, rest, [...prefix, i])) : [];
    if (!value || typeof value !== "object" || !Object.prototype.hasOwnProperty.call(value, part))
        return [];
    return locations((value as Record<string, unknown>)[part], rest, [...prefix, part]);
}
/** Resolve only catalog-declared paths, including nested repeater value paths. */
function collect(blocks: CanonicalTree): Slot[] {
    const slots: Slot[] = [], addresses = new Set<string>();
    const visit = (nodes: CanonicalTree): void => {
        for (const node of nodes) {
            for (const field of dependencyDescriptors[node.name].fields as readonly Descriptor[]) {
                const kind = field.type === "reference" ? field.of : field.type, storage = field.storage ?? "id";
                if (!kind || !["id", "slug"].includes(storage))
                    refuse("PROMOTION_REFERENCE_UNSUPPORTED", "An explicit reference storage adapter is required.");
                for (const parent of locations(node.attrs, field.path))
                    for (const entry of locations(parent.value, field.valuePath, parent.path)) {
                        if (entry.value === "" || entry.value === undefined || entry.value === null)
                            continue;
                        if (typeof entry.value !== "string")
                            refuse("PROMOTION_REFERENCE_INVALID", "Catalog references must be strings.");
                        const address = JSON.stringify([node.id, entry.path]);
                        if (addresses.has(address))
                            refuse("PROMOTION_REFERENCE_OVERLAP", "Catalog descriptors overlap.");
                        addresses.add(address);
                        slots.push({ blockId: node.id, path: entry.path, kind, storage: storage as "id" | "slug", value: entry.value, attrs: node.attrs });
                        if (slots.length > MAX_REFERENCES)
                            refuse("PROMOTION_REFERENCE_BUDGET", "Too many reference occurrences.");
                    }
            }
            if (node.children)
                visit(node.children);
        }
    };
    visit(blocks);
    return slots;
}
function assign(slot: Slot, value: string): void { let parent: unknown = slot.attrs; for (const part of slot.path.slice(0, -1))
    parent = (parent as Record<string | number, unknown>)[part]; (parent as Record<string | number, unknown>)[slot.path[slot.path.length - 1]!] = value; }
const placeholder = (index: number) => `promotion-reference-${index}`;
const signature = ({ blockId, path, kind, storage }: Omit<PromotionReference, "key">) => JSON.stringify([blockId, path, kind, storage]);
/** Authored captions and labels that resemble IDs remain literal text. Source
 * identity, authority and dependency enumeration belong to the export adapter. */
export async function exportCanonicalPromotionTree(input: unknown, resolve: (reference: CanonicalReference) => Promise<string>): Promise<PortableCanonicalTree> {
    bounded(input);
    const blocks = validateCanonicalTree(input), slots = collect(blocks), references: PromotionReference[] = [];
    const resolved = new Map<string, string>(), keySources = new Map<string, string>();
    for (const [index, slot] of slots.entries()) {
        const { attrs: _attrs, ...reference } = slot, source = JSON.stringify([slot.kind, slot.storage, slot.value]);
        let key = resolved.get(source);
        if (key === undefined) {
            key = await resolve(reference);
            if (keySources.has(JSON.stringify([key, slot.storage])) && keySources.get(JSON.stringify([key, slot.storage])) !== source)
                refuse("PROMOTION_SOURCE_ALIAS", "Distinct source resources cannot share a dependency key.");
            resolved.set(source, key);
            keySources.set(JSON.stringify([key, slot.storage]), source);
        }
        const { value: _value, ...address } = reference;
        references.push(referenceSchema.parse({ ...address, key }));
        assign(slot, placeholder(index));
    }
    const result: PortableCanonicalTree = { contract: "canonical-promotion-tree-v1", blocks, references };
    parseCanonicalPromotionTree(result);
    return result;
}
/** Regenerate every reference location from the catalog. Transport-provided
 * paths are compared with trusted locations, never traversed or executed. */
export function parseCanonicalPromotionTree(input: unknown): PortableCanonicalTree {
    bounded(input);
    const parsed = transportSchema.parse(input), blocks = validateCanonicalTree(parsed.blocks), slots = collect(blocks);
    if (slots.length !== parsed.references.length)
        refuse("PROMOTION_REFERENCE_COVERAGE", "Bindings must cover the exact tree.");
    const keys = new Map<string, string>();
    for (const [index, slot] of slots.entries()) {
        const reference = parsed.references[index]!;
        if (signature(slot) !== signature(reference) || slot.value !== placeholder(index))
            refuse("PROMOTION_REFERENCE_BINDING", "A reference was changed, moved, duplicated or left unmapped.");
        const meaning = reference.kind;
        if (keys.has(reference.key) && keys.get(reference.key) !== meaning)
            refuse("PROMOTION_REFERENCE_KIND", "A key cannot represent different resource kinds.");
        keys.set(reference.key, meaning);
    }
    return { contract: parsed.contract, blocks, references: parsed.references };
}
/** Only reviewed target-local dependency mappings may resolve these keys. The
 * caller separately enforces target policy, revision CAS and publication. */
export async function importCanonicalPromotionTree(input: unknown, resolve: (reference: PromotionReference) => Promise<string>): Promise<CanonicalTree> {
    const parsed = parseCanonicalPromotionTree(input), slots = collect(parsed.blocks), mapped = new Map<string, string>();
    for (const [index, slot] of slots.entries()) {
        const reference = parsed.references[index]!;
        const cacheKey = JSON.stringify([reference.key, reference.storage]);
        let value = mapped.get(cacheKey);
        if (value === undefined) {
            value = await resolve(reference);
            if (typeof value !== "string" || !value || value.startsWith("@promotion:") || value.startsWith("@promotion-url:") || /^promotion-reference-\d+$/.test(value))
                refuse("PROMOTION_REFERENCE_UNRESOLVED", "A destination reference is required.");
            mapped.set(cacheKey, value);
        }
        assign(slot, value);
    }
    return validateCanonicalTree(parsed.blocks);
}
