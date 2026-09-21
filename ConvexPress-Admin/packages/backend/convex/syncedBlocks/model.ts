import { collectCanonicalMediaIds } from "../canonicalDocuments/foundation/documentContracts";
import { collectContactDefinitions } from "../canonicalDocuments/contactDefinitions";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { assertMediaAttachments } from "../media/attachmentGuard";
import { resolveUserRole } from "../helpers/permissions";
import { validateCanonicalTree } from "../canonicalDocuments/foundation/generated/instances";
import { syncedContentDigest } from "../canonicalDocuments/foundation/syncedContent";
import { ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { resolveSyncedContent, syncedScopeSchema, type SyncedRequest, type SyncedRevision, type SyncedScope } from "../canonicalDocuments/foundation/syncedContent";
import { canonicalJson, sha256Hex } from "../canonicalDocuments/foundation/shared/fingerprints";

export function syncedFailure(code: string, message: string): never { throw new ConvexError({ code, message }); }
export async function installation(ctx: QueryCtx, budget?: RequestReadLedger): Promise<SyncedScope> {
  budget?.beforeRead();
  const site = await ctx.db.query("convexpress_siteIdentity").withIndex("by_identity_key", q => q.eq("identityKey", "site-identity")).unique();
  budget?.record(site);
  if (!site) return syncedFailure("SYNCED_INSTALLATION", "Set up this website before creating synced content.");
  return syncedScopeSchema.parse({ websiteKey: site.websiteKey, instanceKey: site.instanceKey, deploymentOrigin: site.deploymentOrigin });
}
export async function ownedSource(ctx: QueryCtx, id: Id<"syncedBlocks">, scope: SyncedScope, budget?: RequestReadLedger): Promise<Doc<"syncedBlocks"> | null> {
  budget?.beforeRead();
  const source = await ctx.db.get("syncedBlocks", id);
  budget?.record(source);
  return source && source.websiteKey === scope.websiteKey && source.instanceKey === scope.instanceKey && source.deploymentOrigin === scope.deploymentOrigin ? source : null;
}
export async function storedRevision(ctx: QueryCtx, id: Id<"syncedBlocks">, revision: number, budget?: RequestReadLedger): Promise<Doc<"syncedBlockRevisions"> | null> {
  budget?.beforeRead();
  const version = await ctx.db.query("syncedBlockRevisions").withIndex("by_source_revision", q => q.eq("syncedBlockId", id).eq("revision", revision)).unique();
  budget?.record(version);
  return version;
}
export function checkGeneration(source: Doc<"syncedBlocks">, expected: number): void {
  if (!Number.isSafeInteger(expected) || source.generation !== expected || !Number.isSafeInteger(expected + 1)) syncedFailure("SYNCED_CONFLICT", "Synced content changed. Reload it before saving or publishing.");
}
export function publishedProjection(source: Doc<"syncedBlocks">, version: Doc<"syncedBlockRevisions">, scope: SyncedScope): SyncedRevision {
  // The graph parser validates the stored canonical tree and content digest.
  return { id: source._id, revision: version.revision, title: version.title, blocks: version.blocks as SyncedRevision["blocks"], digest: version.digest, scope, published: true };
}
/** Service-only reader. Callers own document/actor authorization and share the
 * request's scope; this is deliberately not an unauthenticated public query. */
export function publishedReader(ctx: QueryCtx, scope: SyncedScope, budget?: RequestReadLedger, onSource?: (id: Id<"syncedBlocks">) => void): (request: SyncedRequest) => Promise<SyncedRevision | null> {
  return async request => {
    const id = ctx.db.normalizeId("syncedBlocks", request.id);
    if (!id) return null;
    const source = await ownedSource(ctx, id, scope, budget);
    if (!source) return null;
    // Include owned but withdrawn sources so republishing can find consumers.
    // Foreign/missing heads never become consumer dependencies.
    onSource?.(source._id);
    if (source.publishedRevision === undefined) return null;
    const version = await storedRevision(ctx, id, request.revisionPolicy === "latest" ? source.publishedRevision : request.revision, budget);
    if (!version || version.publishedAt === undefined) return null;
    return publishedProjection(source, version, scope);
  };
}
export async function publicationReview(ctx: QueryCtx, source: Doc<"syncedBlocks">, version: Doc<"syncedBlockRevisions">, scope: SyncedScope, budget = new RequestReadLedger()) {
  const read = publishedReader(ctx, scope, budget);
  const candidate = publishedProjection(source, version, scope);
  const graph = await resolveSyncedContent([{ id: "publication-review", name: "core/synced", version: 1, attrs: { syncedBlock: source._id, revisionPolicy: "pinned", revision: version.revision } }], scope, async request => {
    // Simulate the publication pointer atomically, including latest self-links.
    if (request.id === source._id) {
      if (request.revisionPolicy === "latest" || request.revision === version.revision) return candidate;
      // The simulated pointer also restores availability of this source's
      // previously published pinned revisions after a whole-source withdrawal.
      const older = await storedRevision(ctx, source._id, request.revision, budget);
      return older?.publishedAt !== undefined ? publishedProjection(source, older, scope) : null;
    }
    return read(request);
  }, { requireAvailable: true });
  // Reject semantic form errors before a source can invalidate all consumers.
  // Creating or updating per-page Forms projections remains an authorized write.
  for (const revision of graph.revisions) collectContactDefinitions(revision.blocks);
  for (const revision of graph.revisions) await assertMediaAttachments(ctx, "syncedBlockRevisions", { title: revision.title, blocks: revision.blocks }, budget, collectCanonicalMediaIds(revision.blocks));
  const dependencies = graph.bindings.map(binding => ({ path: binding.path, ...binding.target! }));
  const digest = sha256Hex(canonicalJson({ scope, id: source._id, generation: source.generation, revision: version.revision, digest: version.digest, dependencies }));
  return { digest, dependencies, expandedNodes: graph.expandedNodes };
}

export function content(title: string, input: unknown) {
  const normalized = title.trim();
  if (!normalized || normalized.length > 512) syncedFailure("SYNCED_TITLE", "Enter a synced content title of at most 512 characters.");
  const blocks = validateCanonicalTree(input);
  return { title: normalized, blocks, digest: syncedContentDigest(normalized, blocks) };
}
export async function owned(ctx: QueryCtx, sourceId: Id<"syncedBlocks">, actorId: Id<"users">, budget?: RequestReadLedger) {
  const scope = await installation(ctx, budget), source = await ownedSource(ctx, sourceId, scope, budget);
  if (!source) return syncedFailure("SYNCED_UNAVAILABLE", "This synced content is unavailable in the current website.");
  if (source.createdBy !== actorId) {
    budget?.beforeRead();
    const actor = await ctx.db.get("users", actorId);
    budget?.record(actor);
    const role = actor ? await resolveUserRole(ctx, actor, budget) : null;
    if (!role || role.level < 80) return syncedFailure("SYNCED_FORBIDDEN", "An Editor role is required to manage another author's synced content.");
  }
  return { scope, source };
}
export async function selected(ctx: QueryCtx, sourceId: Id<"syncedBlocks">, generation: number, revision: number, actorId: Id<"users">, budget?: RequestReadLedger) {
  const state = await owned(ctx, sourceId, actorId, budget);
  checkGeneration(state.source, generation);
  if (!Number.isInteger(revision) || revision < 1 || revision > state.source.lastRevision) return syncedFailure("SYNCED_REVISION", "Select an existing synced content revision.");
  const version = await storedRevision(ctx, sourceId, revision, budget);
  if (!version) return syncedFailure("SYNCED_REVISION", "This synced content revision is unavailable.");
  return { ...state, version };
}
