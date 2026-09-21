import type { QueryCtx } from "../_generated/server";
import { requireCan, resolveUserRole } from "../helpers/permissions";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { installation } from "../syncedBlocks/model";
import { readVersion, readVersionApproval, fail } from "./model";
import { createComposedRegistry, composedDefinitionRequests, COMPOSED_REGISTRY_LIMITS, type ComposedDefinitionSnapshot } from "../canonicalDocuments/foundation/composedRegistry";

/** Page-authoring lookup. Approved versions may be reused by site editors;
 * unapproved versions remain restricted to their owner or an administrator.
 * This never grants definition-editing authority and never trusts client schemas. */
export async function loadAuthoringComposedRegistry(ctx: QueryCtx, tree: unknown, budget = new RequestReadLedger()) {
  const actor = await requireCan(ctx, "post.update", budget);
  const scope = await installation(ctx, budget);
  const requests = composedDefinitionRequests(tree);
  const role = requests.length ? await resolveUserRole(ctx, actor, budget) : null;
  const definitions: ComposedDefinitionSnapshot[] = [];
  let bytes = new TextEncoder().encode(JSON.stringify({ scope, definitions: [] })).length;
  const heads = new Map<string, Awaited<ReturnType<typeof findHead>>>();
  async function findHead(name: string) {
    budget.beforeRead();
    const head = await ctx.db.query("blockDefinitions").withIndex("by_scope_name", q => q.eq("websiteKey", scope.websiteKey).eq("instanceKey", scope.instanceKey).eq("deploymentOrigin", scope.deploymentOrigin).eq("name", name)).unique();
    budget.record(head);
    if (!head) return fail("DEFINITION_UNAVAILABLE", "This block definition is unavailable to the current site and author.");
    return head;
  }
  for (const request of requests) {
    let head = heads.get(request.name);
    if (!head) { head = await findHead(request.name); heads.set(request.name, head); }
    const { row, value } = await readVersion(ctx, head, request.version, budget);
    if (head.createdBy !== actor._id && (!role || role.level < 80)) {
      const approval = await readVersionApproval(ctx, row, budget);
      if (approval?.status !== "active") return fail("DEFINITION_UNAVAILABLE", "This block version is not available for reuse by the current author.");
    }
    const snapshot = { ...request, digest: row.digest, definitionJson: value.json };
    bytes += new TextEncoder().encode(JSON.stringify(snapshot)).length + (definitions.length ? 1 : 0);
    if (bytes > COMPOSED_REGISTRY_LIMITS.bytes) return fail("DEFINITION_REGISTRY_BUDGET", "The page uses more custom definition data than its safe snapshot limit.");
    definitions.push(snapshot);
  }
  const registry = createComposedRegistry({ scope, definitions }, scope);
  // Preserve the exact authored versions; a newer head never supplies defaults
  // or a schema for a node saved against an older version.
  const blocks = registry.validateTree(tree);
  return { registry, blocks, snapshot: registry.snapshotFor(blocks) };
}
