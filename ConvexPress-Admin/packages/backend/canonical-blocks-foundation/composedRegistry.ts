import { z } from "zod";
import { decodeComposedDefinition, composedAttrsSchema, type ComposedDefinition } from "./composedDefinitions";
import { copyCompositionJson } from "./compositionExpressions";
import { syncedScopeSchema, type SyncedScope } from "./syncedContent";
import { canonicalNodeSchema } from "./generated/instances";
import { validateBlockAttrs, validateBlockTreatment } from "./generated/schemas";
import { dependencyDescriptors, anchorDescriptors } from "./generated/metadata";
import { dependencyFields, anchorFields } from "./generated/spec-runtime.mjs";
import { validateCanonicalTree, type CanonicalEnvelope, type CanonicalTreeContract, type ComposedBlockContract } from "./generated/instance-runtime.mjs";
import { CANONICAL_TREE_LIMITS } from "./generated/instance-runtime.mjs";
import type { CanonicalBlockInstance } from "./generated/types";

export const COMPOSED_REGISTRY_LIMITS = Object.freeze({ definitions: 80, bytes: 512 * 1024 });
const snapshotSchema = z.strictObject({
  name: z.string().regex(/^composed\/[a-z][a-z0-9-]*$/).max(160),
  version: z.number().int().min(1).max(1_000_000),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  definitionJson: z.string().max(480 * 1024),
});
export const composedRegistrySnapshotSchema = z.strictObject({ scope: syncedScopeSchema, definitions: z.array(snapshotSchema).max(COMPOSED_REGISTRY_LIMITS.definitions) });
export type ComposedDefinitionSnapshot = z.infer<typeof snapshotSchema>;
export type ComposedRegistrySnapshot = z.infer<typeof composedRegistrySnapshotSchema>;
interface RuntimeChildren { children?: RuntimeCanonicalBlock[] }
type WithRuntimeChildren<T> = T extends unknown ? Omit<T, "children"> & RuntimeChildren : never;
export type ComposedJson = string | number | boolean | null | ComposedJson[] | { [key: string]: ComposedJson };
export type RuntimeCanonicalBlock = WithRuntimeChildren<CanonicalBlockInstance> | (Omit<CanonicalEnvelope, "name" | "children" | "attrs"> & RuntimeChildren & { name: `composed/${string}`; attrs: Record<string, ComposedJson> });
export type RuntimeCanonicalTree = RuntimeCanonicalBlock[];

/** Bounded discovery before database reads. This checks the closed envelope and
 * installed name vocabulary only; full attribute validation follows resolution. */
export function composedDefinitionRequests(input: unknown): { name: string; version: number }[] {
  const tree = copyCompositionJson(input);
  if (!Array.isArray(tree)) throw Error("Expected a canonical block array");
  const ids = new Set<string>(), requests = new Map<string, { name: string; version: number }>();
  let count = 0;
  function visit(value: unknown, depth: number) {
    if (++count > CANONICAL_TREE_LIMITS.nodes || depth > CANONICAL_TREE_LIMITS.depth) throw Error("Canonical tree exceeds its node or depth limit");
    const node = canonicalNodeSchema.parse(value);
    if (ids.has(node.id)) throw Error("Duplicate canonical block ID");
    ids.add(node.id);
    if (node.name.startsWith("composed/")) {
      const request = snapshotSchema.pick({ name: true, version: true }).parse({ name: node.name, version: node.version });
      requests.set(`${request.name}@${request.version}`, request);
    } else if (!Object.prototype.hasOwnProperty.call(dependencyDescriptors, node.name)) throw Error("Unknown canonical block name");
    node.children?.forEach(child => visit(child, depth + 1));
  }
  tree.forEach(node => visit(node, 1));
  return [...requests.values()];
}

/** A scoped snapshot is data, not authority. The server must load its definitions
 * from authenticated site storage; client-provided snapshots must never grant
 * permission to save, publish, run a resolver or read referenced resources. */
export function createComposedRegistry(input: unknown, expectedScope: SyncedScope) {
  const source = composedRegistrySnapshotSchema.parse(copyCompositionJson(input));
  const scope = syncedScopeSchema.parse(expectedScope);
  if (source.scope.websiteKey !== scope.websiteKey || source.scope.instanceKey !== scope.instanceKey || source.scope.deploymentOrigin !== scope.deploymentOrigin) throw Error("Composed registry belongs to another site installation");
  const entries = new Map<string, { snapshot: ComposedDefinitionSnapshot; definition: ComposedDefinition; contract: ComposedBlockContract }>();
  const key = (name: string, version: number) => `${name}@${version}`;
  for (const snapshot of source.definitions) {
    const identity = key(snapshot.name, snapshot.version);
    if (entries.has(identity)) throw Error("Duplicate composed definition version");
    const { definition } = decodeComposedDefinition(snapshot.definitionJson, snapshot.digest);
    if (definition.spec.name !== snapshot.name || definition.spec.version !== snapshot.version) throw Error("Composed snapshot identity differs from its definition");
    const attrs = composedAttrsSchema(definition);
    entries.set(identity, { snapshot, definition, contract: {
      descriptor: { version: snapshot.version, supports: definition.spec.supports },
      anchors: anchorFields(definition.spec.fields),
      validateAttrs: value => attrs.parse(value),
      // Finite treatment-axis selection is not connected to composition bindings
      // yet. Reject selections rather than silently rendering the default tree.
    } });
  }
  const contract: CanonicalTreeContract = {
    nodeSchema: canonicalNodeSchema, descriptors: dependencyDescriptors, anchors: anchorDescriptors,
    validateAttrs: validateBlockAttrs, validateTreatment: validateBlockTreatment,
    resolveComposedBlock: (name, version) => entries.get(key(name, version))?.contract,
  };
  function validateTree(tree: unknown): RuntimeCanonicalTree {
    return validateCanonicalTree(tree, contract) as RuntimeCanonicalTree;
  }
  return {
    validateTree,
    /** Copy on output prevents callers from mutating this registry's contracts. */
    definition(name: string, version: number): ComposedDefinition | null {
      const value = entries.get(key(name, version));
      return value ? copyCompositionJson(value.definition) as ComposedDefinition : null;
    },
    dependencies(name: string, version: number) {
      const value = entries.get(key(name, version));
      if (!value) throw Error("Unknown composed definition version");
      return dependencyFields(value.definition.spec.fields);
    },
    /** Capture only the exact definitions used by this saved tree. No implicit
     * upgrade to a definition head or active version is permitted. */
    snapshotFor(tree: unknown): ComposedRegistrySnapshot {
      const checked = validateTree(tree), used = new Set<string>();
      function visit(nodes: RuntimeCanonicalTree) {
        for (const node of nodes) {
          if (node.name.startsWith("composed/")) used.add(key(node.name, node.version));
          if (node.children) visit(node.children);
        }
      }
      visit(checked);
      return { scope: { ...scope }, definitions: [...used].sort().map(identity => ({ ...entries.get(identity)!.snapshot })) };
    },
  };
}
export type ComposedRegistry = ReturnType<typeof createComposedRegistry>;
