import { approvedAiDefinitions } from "../blockDefinitions/aiLibrary";
import { aiResourcesValidator, readAiResources, assertAiReferences, type AiResourceSelection } from "./aiResources";
import { ConvexError, v } from "convex/values";
import type { RegisteredQuery, RegisteredMutation } from "convex/server";
import { internalQuery, query, mutation, type QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireCan } from "../helpers/permissions";
import { canEditContent } from "../helpers/publicContent";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { installation } from "../syncedBlocks/model";
import { readVersion, readVersionApproval } from "../blockDefinitions/model";
import { displayContext } from "./displayContext";
import { readAuthoredDocument } from "./definitions";
import { canonicalBoundary, saveDocument, previewDocument } from "./service";
import { receiptValidator, documentReadValidator } from "./validators";
import { authoringRevision } from "./foundation/documentState";
import { canonicalJson, sha256Hex } from "./foundation/shared/fingerprints";
import { createAiCatalog } from "./foundation/aiCatalog";
import { createComposedRegistry, type RuntimeCanonicalTree } from "./foundation/composedRegistry";
import { packTreatmentSupport, blockPresentationForPack } from "./foundation/generated/metadata";
import { aiCatalogRevision } from "./foundation/generated/ai_catalog";
import { templatePatterns } from "./foundation/generated/patterns";
import { canonicalStoredTreeValidator } from "./foundation/generated/storage";
import type { CanonicalWriteReceipt, CanonicalDocumentRead } from "./foundation/documentContracts";

const scopeValidator = v.object({ websiteKey: v.string(), instanceKey: v.string(), deploymentOrigin: v.string() });
const baseArgs = { postId: v.id("posts"), expectedRevision: v.number(), expectedScope: scopeValidator, resources: v.optional(aiResourcesValidator) };
type BaseArgs = { resources?: AiResourceSelection; postId: Id<"posts">; expectedRevision: number; expectedScope: { websiteKey: string; instanceKey: string; deploymentOrigin: string } };
type ContextReceipt = { contextJson: string; fingerprint: string };
type Proposal = { title: string; blocks: RuntimeCanonicalTree; fingerprint: string };
type ResultArgs = BaseArgs & { expectedFingerprint: string; resultJson: string; proposalId: string };
type ApplyArgs = BaseArgs & { expectedFingerprint: string; title: string; blocks: unknown };
interface ProposalNode { id: string; children?: ProposalNode[]; [field: string]: unknown }
function fail(code: string, message: string): never { throw new ConvexError({ code, message }); }
const MAX_CONTEXT_BYTES = 1024 * 1024;

/** Load authority in the current transaction. No client catalog, policy or
 * definition snapshot is accepted as permission to generate or commit. */
