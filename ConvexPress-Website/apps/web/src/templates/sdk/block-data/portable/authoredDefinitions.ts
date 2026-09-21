import { z } from "zod";
import { createComposedRegistry, composedRegistrySnapshotSchema, type ComposedRegistrySnapshot, type RuntimeCanonicalTree } from "./composedRegistry";
import { canonicalContentDigest, DOCUMENT_LIMITS } from "./documentContracts";
import { validateCanonicalTree } from "./generated/instances";
import { canonicalJson, sha256Hex } from "./shared/fingerprints";
import type { SyncedScope } from "./syncedContent";

export interface AuthoredDefinitionContent {
  title: string;
  blocks: RuntimeCanonicalTree;
  digest: string;
  composedDefinitions?: ComposedRegistrySnapshot;
}

/** Validate an immutable document snapshot independently of definition heads.
 * The server must separately authorize its page and resources. Saved definitions
 * are content, never a grant to run resolvers or read another site's resources. */
export function parseAuthoredDefinitionContent(
  value: { title: unknown; blocks: unknown; composedDefinitions?: unknown },
  expectedScope?: SyncedScope,
): AuthoredDefinitionContent {
  const title = z.string().max(DOCUMENT_LIMITS.title).parse(value.title);
  if (value.composedDefinitions === undefined) {
    const blocks = validateCanonicalTree(value.blocks);
    return { title, blocks, digest: canonicalContentDigest(title, blocks) };
  }
  if (!expectedScope) throw Error("Composed authoring requires the current site installation");
  const registry = createComposedRegistry(value.composedDefinitions, expectedScope);
  const blocks = registry.validateTree(value.blocks);
  const composedDefinitions = registry.snapshotFor(blocks);
  if (!composedDefinitions.definitions.length) throw Error("Omit definition snapshots from Library-only documents");
  const supplied = composedRegistrySnapshotSchema.parse(value.composedDefinitions);
  if (canonicalJson([...supplied.definitions].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`))) !==
      canonicalJson([...composedDefinitions.definitions].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`)))) {
    throw Error("Authored definition snapshots must contain exactly the versions used by the document");
  }
  // Each digest already binds the complete schema/composition/pack treatments.
  // Include installation identity to prevent a foreign snapshot being grafted
  // into the content identity of an otherwise identical local page.
  const binding = {
    scope: composedDefinitions.scope,
    definitions: composedDefinitions.definitions.map(({ name, version, digest }) => ({ name, version, digest })),
  };
  const digest = sha256Hex(canonicalJson({ blocksVersion: 2, title, blocks, composedDefinitions: binding }));
  return { title, blocks, digest, composedDefinitions };
}
