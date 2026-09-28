import { z } from "zod";
import { createCanonicalNodeSchema } from "../../../../../../../blocks/.generated/instance-runtime.mjs";
import { composedRegistrySnapshotSchema, createComposedRegistry } from "@backend/canonical-blocks-foundation/composedRegistry";
import type { CanonicalDraft, EditableBlock } from "./document-adapter";

const envelope = z.strictObject({
  title: z.string(), blocks: z.array(z.unknown()),
  composedDefinitions: composedRegistrySnapshotSchema.optional(),
});
// An unfinished anchor and invalid field values must survive a crash. The
// ordinary authoring contract still owns preview, save and publication.
const nodeSchema = createCanonicalNodeSchema(z);
export function recoverCanonicalDraft(input: unknown): CanonicalDraft {
  const text = JSON.stringify(input);
  if (!text || new TextEncoder().encode(text).length > 2 * 1024 * 1024) throw Error("Recovery draft exceeds its size limit");
  const value = envelope.parse(input);
  if (value.composedDefinitions) createComposedRegistry(value.composedDefinitions, value.composedDefinitions.scope);
  const ids = new Set<string>();
  const visit = (input: unknown, depth: number): EditableBlock => {
    // Recovery is more permissive than authoring's 80-node/eight-level budget,
    // so an over-budget unfinished draft can still be repaired by its author.
    if (depth > 32 || ids.size >= 1000) throw Error("Recovery tree exceeds its structural limit");
    if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("Invalid recovery block");
    const { anchor, ...fields } = input as Record<string, unknown>;
    if (anchor !== undefined && typeof anchor !== "string") throw Error("Invalid recovery anchor");
    const node = nodeSchema.parse(fields);
    if (ids.has(node.id)) throw Error("Duplicate recovery block identity");
    ids.add(node.id);
    return { ...node, ...(anchor === undefined ? {} : { anchor }), ...(node.children ? { children: node.children.map(child => visit(child, depth + 1)) } : {}) } as EditableBlock;
  };
  return { ...value, blocks: value.blocks.map(node => visit(node, 1)) };
}