export async function loadAiContext(ctx: QueryCtx, args: BaseArgs): Promise<ContextReceipt & { catalog: ReturnType<typeof createAiCatalog>; assertReferences: (tree: RuntimeCanonicalTree) => void }> {
  const budget = new RequestReadLedger();
  const actor = await requireCan(ctx, "blocks.ai", budget);
  const scope = await installation(ctx, budget);
  if (canonicalJson(scope) !== canonicalJson(args.expectedScope))
    fail("AI_SCOPE_CHANGED", "The selected website environment changed. Generate a new proposal.");
  budget.beforeRead();
  const post = budget.record(await ctx.db.get("posts", args.postId));
  if (!post || !await canEditContent(ctx, post, budget)) fail("FORBIDDEN", "You cannot edit this document.");
  if (post.blocksVersion !== 2 || post.contentMode !== "blocks" || !["page", "post"].includes(post.type) || !["draft", "publish", "private", "future"].includes(post.status))
    fail("AI_DOCUMENT_REQUIRED", "Open an editable canonical block document before generating content.");
  if (!Number.isSafeInteger(args.expectedRevision) || authoringRevision(post) !== args.expectedRevision)
    fail("AI_DOCUMENT_CHANGED", "The document changed. Generate a new proposal before applying it.");
  if (post.status !== "draft") await requireCan(ctx, post.type === "page" ? "page.publish" : "post.publish", budget);

  const authored = await readAuthoredDocument(ctx, post, budget);
  const display = await displayContext(ctx, budget);
  const packId = display.presentation.packId;
  if (!Object.prototype.hasOwnProperty.call(packTreatmentSupport, packId))
    fail("AI_TEMPLATE_UNAVAILABLE", "The active template is not installed in this site's block catalog.");

  const definitions = await approvedAiDefinitions(ctx, scope, budget);
  // Existing approved pins remain available even when a newer preferred version
  // exists. Unapproved drafts can be edited manually, but are not AI examples.
  for (const saved of authored.composedDefinitions?.definitions ?? []) {
    if (definitions.some(item => item.name === saved.name && item.version === saved.version)) continue;
    budget.beforeRead();
    const head = budget.record(await ctx.db.query("blockDefinitions").withIndex("by_scope_name", q => q
      .eq("websiteKey", scope.websiteKey).eq("instanceKey", scope.instanceKey).eq("deploymentOrigin", scope.deploymentOrigin).eq("name", saved.name)).unique());
    if (!head || head.status === "promoted") continue;
    const { row, value } = await readVersion(ctx, head, saved.version, budget);
    if ((await readVersionApproval(ctx, row, budget))?.status === "active")
      definitions.push({ name: head.name, version: row.version, digest: row.digest, definitionJson: value.json });
  }
  definitions.sort((a, b) => a.name.localeCompare(b.name) || a.version - b.version);
  const snapshot = { scope, definitions };
  createComposedRegistry(snapshot, scope); // Enforce cumulative size and count.
  const presentation = blockPresentationForPack(packId);
  const catalogContext = { policy: display.policy, packId, hiddenBlocks: [...presentation.hidden], styles: presentation.styles, definitions: snapshot };
  const catalog = createAiCatalog(catalogContext);
  const allowed = new Set(catalog.entries.map(entry => `${entry.name}@${entry.version}`));
  const available = (nodes: RuntimeCanonicalTree): boolean => nodes.every(node => allowed.has(`${node.name}@${node.version}`) && (!node.children || available(node.children)));
  // The provider never sees an authored draft custom definition or an unavailable
  // tree as a usable example. Refuse the request without dropping user content.
  if (!available(authored.blocks)) fail("AI_DOCUMENT_UNAVAILABLE", "This document contains unavailable or unapproved blocks. Resolve them before generating content.");
  const patterns = templatePatterns.filter(pattern => pattern.packId === packId && available(pattern.blocks));
  const resources = await readAiResources(ctx, args.resources, budget);
  const context = { resources, catalog: catalogContext, presentationRevision: display.presentation.revision,
    document: { id: post._id, title: authored.title, revision: args.expectedRevision, digest: authored.digest, blocks: authored.blocks }, patterns };
  const contextJson = canonicalJson(context);
  if (new TextEncoder().encode(contextJson).length > MAX_CONTEXT_BYTES) fail("AI_CONTEXT_LIMIT", "The document and catalog exceed the generation context budget.");
  const identity = await ctx.auth.getUserIdentity();
  // Bind to this session as well as the user. This hash stays out of provider prompts.
  const fingerprint = sha256Hex(canonicalJson({ context, catalogRevision: aiCatalogRevision, actor: actor._id,
    session: identity?.tokenIdentifier, status: post.status, author: post.authorId, visibility: post.visibility }));
  return { contextJson, fingerprint, catalog, assertReferences: tree => assertAiReferences(tree, authored.blocks, resources, snapshot) };
}

export const get: RegisteredQuery<"internal", BaseArgs, Promise<ContextReceipt>> = internalQuery({
  args: baseArgs,
  returns: v.object({ contextJson: v.string(), fingerprint: v.string() }),
  handler: (ctx, args: BaseArgs) => canonicalBoundary(async () => {
    const { contextJson, fingerprint } = await loadAiContext(ctx, args);
    return { contextJson, fingerprint };
  }),
});

