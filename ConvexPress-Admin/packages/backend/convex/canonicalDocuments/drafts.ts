import { ConvexError, getDocumentSize, v, type Infer } from "convex/values";
import type { RegisteredQuery, RegisteredMutation } from "convex/server";
import { mutation, query, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { canonicalBoundary, authorized } from "./service";
import { installation } from "./displayContext";
import { authoringRevision } from "./foundation/documentState";
import { canonicalJson } from "./foundation/shared/fingerprints";
import { recoverCanonicalDraft } from "./foundation/draftRecovery";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { insertWithMediaReferences, patchWithMediaReferences } from "../media/attachmentGuard";
import { canonicalDraftValueValidator } from "../schema/canonicalDrafts";
import { composedRegistrySnapshotValidator } from "./definitionStorage";
import { parseBlocksJson } from "./blocksJson";

type DraftScope = { websiteKey: string; instanceKey: string };
type IdentityArgs = { postId: Id<"posts">; expectedScope: DraftScope };
type DraftValue = Infer<typeof canonicalDraftValueValidator>;
type DraftResult = { postId: Id<"posts">; scope: DraftScope; generation: number; baseRevision: number | null; draft: DraftValue | null; updatedAt: number | null };
/** A draft as save receives it: the block tree is JSON text (see blocksJson.ts). */
const draftTransportValidator = v.object({
  title: v.string(), blocksJson: v.string(),
  composedDefinitions: v.optional(composedRegistrySnapshotValidator),
});
type SaveArgs = IdentityArgs & { expectedGeneration: number; baseRevision: number; draft: Infer<typeof draftTransportValidator> };
/** Leave room for system metadata below Convex's one-document limit. */
const MAX_DRAFT_BYTES = 900 * 1024;
type DiscardArgs = IdentityArgs & { expectedGeneration: number };
type Current = { post: Doc<"posts">; user: Doc<"users">; scope: DraftScope; row: Doc<"canonicalDocumentDrafts"> | null; budget: RequestReadLedger };

const scopeValidator = v.object({ websiteKey: v.string(), instanceKey: v.string() });
const identityArgs = { postId: v.id("posts"), expectedScope: scopeValidator };
const draftResult = v.object({
  postId: v.id("posts"), scope: scopeValidator, generation: v.number(),
  baseRevision: v.union(v.null(), v.number()),
  draft: v.union(v.null(), canonicalDraftValueValidator), updatedAt: v.union(v.null(), v.number()),
});
function refuse(code: string, message: string): never { throw new ConvexError({ code, message }); }
function checkGeneration(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER - 1)
    refuse("INVALID_DRAFT_GENERATION", "Reload the current private draft before saving.");
}
async function current(ctx: QueryCtx, args: IdentityArgs): Promise<Current> {
  const budget = new RequestReadLedger();
  const { post, user } = await authorized(ctx, args.postId, budget);
  if (!post) refuse("NOT_FOUND", "This document is no longer available.");
  const scope = await installation(ctx, budget);
  if (scope.websiteKey !== args.expectedScope.websiteKey || scope.instanceKey !== args.expectedScope.instanceKey)
    refuse("WRONG_SITE_SCOPE", "The editor's Website environment changed. Reopen its current document.");
  if (post.blocksVersion !== 2)
    refuse("UNSUPPORTED_AUTHORING_VERSION", "Open this document in the canonical editor before saving a private draft.");
  budget.beforeRead();
  const row = await ctx.db.query("canonicalDocumentDrafts").withIndex("by_postId_userId", q => q.eq("postId", post._id).eq("userId", user._id)).unique();
  if (row) budget.recordPage({ rows: 1, bytes: getDocumentSize(row) });
  return { post, user, scope, row, budget };
}
function result(state: Current, row: Doc<"canonicalDocumentDrafts"> | null = state.row): DraftResult {
  return { postId: state.post._id, scope: state.scope, generation: row?.generation ?? 0,
    baseRevision: row?.baseRevision ?? null, draft: row?.draft ?? null, updatedAt: row?.updatedAt ?? null };
}
export const get: RegisteredQuery<"public", IdentityArgs, Promise<DraftResult>> = query({ args: identityArgs, returns: draftResult,
  handler: (ctx, args) => canonicalBoundary(async () => result(await current(ctx, args))),
});
export const save: RegisteredMutation<"public", SaveArgs, Promise<DraftResult>> = mutation({
  args: { ...identityArgs, expectedGeneration: v.number(), baseRevision: v.number(), draft: draftTransportValidator },
  returns: draftResult,
  handler: (ctx, args) => canonicalBoundary(async () => {
    const state = await current(ctx, args); checkGeneration(args.expectedGeneration);
    // Local recovery still retains oversized or otherwise unfinished input.
    const tooLarge = () => refuse("DRAFT_TOO_LARGE", "This private draft is too large for site autosave. Keep its device copy and reduce its size.");
    if (new TextEncoder().encode(args.draft.blocksJson).length > MAX_DRAFT_BYTES) tooLarge();
    const { blocksJson, ...fields } = args.draft;
    const submitted = { ...fields, blocks: parseBlocksJson(blocksJson, "draft.blocksJson") };
    const generation = state.row?.generation ?? 0;
    // A lost acknowledgement may repeat the immediately preceding exact write,
    // but can never recreate a discarded draft or overwrite a newer payload.
    if (generation !== args.expectedGeneration) {
      if (state.row && generation === args.expectedGeneration + 1 && state.row.baseRevision === args.baseRevision && canonicalJson(state.row.draft) === canonicalJson(submitted)) return result(state);
      refuse("DRAFT_CONFLICT", "Your private draft changed in another window. Load it before replacing it.");
    }
    if (authoringRevision(state.post) !== args.baseRevision)
      refuse("CONFLICT", "The saved document changed. Resolve that conflict before autosaving again.");
    if (state.row?.baseRevision === args.baseRevision && canonicalJson(state.row.draft) === canonicalJson(submitted)) return result(state);
    const draft = recoverCanonicalDraft(submitted);
    if (draft.composedDefinitions) {
      const authored = draft.composedDefinitions.scope;
      if (authored.websiteKey !== state.scope.websiteKey || authored.instanceKey !== state.scope.instanceKey)
        refuse("WRONG_SITE_SCOPE", "This draft contains definitions from another Website environment.");
    }
    const values = { postId: state.post._id, userId: state.user._id, generation: generation + 1, baseRevision: args.baseRevision,
      draft: draft as DraftValue, updatedAt: Math.max(Date.now(), (state.row?.updatedAt ?? 0) + 1) };
    if (getDocumentSize(values.draft) > MAX_DRAFT_BYTES) tooLarge();
    const id = state.row?._id ?? await insertWithMediaReferences<"canonicalDocumentDrafts">(ctx, "canonicalDocumentDrafts", values, undefined, state.budget);
    if (state.row) await patchWithMediaReferences<"canonicalDocumentDrafts">(ctx, "canonicalDocumentDrafts", id, values, undefined, state.budget);
    return result(state, { ...values, _id: id, _creationTime: state.row?._creationTime ?? values.updatedAt });
  }),
});
export const discard: RegisteredMutation<"public", DiscardArgs, Promise<DraftResult>> = mutation({
  args: { ...identityArgs, expectedGeneration: v.number() }, returns: draftResult,
  handler: (ctx, args) => canonicalBoundary(async () => {
    const state = await current(ctx, args); checkGeneration(args.expectedGeneration);
    const generation = state.row?.generation ?? 0;
    if (generation !== args.expectedGeneration) {
      if (state.row?.draft === null && generation === args.expectedGeneration + 1) return result(state);
      refuse("DRAFT_CONFLICT", "Your private draft changed in another window. Load it before discarding it.");
    }
    // Keep the generation tombstone: deleting it would let a delayed first
    // autosave with expectedGeneration=0 recreate explicitly discarded input.
    const values = { postId: state.post._id, userId: state.user._id, generation: generation + 1,
      baseRevision: authoringRevision(state.post), draft: null, updatedAt: Math.max(Date.now(), (state.row?.updatedAt ?? 0) + 1) };
    const id = state.row?._id ?? await insertWithMediaReferences<"canonicalDocumentDrafts">(ctx, "canonicalDocumentDrafts", values, undefined, state.budget);
    if (state.row) await patchWithMediaReferences<"canonicalDocumentDrafts">(ctx, "canonicalDocumentDrafts", id, values, undefined, state.budget);
    return result(state, { ...values, _id: id, _creationTime: state.row?._creationTime ?? values.updatedAt });
  }),
});
