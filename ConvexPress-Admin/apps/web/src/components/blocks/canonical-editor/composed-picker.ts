import { z } from "zod";
import { composedRegistrySnapshotSchema, createComposedRegistry, COMPOSED_REGISTRY_LIMITS } from "@backend/canonical-blocks-foundation/composedRegistry";
import type { ResolverPolicy } from "@backend/canonical-blocks-foundation/contracts";
import { initialFieldValue } from "../schema-editor/model";
import type { CanonicalDraft, EditableBlock } from "./document-adapter";

export const customBlockScopeSchema = z.strictObject({ websiteKey: z.string(), instanceKey: z.string() });
const choiceSchema = z.strictObject({ id: z.string().min(1).max(160), name: z.string().regex(/^composed\/[a-z][a-z0-9-]*$/).max(160), title: z.string().max(512), version: z.number().int().min(1).max(1_000_000), digest: z.string().regex(/^[a-f0-9]{64}$/) });
const pageSchema = z.strictObject({ scope: customBlockScopeSchema, page: z.array(choiceSchema).max(8), isDone: z.boolean(), continueCursor: z.string(), splitCursor: z.string().nullable().optional(), pageStatus: z.enum(["SplitRequired", "SplitRecommended"]).nullable().optional() });
export type CustomBlockScope = z.infer<typeof customBlockScopeSchema>;
export type CustomBlockChoice = z.infer<typeof choiceSchema>;
export interface CustomBlockClient {
  listCustomBlocks(args: { expectedRevision: number; expectedScope: CustomBlockScope; paginationOpts: { numItems: number; cursor: string | null } }): Promise<unknown>;
  selectCustomBlock(args: { expectedRevision: number; expectedScope: CustomBlockScope; id: string; version: number; expectedDigest: string }): Promise<unknown>;
}
export function customBlockOptions(raw: unknown, scope: CustomBlockScope) {
  const value = pageSchema.parse(raw);
  if (value.scope.websiteKey !== scope.websiteKey || value.scope.instanceKey !== scope.instanceKey) throw Error("The custom block picker belongs to another environment.");
  return value;
}
/** Merge exact selected schemas for local editing; this is not a server grant.
 * Existing invalid field drafts are preserved so authors can finish them. */
export function appendCustomBlock(draft: CanonicalDraft, raw: unknown, choice: CustomBlockChoice, scope: CustomBlockScope, policy: ResolverPolicy): { draft: CanonicalDraft; id: string } {
  const selected = composedRegistrySnapshotSchema.parse(raw);
  if (selected.scope.websiteKey !== scope.websiteKey || selected.scope.instanceKey !== scope.instanceKey || selected.definitions.length !== 1) throw Error("The custom block selection belongs to another environment.");
  const picked = selected.definitions[0]!;
  if (picked.name !== choice.name || picked.version !== choice.version || picked.digest !== choice.digest) throw Error("The selected block changed.");
  const registry = createComposedRegistry(selected, selected.scope), spec = registry.definition(picked.name, picked.version)!.spec;
  if (policy.disabledBlocks.includes(picked.name) || spec.requires?.plugins.some(id => !policy.enabledPlugins.includes(id)) || spec.requires?.capabilities.some(id => !policy.capabilities.includes(id))) throw Error("This block requires features that are unavailable here.");
  const prior = draft.composedDefinitions;
  if (prior) createComposedRegistry(prior, selected.scope);
  const existing = prior?.definitions.find(item => item.name === picked.name && item.version === picked.version);
  if (existing && existing.digest !== picked.digest) throw Error("The saved definition differs from the selection.");
  const merged = { scope: selected.scope, definitions: [...(prior?.definitions ?? []), ...(existing ? [] : [picked])] };
  if (merged.definitions.length > COMPOSED_REGISTRY_LIMITS.definitions || new TextEncoder().encode(JSON.stringify(merged)).length > COMPOSED_REGISTRY_LIMITS.bytes) throw Error("This document uses too much custom block definition data.");
  const node: EditableBlock = {
    id: `block_${crypto.randomUUID()}`, name: picked.name as `composed/${string}`, version: picked.version,
    attrs: Object.fromEntries(spec.fields.flatMap(field => {
      if (!field.required && !Object.hasOwn(field, "default")) return [];
      const value = initialFieldValue(field); return value === undefined ? [] : [[field.id, value]];
    })),
  };
  return { draft: { ...draft, blocks: [...draft.blocks, node], composedDefinitions: merged }, id: node.id };
}
