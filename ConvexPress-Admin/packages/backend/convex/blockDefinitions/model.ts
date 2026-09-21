import { ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { resolveUserRole } from "../helpers/permissions";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { installation } from "../syncedBlocks/model";
import { decodeComposedDefinition } from "../canonicalDocuments/foundation/composedDefinitions";

export function fail(code: string, message: string): never { throw new ConvexError({ code, message }); }
export function checkGeneration(head: Doc<"blockDefinitions">, expected: number) {
  if (!Number.isSafeInteger(expected) || expected !== head.generation || !Number.isSafeInteger(expected + 1)) fail("DEFINITION_CONFLICT", "The block definition changed. Reload it before saving.");
}
export function checkVersion(version: number) {
  if (!Number.isInteger(version) || version < 1 || version > 1_000_000) fail("DEFINITION_VERSION", "Select an existing block definition version.");
}
export async function owned(ctx: QueryCtx, id: Id<"blockDefinitions">, actorId: Id<"users">, budget: RequestReadLedger) {
  const scope = await installation(ctx, budget);
  budget.beforeRead(); const head = await ctx.db.get("blockDefinitions", id); budget.record(head);
  if (!head || head.websiteKey !== scope.websiteKey || head.instanceKey !== scope.instanceKey || head.deploymentOrigin !== scope.deploymentOrigin) return fail("DEFINITION_UNAVAILABLE", "This block definition is unavailable in the current website.");
  if (head.createdBy !== actorId) {
    budget.beforeRead(); const actor = await ctx.db.get("users", actorId); budget.record(actor);
    const role = actor ? await resolveUserRole(ctx, actor, budget) : null;
    if (!role || role.level < 80) return fail("DEFINITION_UNAVAILABLE", "This block definition is unavailable to the current author.");
  }
  return head;
}
export async function readVersion(ctx: QueryCtx, head: Doc<"blockDefinitions">, version: number, budget: RequestReadLedger) {
  checkVersion(version);
  if (version > head.lastVersion) return fail("DEFINITION_VERSION", "This block definition version is unavailable.");
  budget.beforeRead();
  const row = await ctx.db.query("blockDefinitionVersions").withIndex("by_definition_version", q => q.eq("definitionId", head._id).eq("version", version)).unique();
  budget.record(row);
  if (!row) return fail("DEFINITION_VERSION", "This block definition version is unavailable.");
  const value = decodeComposedDefinition(row.definitionJson, row.digest);
  if (value.definition.spec.name !== head.name || value.definition.spec.version !== row.version) return fail("DEFINITION_INTEGRITY", "The stored block identity does not match its version.");
  return { row, value };
}

export async function readVersionApproval(ctx: QueryCtx, version: Pick<Doc<"blockDefinitionVersions">, "definitionId" | "version" | "digest">, budget: RequestReadLedger) {
  budget.beforeRead();
  const approval = budget.record(await ctx.db.query("blockDefinitionApprovals").withIndex("by_definition_version", q => q.eq("definitionId", version.definitionId).eq("version", version.version)).unique());
  if (approval && approval.digest !== version.digest) return fail("DEFINITION_INTEGRITY", "The approval differs from its immutable version.");
  return approval;
}
