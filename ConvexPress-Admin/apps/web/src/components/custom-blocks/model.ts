import { decodeComposedDefinition, encodeComposedDefinition } from "@backend/canonical-blocks-foundation/composedDefinitions";
import type { Id } from "@backend/convex/_generated/dataModel";
import type { PromotionClient } from "./promotion-model";

export type DefinitionId = Id<"blockDefinitions">;
export type SavedDefinition = { id: DefinitionId; name: string; generation: number; version: number; lastVersion: number; activeVersion: number | null; status: "draft" | "active" | "promoted"; versionStatus: "draft" | "active" | "revoked"; definitionJson: string; digest: string };
export type DefinitionHistory = { versions: { version: number; digest: string; versionStatus: "draft" | "active" | "revoked"; createdAt: number }[]; nextBeforeVersion: number | null };
export interface DefinitionClient {
  promotion: PromotionClient;
  styleForPack(args: { id: DefinitionId; expectedGeneration: number; version: number; expectedDigest: string; packId: string; prompt: string }): Promise<{ definitionJson: string; digest: string; fingerprint: string; packId: string }>;
  get(args: { id: DefinitionId; version?: number }): Promise<SavedDefinition>;
  history(args: { id: DefinitionId; beforeVersion?: number }): Promise<DefinitionHistory>;
  save(args: { id: DefinitionId; expectedGeneration: number; definitionJson: string }): Promise<{ version: number }>;
  restore(args: { id: DefinitionId; expectedGeneration: number; version: number; expectedDigest: string }): Promise<{ version: number }>;
  review(args: { id: DefinitionId; expectedGeneration: number; version: number; expectedDigest: string; enabled: boolean }): Promise<{ version: number }>;
}
export function starterDefinition(title: string, slug: string) {
  return encodeComposedDefinition({
    spec: { name: `composed/${slug}`, title: title.trim(), description: "A reusable heading with editable text.", category: "text", role: "content", version: 1, keywords: [], ai: { useFor: "An introductory heading", avoid: "Navigation" }, fields: [{ id: "headline", title: "Headline", type: "text", default: title.trim(), max: 160 }], supports: { children: false, styles: false, layout: [], anchor: true, visibility: false }, data: null, preview: "{headline}", examples: [{}] },
    composition: { version: 1, root: { el: "Heading", bind: "attrs.headline" } },
  });
}
export function checkedSaved(value: SavedDefinition) {
  const result = decodeComposedDefinition(value.definitionJson, value.digest);
  if (result.definition.spec.name !== value.name || result.definition.spec.version !== value.version) throw Error("Saved definition identity does not match its content.");
  return result;
}
export function nextDefinition(value: SavedDefinition) {
  const { definition } = checkedSaved(value);
  return JSON.stringify({ ...definition, spec: { ...definition.spec, version: value.lastVersion + 1 } }, null, 2);
}
export function checkedEdit(source: string, base: SavedDefinition) {
  const result = decodeComposedDefinition(source);
  if (result.definition.spec.name !== base.name || result.definition.spec.version !== base.lastVersion + 1) throw Error("Keep the block name and use the next version number.");
  return result;
}
