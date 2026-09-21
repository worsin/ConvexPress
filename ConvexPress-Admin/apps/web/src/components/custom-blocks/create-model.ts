import { decodeComposedDefinition } from "@backend/canonical-blocks-foundation/composedDefinitions";
import type { DefinitionId, SavedDefinition } from "./model";

export type DefinitionScope = { websiteKey: string; instanceKey: string; deploymentOrigin: string };
export type ComposeRequest = { name: string; packId: string; expectedScope: DefinitionScope; resources?: { products: string[]; media: string[] } };
export type DefinitionProposal = { definitionJson: string; digest: string; fingerprint: string };
export type CreationReceipt = { id: DefinitionId; name: string; version: number; generation: number; digest: string };
export type ResourceKind = "product" | "media";
export interface DefinitionCreationClient {
  compose(args: ComposeRequest & { prompt: string }): Promise<DefinitionProposal>;
  create(args: { definitionJson: string }): Promise<CreationReceipt>;
  accept(args: ComposeRequest & { expectedFingerprint: string; definitionJson: string }): Promise<CreationReceipt>;
  get(args: { id: DefinitionId }): Promise<SavedDefinition>;
  options(args: { expectedScope: DefinitionScope; kind: ResourceKind; cursor: string | null }): Promise<{ page: Array<{ id: string; title: string }>; cursor: string | null }>;
}
export function checkedNew(source: string, name: string, digest?: string) {
  const value = decodeComposedDefinition(source, digest);
  if (value.definition.spec.name !== name || value.definition.spec.version !== 1) throw Error("Keep the chosen block name and version 1.");
  return value;
}
