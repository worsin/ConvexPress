import type { MutationCtx } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { installation } from "../syncedBlocks/model";
import { decodeComposedDefinition } from "../canonicalDocuments/foundation/composedDefinitions";
import { fail } from "./model";
import { insertWithMediaReferences } from "../media/attachmentGuard";

/** Shared transaction for manual and reviewed AI creation. Always a draft. */
export async function createDefinitionDraft(ctx: MutationCtx, definitionJson: string) {
    const budget = new RequestReadLedger();
    await requireCan(ctx, "blocks.compose", budget);
    const actor = await requireCan(ctx, "post.create", budget), scope = await installation(ctx, budget);
    const value = decodeComposedDefinition(definitionJson), spec = value.definition.spec;
    if (spec.version !== 1) return fail("DEFINITION_VERSION", "A new composed block starts at version 1.");
    budget.beforeRead();
    const existing = await ctx.db.query("blockDefinitions").withIndex("by_scope_name", q => q.eq("websiteKey", scope.websiteKey).eq("instanceKey", scope.instanceKey).eq("deploymentOrigin", scope.deploymentOrigin).eq("name", spec.name)).unique();
    budget.record(existing);
    if (existing) return fail("DEFINITION_EXISTS", "A block with this name already exists in this website.");
    const now = Date.now();
    const definitionId = await ctx.db.insert("blockDefinitions", { ...scope, name: spec.name, title: spec.title, generation: 1, lastVersion: 1, status: "draft", createdBy: actor._id, updatedBy: actor._id, createdAt: now, updatedAt: now });
    await insertWithMediaReferences(ctx, "blockDefinitionVersions", { definitionId, version: 1, definitionJson: value.json, digest: value.digest, createdBy: actor._id, createdAt: now }, undefined, budget);
    return { id: definitionId, name: spec.name, version: 1, generation: 1, digest: value.digest };
}
