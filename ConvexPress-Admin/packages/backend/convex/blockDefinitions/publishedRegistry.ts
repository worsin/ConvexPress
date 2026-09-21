import type { QueryCtx } from "../_generated/server";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { installation } from "../syncedBlocks/model";
import { readVersion, readVersionApproval, fail } from "./model";
import { createComposedRegistry, composedRegistrySnapshotSchema, type ComposedDefinitionSnapshot } from "../canonicalDocuments/foundation/composedRegistry";

/** Host-only reader, called after current page and block access. An embedded
 * snapshot identifies content; it never grants permission to publish it.
 * Supply only the visible tree/snapshots, before loading its data or media. */
export async function loadPublishedComposedRegistry(ctx: QueryCtx, tree: unknown, snapshot: unknown, budget = new RequestReadLedger()) {
  const scope = await installation(ctx, budget);
  const supplied = composedRegistrySnapshotSchema.parse(snapshot);
  const candidate = createComposedRegistry(supplied, scope);
  const blocks = candidate.validateTree(tree), selected = candidate.snapshotFor(blocks);
  if (selected.definitions.length !== supplied.definitions.length) return fail("DEFINITION_BINDING_MISMATCH", "Public definition snapshots must match exactly the visible blocks.");
  const definitions: ComposedDefinitionSnapshot[] = [];
  const heads = new Map<string, Awaited<ReturnType<typeof findHead>>>();
  async function findHead(name: string) {
    budget.beforeRead();
    const head = budget.record(await ctx.db.query("blockDefinitions").withIndex("by_scope_name", q => q.eq("websiteKey", scope.websiteKey).eq("instanceKey", scope.instanceKey).eq("deploymentOrigin", scope.deploymentOrigin).eq("name", name)).unique());
    if (!head) return fail("DEFINITION_UNAVAILABLE", "A selected block definition is unavailable in this site.");
    return head;
  }
  for (const selectedVersion of selected.definitions) {
    let head = heads.get(selectedVersion.name);
    if (!head) { head = await findHead(selectedVersion.name); heads.set(selectedVersion.name, head); }
    const { row, value } = await readVersion(ctx, head, selectedVersion.version, budget);
    if (selectedVersion.digest !== row.digest) return fail("DEFINITION_INTEGRITY", "A saved block differs from its immutable site version.");
    const approval = await readVersionApproval(ctx, row, budget);
    if (!approval || approval.status !== "active" || approval.digest !== row.digest) return fail("DEFINITION_NOT_ACTIVE", "A selected block version is not approved for publication.");
    definitions.push({ name: head.name, version: row.version, digest: row.digest, definitionJson: value.json });
  }
  const registry = createComposedRegistry({ scope, definitions }, scope);
  return { registry, blocks: registry.validateTree(blocks), snapshot: registry.snapshotFor(blocks) };
}