/** Recheck after a provider returns; no write or partial tree is made here. */
export const validateResult: RegisteredQuery<"internal", ResultArgs, Promise<Proposal>> = internalQuery({
  args: { ...baseArgs, expectedFingerprint: v.string(), resultJson: v.string(), proposalId: v.string() },
  returns: v.object({ title: v.string(), blocks: canonicalStoredTreeValidator, fingerprint: v.string() }),
  handler: (ctx, args: ResultArgs) => canonicalBoundary(async () => {
    const { catalog, fingerprint, assertReferences } = await loadAiContext(ctx, args);
    if (fingerprint !== args.expectedFingerprint) fail("AI_CONTEXT_CHANGED", "Generation context changed. Generate a new proposal.");
    if (!/^[a-f0-9-]{36}$/.test(args.proposalId)) fail("AI_PROPOSAL_ID", "Invalid generation proposal identity.");
    if (new TextEncoder().encode(args.resultJson).length > MAX_CONTEXT_BYTES) fail("AI_RESULT_LIMIT", "The generated proposal is too large.");
    let parsed: unknown;
    try { parsed = JSON.parse(args.resultJson); } catch { return fail("AI_INVALID_RESULT", "The provider did not return a valid block proposal."); }
    try {
      // The action supplies a fresh proposal UUID; the model cannot select IDs.
      let index = 0;
      const value = catalog.validate(parsed, () => `ai_${args.proposalId}_${++index}`);
      assertReferences(value.blocks);
      return { ...value, fingerprint };
    } catch { return fail("AI_INVALID_RESULT", "The generated proposal does not satisfy the current block catalog."); }
  }),
});

/** A single explicit acceptance save, with all context and document checks in
 * the same transaction as normal authoring validation and revision history. */
export const apply: RegisteredMutation<"public", ApplyArgs, Promise<CanonicalWriteReceipt>> = mutation({
  args: { ...baseArgs, expectedFingerprint: v.string(), title: v.string(), blocks: canonicalStoredTreeValidator },
  returns: receiptValidator,
  handler: (ctx, args: ApplyArgs) => canonicalBoundary(async () => {
    const validated = await validateProposal(ctx, args);
    return saveDocument(ctx, { postId: args.postId, expectedRevision: args.expectedRevision, ...validated });
  }),
});

async function validateProposal(ctx: QueryCtx, args: ApplyArgs) {
    const { catalog, fingerprint } = await loadAiContext(ctx, args);
    if (fingerprint !== args.expectedFingerprint) fail("AI_CONTEXT_CHANGED", "Generation context changed. Review a new proposal before saving.");
    const ids: string[] = [];
    const stripIds = (nodes: ProposalNode[]): unknown[] => nodes.map(({ id, children, ...node }) => {
      ids.push(id);
      return { ...node, ...(children ? { children: stripIds(children) } : {}) };
    });
    const input = { title: args.title, blocks: stripIds(args.blocks as ProposalNode[]) };
    let index = 0;
    const validated = catalog.validate(input, () => ids[index++]);
    return validated;
}

/** Fresh authorization and resource reads on every preview renewal. The
 * proposed revision/digest identifies this unsaved rendering, not a saved page. */
export const preview: RegisteredQuery<"public", ApplyArgs & { request?: Record<string, string> }, Promise<CanonicalDocumentRead>> = query({
  args: { ...baseArgs, expectedFingerprint: v.string(), title: v.string(), blocks: canonicalStoredTreeValidator, request: v.optional(v.record(v.string(), v.string())) },
  returns: documentReadValidator,
  handler: (ctx, args: ApplyArgs & { request?: Record<string, string> }) => canonicalBoundary(async () => {
    const validated = await validateProposal(ctx, args);
    return previewDocument(ctx, { postId: args.postId, expectedRevision: args.expectedRevision, ...validated }, args.request);
  }),
});
