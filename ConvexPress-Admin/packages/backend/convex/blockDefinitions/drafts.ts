import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { createDefinitionDraft } from "./createDraft";
import { decodeComposedDefinition, encodeComposedDefinition } from "../canonicalDocuments/foundation/composedDefinitions";
import { checkGeneration, checkVersion, fail, owned, readVersion, readVersionApproval } from "./model";
import { insertWithMediaReferences } from "../media/attachmentGuard";

const id = v.id("blockDefinitions");
const receipt = v.object({ id, name: v.string(), version: v.number(), generation: v.number(), digest: v.string() });
const versionStatus = v.union(v.literal("draft"), v.literal("active"), v.literal("revoked"));

// Native definition management requires explicit compose authority as well as
// the action-specific capability. Approved reuse uses the separate picker.
export const create = mutation({
  args: { definitionJson: v.string() }, returns: receipt,
  handler: (ctx, args) => createDefinitionDraft(ctx, args.definitionJson),
});

export const save = mutation({
  args: { id, expectedGeneration: v.number(), definitionJson: v.string() }, returns: receipt,
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger();
    await requireCan(ctx, "blocks.compose", budget);
    const actor = await requireCan(ctx, "post.update", budget), head = await owned(ctx, args.id, actor._id, budget);
    checkGeneration(head, args.expectedGeneration);
    if (head.status === "promoted") return fail("DEFINITION_PROMOTED", "Edit the promoted Library block instead of its retired runtime definition.");
    await readVersion(ctx, head, head.lastVersion, budget);
    const value = decodeComposedDefinition(args.definitionJson), spec = value.definition.spec, version = head.lastVersion + 1;
    checkVersion(version);
    if (spec.name !== head.name || spec.version !== version) return fail("DEFINITION_VERSION", "Keep the block name and advance its version by exactly one.");
    const now = Date.now(), generation = head.generation + 1;
    await insertWithMediaReferences(ctx, "blockDefinitionVersions", { definitionId: head._id, version, definitionJson: value.json, digest: value.digest, createdBy: actor._id, createdAt: now }, undefined, budget);
    // Never rewrite a version or move the active pointer on a draft save.
    await ctx.db.patch("blockDefinitions", head._id, { title: spec.title, lastVersion: version, generation, updatedBy: actor._id, updatedAt: now });
    return { id: head._id, name: head.name, version, generation, digest: value.digest };
  },
});

export const get = query({
  args: { id, version: v.optional(v.number()) },
  returns: v.object({ id, name: v.string(), generation: v.number(), version: v.number(), lastVersion: v.number(), activeVersion: v.union(v.number(), v.null()), status: v.union(v.literal("draft"), v.literal("active"), v.literal("promoted")), versionStatus, definitionJson: v.string(), digest: v.string() }),
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger();
    await requireCan(ctx, "blocks.compose", budget);
    const actor = await requireCan(ctx, "post.read", budget), head = await owned(ctx, args.id, actor._id, budget);
    const { row, value } = await readVersion(ctx, head, args.version ?? head.lastVersion, budget);
    const approval = await readVersionApproval(ctx, row, budget);
    return { id: head._id, name: head.name, generation: head.generation, version: row.version, lastVersion: head.lastVersion, activeVersion: head.activeVersion ?? null, status: head.status, versionStatus: approval?.status ?? "draft" as const, definitionJson: value.json, digest: row.digest };
  },
});

export const restore = mutation({
  args: { id, expectedGeneration: v.number(), version: v.number(), expectedDigest: v.string() }, returns: receipt,
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger();
    await requireCan(ctx, "blocks.compose", budget);
    const actor = await requireCan(ctx, "post.restore", budget);
    await requireCan(ctx, "post.update", budget);
    const head = await owned(ctx, args.id, actor._id, budget);
    checkGeneration(head, args.expectedGeneration);
    if (head.status === "promoted") return fail("DEFINITION_PROMOTED", "Edit the promoted Library block instead of its retired runtime definition.");
    const prior = await readVersion(ctx, head, args.version, budget);
    if (prior.value.digest !== args.expectedDigest) return fail("DEFINITION_RESTORE_CHANGED", "Review the saved definition again before restoring it.");
    const version = head.lastVersion + 1;
    checkVersion(version);
    // Restoring is a new immutable version. Its authored schema/composition are
    // preserved, with only the spec's identity version advanced.
    const value = encodeComposedDefinition({ ...prior.value.definition, spec: { ...prior.value.definition.spec, version } });
    const now = Date.now(), generation = head.generation + 1;
    await insertWithMediaReferences(ctx, "blockDefinitionVersions", { definitionId: head._id, version, definitionJson: value.json, digest: value.digest, createdBy: actor._id, createdAt: now }, undefined, budget);
    await ctx.db.patch("blockDefinitions", head._id, { title: value.definition.spec.title, lastVersion: version, generation, updatedBy: actor._id, updatedAt: now });
    return { id: head._id, name: head.name, version, generation, digest: value.digest };
  },
});

export const history = query({
  args: { id, beforeVersion: v.optional(v.number()) },
  returns: v.object({ versions: v.array(v.object({ version: v.number(), digest: v.string(), versionStatus, createdAt: v.number() })), nextBeforeVersion: v.union(v.number(), v.null()) }),
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger();
    await requireCan(ctx, "blocks.compose", budget);
    const actor = await requireCan(ctx, "post.read", budget), head = await owned(ctx, args.id, actor._id, budget);
    const before = args.beforeVersion ?? head.lastVersion + 1;
    if (!Number.isInteger(before) || before < 1 || before > head.lastVersion + 1) return fail("DEFINITION_VERSION", "Invalid definition history cursor.");
    // Four version bodies plus one lookahead stay below 2.5MiB even at the
    // maximum payload size; projection alone would not reduce database reads.
    budget.beforeRead();
    const rows = await ctx.db.query("blockDefinitionVersions").withIndex("by_definition_version", q => q.eq("definitionId", head._id).lt("version", before)).order("desc").take(5);
    rows.forEach(row => budget.record(row));
    const page = rows.slice(0, 4);
    const versions = [];
    for (const row of page) {
      const approval = await readVersionApproval(ctx, row, budget);
      versions.push({ version: row.version, digest: row.digest, versionStatus: approval?.status ?? "draft" as const, createdAt: row.createdAt });
    }
    return { versions, nextBeforeVersion: rows.length > 4 ? page[page.length - 1].version : null };
  },
});
