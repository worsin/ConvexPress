import { canonicalJson, sha256Hex } from "@convexpress/site-contract";
import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { readAppearance, persistLegacyAppearance, type AppearanceValues } from "./appearanceMigration";
import { validateSectionValues } from "./validation";
import { deleteWithMediaReferences, insertWithMediaReferences, patchWithMediaReferences } from "../media/attachmentGuard";

const plain = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const slug = /^[a-z0-9][a-z0-9-]{0,63}$/;
// Module IDs follow the installed SDK vocabulary (for example menuLayout).
const moduleId = /^[a-z][a-zA-Z0-9-]{0,63}$/;
function validateValues(value: unknown): asserts value is AppearanceValues {
  if (!plain(value) || typeof value.active !== "string" || !plain(value.overrides) || !plain(value.variants) || !plain(value.settings)) throw new ConvexError({ code: "INVALID_TEMPLATE", message: "A complete template configuration is required." });
  const errors = validateSectionValues("appearance.template", value);
  for (const [pack, modules] of Object.entries(value.settings)) {
    if (!slug.test(pack) || !plain(modules)) errors.push({ field: `settings.${pack}`, message: "Invalid pack settings." });
    else for (const [module, fields] of Object.entries(modules)) if (!moduleId.test(module) || !plain(fields)) errors.push({ field: `settings.${pack}.${module}`, message: "Invalid module settings." });
  }
  if (errors.length) throw new ConvexError({ code: "INVALID_TEMPLATE", message: errors[0].message });
  if (JSON.stringify(value).length > 250_000) throw new ConvexError({ code: "INVALID_TEMPLATE", message: "Template settings are too large." });
}
const revision = (value: unknown) => sha256Hex(canonicalJson(value));
async function currentSnapshot(ctx: Pick<QueryCtx, "db">) {
  const { doc, values } = await readAppearance(ctx);
  const identity = await ctx.db.query("convexpress_siteIdentity").withIndex("by_identity_key", q => q.eq("identityKey", "site-identity")).unique();
  return {
    values,
    revision: revision({ id: doc?._id ?? null, updatedAt: doc?.updatedAt ?? null, values }),
    identity: identity ? { websiteKey: identity.websiteKey, instanceKey: identity.instanceKey, environmentKind: identity.environmentKind } : null,
  };
}

export const snapshot = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => { await requireCan(ctx, "manage_options"); return currentSnapshot(ctx); },
});

export const publish = mutation({
  args: {
    values: v.any(), expectedRevision: v.string(), confirmLive: v.optional(v.boolean()),
    source: v.optional(v.object({ websiteKey: v.string(), instanceKey: v.string(), environmentKind: v.literal("staging"), revision: v.string() })),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "manage_options");
    validateValues(args.values);
    const current = await currentSnapshot(ctx);
    if ((!current.identity || current.identity.environmentKind === "live") && args.confirmLive !== true) throw new ConvexError({ code: "LIVE_CONFIRMATION_REQUIRED", message: "Confirm publishing these changes to the live site." });
    if (args.source && (!current.identity || current.identity.environmentKind !== "live" || args.source.websiteKey !== current.identity.websiteKey || args.source.instanceKey === current.identity.instanceKey)) throw new ConvexError({ code: "PROMOTION_TARGET_MISMATCH", message: "Promotion must copy staging settings to a different live environment of the same website." });
    // A response may be lost after commit; replaying the exact reviewed snapshot is a no-op.
    if (current.revision !== args.expectedRevision && canonicalJson(current.values) === canonicalJson(args.values)) return current;
    if (current.revision !== args.expectedRevision) throw new ConvexError({ code: "TEMPLATE_CONFLICT", message: "Template settings changed after this draft was opened. Reload the published version before publishing." });
    await persistLegacyAppearance(ctx, user._id);
    const { doc } = await readAppearance(ctx);
    if (!doc) throw new Error("Appearance migration did not persist");
    await patchWithMediaReferences<"settings">(ctx, "settings", doc._id, { values: args.values, updatedAt: Math.max(Date.now(), doc.updatedAt + 1), updatedBy: user._id });
    await emitEvent(ctx, "settings.updated", "settings", { section: "appearance.template", updatedBy: user._id, source: args.source ? "staging-promotion" : "customizer", ...(args.source ? { promotionSource: args.source } : {}) });
    return currentSnapshot(ctx);
  },
});

function draftRevision(doc: { _id: unknown; updatedAt: number; sourceRevision: string; values: unknown; variants: unknown }) {
  return revision({ id: doc._id, updatedAt: doc.updatedAt, sourceRevision: doc.sourceRevision, values: doc.values, variants: doc.variants });
}
export const getDraft = query({
  args: { packId: v.string() }, returns: v.any(),
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "manage_options");
    const doc = await ctx.db.query("appearance_drafts").withIndex("by_user_pack", q => q.eq("userId", user._id).eq("packId", args.packId)).unique();
    return doc ? { values: doc.values, variants: doc.variants, sourceRevision: doc.sourceRevision, revision: draftRevision(doc), updatedAt: doc.updatedAt } : null;
  },
});
export const saveDraft = mutation({
  args: { packId: v.string(), sourceRevision: v.string(), expectedDraftRevision: v.union(v.null(), v.string()), values: v.any(), variants: v.record(v.string(), v.string()) },
  returns: v.object({ revision: v.string() }),
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "manage_options");
    validateValues({ active: args.packId, overrides: {}, variants: args.variants, settings: { [args.packId]: args.values } });
    const doc = await ctx.db.query("appearance_drafts").withIndex("by_user_pack", q => q.eq("userId", user._id).eq("packId", args.packId)).unique();
    if ((doc ? draftRevision(doc) : null) !== args.expectedDraftRevision) throw new ConvexError({ code: "DRAFT_CONFLICT", message: "This saved draft changed in another window. Load that draft before saving again." });
    const update = { userId: user._id, packId: args.packId, sourceRevision: args.sourceRevision, values: args.values, variants: args.variants, updatedAt: Math.max(Date.now(), (doc?.updatedAt ?? 0) + 1) };
    const id = doc?._id ?? await insertWithMediaReferences<"appearance_drafts">(ctx, "appearance_drafts", update);
    if (doc) await patchWithMediaReferences<"appearance_drafts">(ctx, "appearance_drafts", id, update);
    return { revision: draftRevision({ _id: id, ...update }) };
  },
});
export const discardDraft = mutation({
  args: { packId: v.string(), expectedDraftRevision: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "manage_options");
    const doc = await ctx.db.query("appearance_drafts").withIndex("by_user_pack", q => q.eq("userId", user._id).eq("packId", args.packId)).unique();
    if (!doc) return null;
    if (draftRevision(doc) !== args.expectedDraftRevision) throw new ConvexError({ code: "DRAFT_CONFLICT", message: "The saved draft changed. Reload before discarding it." });
    await deleteWithMediaReferences<"appearance_drafts">(ctx, "appearance_drafts", doc._id);
    return null;
  },
});
