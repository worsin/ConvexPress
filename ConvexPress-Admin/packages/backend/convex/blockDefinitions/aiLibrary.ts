import type { QueryCtx } from "../_generated/server";
import type { RequestReadLedger } from "../helpers/requestReadLedger";
import { readVersion, readVersionApproval, fail } from "./model";
import { COMPOSED_REGISTRY_LIMITS, createComposedRegistry, type ComposedDefinitionSnapshot, type ComposedRegistrySnapshot } from "../canonicalDocuments/foundation/composedRegistry";

/** Only approved versions enter AI context. Never disclose another author's
 * draft, or silently truncate the available library at the query budget. */
export async function approvedAiDefinitions(ctx: QueryCtx, scope: ComposedRegistrySnapshot["scope"], budget: RequestReadLedger): Promise<ComposedDefinitionSnapshot[]> {
  budget.beforeRead();
  const heads = await ctx.db.query("blockDefinitions").withIndex("by_scope_status_name", q => q
    .eq("websiteKey", scope.websiteKey).eq("instanceKey", scope.instanceKey).eq("deploymentOrigin", scope.deploymentOrigin).eq("status", "active"))
    .take(COMPOSED_REGISTRY_LIMITS.definitions + 1);
  heads.forEach(head => budget.record(head));
  if (heads.length > COMPOSED_REGISTRY_LIMITS.definitions) fail("AI_CATALOG_LIMIT", "The approved custom library exceeds the generation catalog budget. No partial catalog was used.");
  const definitions: ComposedDefinitionSnapshot[] = [];
  for (const head of heads) {
    if (head.activeVersion === undefined) continue;
    const { row, value } = await readVersion(ctx, head, head.activeVersion, budget);
    if ((await readVersionApproval(ctx, row, budget))?.status !== "active") continue;
    definitions.push({ name: head.name, version: row.version, digest: row.digest, definitionJson: value.json });
  }
  createComposedRegistry({ scope, definitions }, scope);
  return definitions;
}
