import { owned as ownedDefinition, checkGeneration as checkDefinitionGeneration, readVersion as readDefinitionVersion } from "../blockDefinitions/model";
import { decodeComposedDefinition, composedAttrsSchema } from "./foundation/composedDefinitions";
import { parseAuthoredDefinitionContent, type AuthoredDefinitionContent } from "./foundation/authoredDefinitions";
import { owned as ownedSyncedSource, checkGeneration } from "../syncedBlocks/model";
import { requireAssignableCategory } from "../kb/helpers/categoryHierarchy";
import { installation, displayContext } from "./displayContext";
import { loadDocumentWriteContext, readAuthoredDocument, readStoredDocument, readApprovedDocument } from "./definitions";
import { loadPublishedComposedRegistry } from "../blockDefinitions/publishedRegistry";
import type { RuntimeCanonicalTree } from "./foundation/composedRegistry";
import type { ComposedDataContext } from "./foundation/planner";
import * as catalogRevisionWrites from "../media/attachmentGuard";
import { syncDocumentContactForms } from "./contactDocuments";
import { clearSyncedConsumerDirty } from "../syncedBlocks/consumerWrites";
import { insertTermRelationship } from "../helpers/postDiscovery";
import { makeFunctionReference } from "convex/server";
import { ConvexError, getDocumentSize, type Value } from "convex/values";
import type {
	PaginationOptions,
	PaginationResult,
	WithoutSystemFields,
} from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { requireAuth, requireCan } from "../helpers/permissions";
import { canEditContent, canDiscoverContent, readPublicContent } from "../helpers/publicContent";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { enabledPluginIds } from "../helpers/plugins";
import {
	authoringSnapshot,
	restoredAuthoring,
} from "../helpers/authoringSnapshot";
import { permitValidatedCanonicalAuthoringWrite } from "../helpers/authoringVersionFence";
import {
	insertWithMediaReferences,
	patchWithMediaReferences,
} from "../media/attachmentGuard";
import { canonicalJson, sha256Hex } from "./foundation/shared/fingerprints";
import { validateCanonicalTree, assertPackTreatments } from "./foundation/generated/instances";
import {
	parseCanonicalDocumentRead,
	canonicalInitializationSchema,
	canonicalRevisionPageSchema,
	canonicalPageOptionsSchema,
	collectCanonicalDisplayMediaIds,
  collectCanonicalMediaIds,
	canonicalContentDigest,
	type CanonicalDocumentRead,
	type CanonicalDocumentDto,
	type CanonicalWriteReceipt,
	type CanonicalRevisionPage,
	type CanonicalPageOptions,
} from "./foundation/documentContracts";
import { renderMediaSchema } from "./foundation/renderResources";
import {
	authoringRevision,
	authoringSourceDigest,
	initializationReason,
	prepareCanonicalInitialize,
	prepareCanonicalSave,
	prepareCanonicalRestore,
 prepareCanonicalPublication,
 type PublicationStatus,
 type CanonicalPublicationPatch,
	type PreparedCanonicalWrite,
 type PreparedRuntimeCanonicalWrite,
} from "./foundation/documentState";
import { resolveCanonicalPageData } from "./data";
import { projectPublicBlocks } from "./publicBlocks";
import { LegacyMigrationError, migrateLegacyDocument } from "./foundation/legacyDocumentMigration";
import { reviewLegacyBlocks } from "./foundation/legacyBlockMigration";
import { hasStructuredArticle, migrateStructuredArticle } from "./foundation/legacyStructuredMigration";
import { migrateLegacySections } from "./foundation/legacySectionMigration";
import { parseCanonicalMigration, type CanonicalMigrationDto } from "./foundation/migrationContracts";
function refuse(code: string, message: string): never {
	throw new ConvexError({ code, message });
}
export async function canonicalBoundary<T>(run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (error) {
		if (error instanceof ConvexError) throw error;
    if (error instanceof LegacyMigrationError) throw new ConvexError({ code: error.code, path: error.path, message: error.message });
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			typeof error.code === "string"
		)
			refuse(
				error.code,
				"The canonical document failed validation. Reload or correct the indicated document before saving.",
			);
		if (error instanceof Error && error.name === "ZodError")
			refuse(
				"INVALID_CANONICAL_DOCUMENT",
				"The document does not satisfy the canonical contract.",
			);
		throw error;
	}
}
async function authorized(
	ctx: QueryCtx,
	postId: Id<"posts">,
	budget: RequestReadLedger,
) {
	const user = await requireAuth(ctx, budget);
	budget.beforeRead();
	const post = budget.record(await ctx.db.get("posts", postId));
	if (!post) return { post: null, user };
	if (!(await canEditContent(ctx, post, budget)))
		refuse("FORBIDDEN", "You cannot edit this document.");
	if (post.status === "trash")
		refuse(
			"CANONICAL_DRAFT_REQUIRED",
			"Restore the document from Trash before editing.",
		);
	return { post, user };
}
/** Resource choices belong to the real document being edited. A reusable
 * source has its own identity and generation; it must never impersonate a post. */
export type CanonicalOptionsOwner =
  | { postId: Id<"posts"> }
  | { syncedBlockId: Id<"syncedBlocks">; expectedGeneration: number };
export type CanonicalOptionsArgs = CanonicalOptionsOwner & { paginationOpts: PaginationOptions };
async function authorizeOptions(ctx: QueryCtx, owner: CanonicalOptionsOwner, budget: RequestReadLedger): Promise<void> {
  if ("postId" in owner) {
    const { post } = await authorized(ctx, owner.postId, budget);
    if (!post) refuse("NOT_FOUND", "Document not found.");
    return;
  }
  const actor = await requireCan(ctx, "post.update", budget);
  const { source } = await ownedSyncedSource(ctx, owner.syncedBlockId, actor._id, budget);
  checkGeneration(source, owner.expectedGeneration);
}
async function validateNewKnowledgeCategoryReferences(ctx: QueryCtx, blocks: RuntimeCanonicalTree, previous: RuntimeCanonicalTree, budget: RequestReadLedger) {
  const prior = new Map<string, string>();
  const collect = (tree: RuntimeCanonicalTree) => { for (const block of tree) { if (block.name === "support/kb-search" && block.attrs.category) prior.set(block.id, block.attrs.category); if (block.children) collect(block.children); } };
  collect(previous);
  const checked = new Set<string>();
  const inspect = async (tree: RuntimeCanonicalTree): Promise<void> => {
    for (const block of tree) {
      if (block.name === "support/kb-search" && block.attrs.category && prior.get(block.id) !== block.attrs.category && !checked.has(block.attrs.category)) {
        const id = ctx.db.normalizeId("kb_categories", block.attrs.category);
        if (!id) refuse("NOT_FOUND", "Help category not found.");
        await requireAssignableCategory(ctx, id, budget); checked.add(block.attrs.category);
      }
      if (block.children) await inspect(block.children);
    }
  };
  await inspect(blocks);
}
async function resources(
	ctx: QueryCtx,
	blocks: RuntimeCanonicalTree,
	budget: RequestReadLedger,
  composed?: ComposedDataContext,
): Promise<CanonicalDocumentDto["resources"]> {
	const media: CanonicalDocumentDto["resources"]["media"] = {};
	for (const value of collectCanonicalDisplayMediaIds(blocks, composed)) {
		const id = ctx.db.normalizeId("media", value);
		if (!id)
			refuse("MEDIA_UNAVAILABLE", "A selected media reference is invalid.");
		budget.beforeRead();
		const doc = budget.record(await ctx.db.get("media", id));
		if (!doc || (doc.status !== "active" && doc.status !== "processing"))
			refuse("MEDIA_UNAVAILABLE", "A selected media item is unavailable.");
		let src = doc.url;
		if (doc.storageId) {
			budget.beforeRead();
			const current = await ctx.storage.getUrl(doc.storageId);
			if (!current)
				refuse("MEDIA_UNAVAILABLE", "A selected media file is missing.");
			src = current;
		}
		media[value] = renderMediaSchema.parse({
			src,
			alt: doc.altText ?? "",
			...(doc.width === undefined ? {} : { width: doc.width }),
			...(doc.height === undefined ? {} : { height: doc.height }),
			mimeType: doc.mimeType,
			filename: doc.fileName,
			byteSize: doc.fileSize,
		});
	}
	return { media };
}
async function project(
	ctx: QueryCtx,
	post: Doc<"posts">,
	budget: RequestReadLedger,
	prepared?: PreparedRuntimeCanonicalWrite,
  request:BlockPageRequest = {},
  authority: "authoring" | "published" = "authoring",
  definitionPreview?: AuthoredDefinitionContent,
): Promise<CanonicalDocumentDto> {
  const evaluatedAt = Date.now();
  if (!["draft", "publish", "future", "private"].includes(post.status)) refuse("CANONICAL_DRAFT_REQUIRED", "Restore an editable document before opening the canonical editor.");
  const authored = definitionPreview ?? await (authority === "published" ? readApprovedDocument : readAuthoredDocument)(ctx, prepared ?? post, budget);
  const { title, blocks, composedDefinitions } = authored;
  const composed = composedDefinitions ? { scope: composedDefinitions.scope, definitions: composedDefinitions } : undefined;
	const display = await displayContext(ctx, budget);
  assertPackTreatments(blocks, display.presentation.packId);
	// Validate authoring policy without replacing authored content with its
  // permission-filtered preview. Source descendants are never authoring input.
  const projected = await projectPublicBlocks(ctx, blocks, display.scope, display.policy, budget, { validateAuthoringPolicy: true, composed });
  if (prepared || definitionPreview) await catalogRevisionWrites.assertMediaAttachments(ctx, "posts", {}, budget, collectCanonicalMediaIds(blocks, composed));
  // Only visible occurrences may load dynamic data or display media.
	const data = await resolveCanonicalPageData(
		ctx,
		projected.resolverTree,
		display.scope,
		display.policy,
		budget,
    {document:{...post,title},tree:projected.resolverTree,authoringTree:projected.authoringTree},
    request,
		undefined, [], projected.composed,
	);
	const resolved = await resources(ctx, projected.resolverTree, budget, projected.composed);
	const result = parseCanonicalDocumentRead({
		contract: "canonical-document-v1",
		...display,
		document: {
			id: post._id,
			type: post.type,
			title,
			status: post.status,
			scheduledAt: post.scheduledAt ?? null,
			path: post.path ?? (post.slug ? `/${post.slug}` : null),
			blocksVersion: 2,
			revision: prepared?.revision ?? authoringRevision(post),
			digest: authored.digest,
			blocks,
      ...(composedDefinitions ? { composedDefinitions } : {}),
		},
    displayBlocks: projected.blocks,
    displayLease: { evaluatedAt, expiresAt: Math.min(evaluatedAt + 60000, budget.authorizationRecheckAt ?? Infinity) },
    ...(projected.synced ? { synced: projected.synced } : {}),
		data,
		resources: resolved,
	});
	if (!result || result.contract !== "canonical-document-v1")
		refuse("INVALID_CANONICAL_DOCUMENT", "Invalid display document.");
	return result;
}
export async function getDocument(
	ctx: QueryCtx,
	args: { postId: Id<"posts">; refreshKey?: string; request?: BlockPageRequest },
): Promise<CanonicalDocumentRead> {
	// Non-authority cache key for explicit server refreshes; never affects scope.
	if (
		args.refreshKey !== undefined &&
		!/^[A-Za-z0-9_-]{1,64}$/.test(args.refreshKey)
	)
		refuse("INVALID_REFRESH_KEY", "Invalid document refresh key.");
	const budget = new RequestReadLedger(),
		{ post } = await authorized(ctx, args.postId, budget);
	if (!post) return null;
	if (post.blocksVersion === 2) return project(ctx, post, budget,undefined,blockPageRequestSchema.parse(args.request ?? {}));
	const reason = initializationReason(post);
	return canonicalInitializationSchema.parse({
		contract: "canonical-initialization-v1",
		scope: await installation(ctx, budget),
		document: {
			id: post._id,
			type: post.type,
			title: post.title,
			revision: authoringRevision(post),
			authoringDigest: authoringSourceDigest(post),
		},
		initialization: { eligible: reason === null, reason },
	});
}
function assertStoredSize(
	value: Record<string, unknown>,
	budget: RequestReadLedger,
	reservedBytes = 0,
): void {
	const stored = Object.fromEntries(
		Object.entries(value).filter(([, item]) => item !== undefined),
	) as Record<string, Value>;
	if (getDocumentSize(stored) + reservedBytes > budget.limits.documentBytes)
		refuse(
			"CANONICAL_DOCUMENT_BUDGET",
			"The complete authoring record exceeds the supported read/restore size. Reduce its content before saving.",
		);
}
async function snapshot(
	ctx: MutationCtx,
	post: Doc<"posts">,
	authorId: string,
	budget: RequestReadLedger,
) {
	budget.beforeRead();
	const last = budget.record(
		await ctx.db
			.query("revisions")
			.withIndex("by_parent_number", (q) => q.eq("parentId", post._id))
			.order("desc")
			.first(),
	);
	const revisionNumber = (last?.revisionNumber ?? 0) + 1;
	if (!Number.isSafeInteger(revisionNumber) || revisionNumber < 1)
		refuse(
			"AUTHORING_REVISION_EXHAUSTED",
			"Revision history cannot advance safely.",
		);
	const value: WithoutSystemFields<Doc<"revisions">> = {
		...authoringSnapshot(post),
		content: post.content ?? "",
		parentId: post._id,
		parentType: post.type,
		snapshotVersion: 2,
		revisionNumber,
		type: "manual",
		authorId,
		changedFields: ["title", "blocks"],
		contentLength: post.content?.length ?? 0,
		createdAt: Date.now(),
	};
	// Reserve bounded system-field overhead before this history row exists.
	assertStoredSize(value, budget, 512);
	const permit =
		post.blocksVersion === 2
			? permitValidatedCanonicalAuthoringWrite({
					table: "revisions",
					operation: "insert",
					value,
				})
			: undefined;
	await insertWithMediaReferences(ctx, "revisions", value, permit, budget);
}
export type WriteArgs = {
	postId: Id<"posts">;
	expectedRevision: number;
	title: string;
	blocks: unknown;
};
async function commit(
	ctx: MutationCtx,
	post: Doc<"posts">,
	user: Doc<"users">,
	prepared: PreparedRuntimeCanonicalWrite,
	budget: RequestReadLedger,
	restore?: Doc<"revisions">,
  publication?: CanonicalPublicationPatch,
  scheduled = false,
): Promise<CanonicalWriteReceipt> {
  const previous = post.blocksVersion === 2 ? await (scheduled ? readApprovedDocument : readAuthoredDocument)(ctx, post, budget) : undefined;
  await validateNewKnowledgeCategoryReferences(ctx, prepared.blocks, previous?.blocks ?? [], budget);
	// A no-op still revalidates current policy and exact referenced resources.
	await project(ctx, post, budget, prepared, {}, (publication?.status ?? post.status) === "draft" ? "authoring" : "published");
  await syncDocumentContactForms(ctx, { postId: post._id, title: prepared.title, blocks: prepared.blocks, scheduled,
    ...(prepared.composedDefinitions ? { composed: { scope: prepared.composedDefinitions.scope, definitions: prepared.composedDefinitions } } : {}) }, budget);
	if (prepared.changed) {
		const value: Partial<WithoutSystemFields<Doc<"posts">>> = {
			...(restore ? restoredAuthoring(restore) : {}),
			title: prepared.title,
			content: "",
			contentMode: "blocks",
			blocksVersion: 2,
			blocks: prepared.blocks,
      composedDefinitions: prepared.composedDefinitions,
			blocksRevision: prepared.revision,
			autosaveTitle: undefined,
			autosaveContent: undefined,
			autosavedAt: undefined,
			updatedAt: Date.now(),
      ...publication,
		};
		assertStoredSize({ ...post, ...value }, budget);
		await snapshot(ctx, post, String(user._id), budget);
		const permit = permitValidatedCanonicalAuthoringWrite({
			table: "posts",
			operation: "patch",
			id: post._id,
			previous: post,
			value,
		});
		await patchWithMediaReferences(
			ctx,
			"posts",
			post._id,
			value,
			permit,
			budget,
		);
		// Dependency reconciliation already succeeded for this exact candidate.
		await clearSyncedConsumerDirty(ctx, post._id, budget);
		await authoringUpdatedEvent(ctx, { ...post, ...value }, Object.keys(value), budget, post);
	}
	return {
		postId: post._id,
		revision: prepared.revision,
		digest: prepared.digest,
		changed: prepared.changed,
	};
}
export async function initializeDocument(
	ctx: MutationCtx,
	args: WriteArgs & { expectedAuthoringDigest: string },
): Promise<CanonicalWriteReceipt> {
	const budget = new RequestReadLedger(),
		{ post, user } = await authorized(ctx, args.postId, budget);
	if (!post) refuse("NOT_FOUND", "Document not found.");
	const context = await loadDocumentWriteContext(ctx, args.blocks, budget, post.composedDefinitions);
	return commit(
		ctx,
		post,
		user,
		context ? prepareCanonicalInitialize(post, args, context) : prepareCanonicalInitialize(post, args),
		budget,
	);
}
export async function saveDocument(
	ctx: MutationCtx,
	args: WriteArgs,
): Promise<CanonicalWriteReceipt> {
	const budget = new RequestReadLedger(),
		{ post, user } = await authorized(ctx, args.postId, budget);
	if (!post) refuse("NOT_FOUND", "Document not found.");
	if (post.status !== "draft") await requireCan(ctx, post.type === "page" ? "page.publish" : "post.publish", budget);
  const context = await loadDocumentWriteContext(ctx, args.blocks, budget, post.composedDefinitions);
  return commit(ctx, post, user, context ? prepareCanonicalSave(post, args, context) : prepareCanonicalSave(post, args), budget);
}
/** Authorized unsaved projection for explicit proposal review. Uses the same
 * canonical preparation and live resource projection as a save, without any
 * history, media-edge, Forms or document writes. Callers own proposal authority. */
export async function previewDocument(
  ctx: QueryCtx,
  args: WriteArgs,
  request: BlockPageRequest = {},
): Promise<CanonicalDocumentDto> {
  const budget = new RequestReadLedger(), { post } = await authorized(ctx, args.postId, budget);
  if (!post) refuse("NOT_FOUND", "Document not found.");
  if (post.status !== "draft") await requireCan(ctx, post.type === "page" ? "page.publish" : "post.publish", budget);
  const context = await loadDocumentWriteContext(ctx, args.blocks, budget, post.composedDefinitions);
  const prepared = context ? prepareCanonicalSave(post, args, context) : prepareCanonicalSave(post, args);
  return project(ctx, post, budget, prepared, request, post.status === "draft" ? "authoring" : "published");
}
export type DefinitionPreviewArgs = {
  id: Id<"blockDefinitions">; expectedGeneration: number; version: number; expectedDigest: string;
  postId: Id<"posts">; expectedRevision: number; definitionJson?: string; attrsJson: string;
};
/** An isolated, read-only custom definition preview in a real page context.
 * The page supplies navigation and resource authority, never a fake document.
 * Draft schema input is allowed only to this definition's current composer;
 * saved-page writes and publication still load immutable approved versions. */
export async function previewBlockDefinition(ctx: QueryCtx, args: DefinitionPreviewArgs, request: BlockPageRequest = {}): Promise<CanonicalDocumentDto> {
  const budget = new RequestReadLedger();
  const actor = await requireCan(ctx, "blocks.compose", budget);
  await requireCan(ctx, "post.read", budget);
  const head = await ownedDefinition(ctx, args.id, actor._id, budget);
  checkDefinitionGeneration(head, args.expectedGeneration);
  const saved = await readDefinitionVersion(ctx, head, args.version, budget);
  if (saved.value.digest !== args.expectedDigest) refuse("DEFINITION_CONFLICT", "Reload the definition before previewing it.");
  let value = saved.value;
  if (args.definitionJson !== undefined) {
    await requireCan(ctx, "post.update", budget);
    if (head.status === "promoted") refuse("DEFINITION_PROMOTED", "Preview the promoted Library block instead.");
    value = decodeComposedDefinition(args.definitionJson);
    if (value.definition.spec.name !== head.name || value.definition.spec.version !== head.lastVersion + 1)
      refuse("DEFINITION_VERSION", "Preview the next version of this definition without changing its name.");
  }
  const { post } = await authorized(ctx, args.postId, budget);
  if (!post || !["draft", "publish", "private", "future"].includes(post.status)) refuse("NOT_FOUND", "Choose an editable page for preview context.");
  if (!Number.isSafeInteger(args.expectedRevision) || authoringRevision(post) !== args.expectedRevision)
    refuse("CANONICAL_REVISION_CONFLICT", "The preview page changed. Select its latest revision.");
  if (post.type !== "page") refuse("CANONICAL_PAGE_REQUIRED", "Choose a page for the block preview.");
  if (new TextEncoder().encode(args.attrsJson).length > 256 * 1024) refuse("DEFINITION_PREVIEW_BUDGET", "Sample content exceeds the preview budget.");
  const attrs = composedAttrsSchema(value.definition).parse(JSON.parse(args.attrsJson));
  const scope = { websiteKey: head.websiteKey, instanceKey: head.instanceKey, deploymentOrigin: head.deploymentOrigin };
  const spec = value.definition.spec;
  const authored = parseAuthoredDefinitionContent({ title: post.title,
    blocks: [{ id: "definition-preview", name: spec.name, version: spec.version, attrs }],
    composedDefinitions: { scope, definitions: [{ name: spec.name, version: spec.version, digest: value.digest, definitionJson: value.json }] },
  }, scope);
  return project(ctx, post, budget, undefined, request, "authoring", authored);
}
export async function restoreDocument(
	ctx: MutationCtx,
	args: {
		postId: Id<"posts">;
		revisionId: Id<"revisions">;
		expectedRevision: number;
    expectedAuthoringDigest?: string;
	},
): Promise<CanonicalWriteReceipt> {
	const budget = new RequestReadLedger(),
		{ post, user } = await authorized(ctx, args.postId, budget);
	if (!post) refuse("NOT_FOUND", "Document not found.");
	await requireCan(ctx, "revision.restore", budget);
  if (post.status !== "draft") await requireCan(ctx, post.type === "page" ? "page.publish" : "post.publish", budget);
	budget.beforeRead();
	const revision = budget.record(
		await ctx.db.get("revisions", args.revisionId),
	);
	if (!revision) refuse("NOT_FOUND", "Revision not found.");
  // A stored revision is content, not permission to execute a substituted schema.
  if (revision.parentId !== post._id) refuse("REVISION_PARENT_MISMATCH", "The revision belongs to another document.");
  await readAuthoredDocument(ctx, revision, budget);
  const context = await loadDocumentWriteContext(ctx, revision.blocks, budget, post.composedDefinitions);
	return commit(
		ctx,
		post,
		user,
		context ? prepareCanonicalRestore(post, revision, args, context) : prepareCanonicalRestore(post, revision, args),
		budget,
		revision,
	);
}
function options(value: PaginationOptions): PaginationOptions {
	if (
		!Number.isInteger(value.numItems) ||
		value.numItems < 1 ||
		value.numItems > 20
	)
		refuse("INVALID_PAGE_SIZE", "Choose between 1 and 20 records per page.");
	return { ...value, maximumRowsRead: 256, maximumBytesRead: 512 * 1024 };
}
function chargePage<T extends object>(
	page: PaginationResult<T>,
	budget: RequestReadLedger,
): PaginationResult<T> {
	for (const item of page.page) budget.record(item);
	if (page.pageStatus === "SplitRequired" || page.page.length > 256)
		refuse(
			"CANONICAL_PAGE_BUDGET",
			"This page exceeds the safe read budget; reduce the requested page size.",
		);
	return page;
}
export async function pageRevisions(
	ctx: QueryCtx,
	args: { postId: Id<"posts">; paginationOpts: PaginationOptions },
): Promise<CanonicalRevisionPage> {
	const opts = options(args.paginationOpts),
		budget = new RequestReadLedger(),
		{ post } = await authorized(ctx, args.postId, budget);
	if (!post) refuse("NOT_FOUND", "Document not found.");
	budget.beforeRead();
	const result = chargePage(
		await ctx.db
			.query("revisions")
			.withIndex("by_parent_number", (q) => q.eq("parentId", post._id))
			.order("desc")
			.paginate(opts),
		budget,
	);
	return canonicalRevisionPageSchema.parse({
		...result,
		page: result.page.map((row) => {
      let action: "restore-canonical" | "recover-legacy" | null = null;
      if (row.blocksVersion === 2) action = "restore-canonical";
      else if (post.blocksVersion === 2) { try { legacyRecoveryValue(post, row); action = "recover-legacy"; } catch { /* Unsupported old format remains explicit, without returning partial source. */ } }
      return { id: row._id, revisionNumber: row.revisionNumber, createdAt: row.createdAt, type: row.type, title: row.title,
        blocksVersion: row.blocksVersion ?? null, action, restorable: action !== null,
        reason: action ? null : row.blocksVersion === undefined || row.blocksVersion === 1 ? "legacy-format" : "unsupported-format" };
    }),
	});
}
export async function pageOptions(
	ctx: QueryCtx,
	args: CanonicalOptionsArgs,
): Promise<CanonicalPageOptions> {
	const opts = options(args.paginationOpts),
		budget = new RequestReadLedger();
  await authorizeOptions(ctx, args, budget);
	budget.beforeRead();
	const result = chargePage(
		await ctx.db
			.query("posts")
			.withIndex("by_type", (q) => q.eq("type", "page"))
			.order("desc")
			.paginate(opts),
		budget,
	);
	const page: CanonicalPageOptions["page"] = [];
	for (const row of result.page)
		if (await canDiscoverContent(ctx, row, budget))
			page.push({
				id: row._id,
				title: row.title,
				path: row.path ?? `/${row.slug}`,
				status: "publish",
			});
	return canonicalPageOptionsSchema.parse({ ...result, page });
}

/** Select the same visible source as current public page/post surfaces. Hidden
 * source fields remain in the original revision; they are never chosen by guess. */
function prepareAuthoredMigration(post: Doc<"posts">): PreparedCanonicalWrite & {inactiveSettings?: CanonicalMigrationDto["inactiveSettings"]} {
  if (post.status !== "draft") refuse("CANONICAL_DRAFT_REQUIRED", "Migrate an editable draft before publishing it.");
  if (post.blocksVersion !== undefined && post.blocksVersion !== 1) refuse("UNSUPPORTED_AUTHORING_VERSION", "This is not a supported legacy authoring document.");
  if (post.contentMode !== undefined && post.contentMode !== "article" && post.contentMode !== "blocks") refuse("UNSUPPORTED_AUTHORING_VERSION", "The legacy content mode is unsupported.");
  if ((post.autosaveTitle !== undefined && post.autosaveTitle !== post.title) || (post.autosaveContent !== undefined && post.autosaveContent !== (post.content ?? ""))) refuse("UNSAVED_AUTHORING", "Save or explicitly discard the distinct autosave before reviewing this migration.");
  const revision = authoringRevision(post);
  if (revision >= Number.MAX_SAFE_INTEGER - 1) refuse("AUTHORING_REVISION_EXHAUSTED", "The document revision cannot advance safely.");
  // Match the Website's visible-source precedence. In particular, block-mode
  // posts prefer nonempty blocks to structured content, and block-mode pages
  // use sections (including an empty list) rather than hidden article text.
  const blockReview = post.contentMode === "blocks" && post.blocks?.length ? reviewLegacyBlocks(post.blocks) : null;
  const blocks = blockReview
    ? blockReview.blocks
    : post.contentMode === "blocks" && post.type === "page"
      ? migrateLegacySections(post.pageSections ?? [])
      : migrateArticleSource();
  return { title: post.title, blocks, digest: canonicalContentDigest(post.title, blocks), revision: revision + 1, changed: true, ...(blockReview?.inactiveSettings.length ? {inactiveSettings:blockReview.inactiveSettings} : {}) };

  function migrateArticleSource() {
   if (post.type === "post" && hasStructuredArticle(post)) return migrateStructuredArticle({
     postId: post._id, path: `/blog/${post.slug}`, hero: post.hero, topics: post.topics,
     summary: post.summary, sources: post.sources, tableOfContents: post.tableOfContents,
   });
   return migrateLegacyDocument({ postId: post._id, content: post.content ?? "" });
  }
}
export async function prepareMigrationDocument(ctx: QueryCtx, args: { postId: Id<"posts"> }): Promise<CanonicalMigrationDto> {
  const budget = new RequestReadLedger();
  const { post } = await authorized(ctx, args.postId, budget);
  if (!post) refuse("NOT_FOUND", "Document not found.");
  const prepared = prepareAuthoredMigration(post);
  return parseCanonicalMigration({ contract: "canonical-migration-v1", source: { postId: post._id, revision: authoringRevision(post), authoringDigest: authoringSourceDigest(post) }, candidate: await project(ctx, post, budget, prepared), ...(prepared.inactiveSettings ? {inactiveSettings:prepared.inactiveSettings} : {}) });
}
export type MigrateArgs = { postId: Id<"posts">; expectedRevision: number; expectedAuthoringDigest: string; expectedCandidateDigest: string; expectedPresentationRevision: string; preserveInactiveSettings?: boolean };
export async function migrateDocument(ctx: MutationCtx, args: MigrateArgs): Promise<CanonicalWriteReceipt> {
  const budget = new RequestReadLedger();
  const { post, user } = await authorized(ctx, args.postId, budget);
  if (!post) refuse("NOT_FOUND", "Document not found.");
  // Check complete source CAS before converting or starting dependent reads.
  if (!Number.isSafeInteger(args.expectedRevision) || authoringRevision(post) !== args.expectedRevision || authoringSourceDigest(post) !== args.expectedAuthoringDigest) refuse("CONFLICT", "The authoring source changed after migration review.");
  const prepared = prepareAuthoredMigration(post);
  if (prepared.inactiveSettings?.length && args.preserveInactiveSettings !== true) refuse("MIGRATION_INTENT_REVIEW_REQUIRED", "Confirm that unused layout and lock settings remain in the original revision before converting.");
  if (prepared.digest !== args.expectedCandidateDigest) refuse("MIGRATION_REVIEW_MISMATCH", "The reviewed candidate does not match this source conversion.");
  const candidate = await project(ctx, post, budget, prepared);
  if (candidate.presentation.revision !== args.expectedPresentationRevision) refuse("MIGRATION_REVIEW_MISMATCH", "The template presentation changed after migration review.");
  return commit(ctx, post, user, prepared, budget);
}

import { blockPageRequestSchema, type BlockPageRequest } from "./foundation/postGridContracts";
import { timingSafeEquals } from "../helpers/timingSafe";
import { PUBLIC_ACCESS_LEASE_MS, parsePublicCanonicalDocument, type PublicCanonicalDocument } from "./foundation/publicDocumentContracts";
import { recentlyViewedIdsSchema, productHistoryDigest } from "./foundation/productCollectionContracts";
export async function getPublicDocument(ctx: QueryCtx, args: { postId: Id<"posts">; password?: string; refreshKey?: string; request?: BlockPageRequest; recentlyViewedIds?: string[] }): Promise<PublicCanonicalDocument> {
  const request = blockPageRequestSchema.parse(args.request ?? {});
  const recentlyViewedIds = recentlyViewedIdsSchema.parse(args.recentlyViewedIds ?? []);
  const historyDigest = productHistoryDigest(recentlyViewedIds);
  if (args.refreshKey !== undefined && !/^[A-Za-z0-9_-]{1,64}$/.test(args.refreshKey)) refuse("INVALID_REFRESH_KEY", "Invalid public document refresh key.");
  if (args.password !== undefined && args.password.length > 1024) refuse("INVALID_PASSWORD_INPUT", "The supplied password exceeds the supported limit.");
  const budget = new RequestReadLedger();
  budget.beforeRead();
  const post = budget.record(await ctx.db.get("posts", args.postId));
  if (!post || post.blocksVersion !== 2) return null;
  // The subject is a transport-auth binding, never a supplied viewer claim.
  const viewerSubject = (await ctx.auth.getUserIdentity())?.subject ?? null;
  const path = post.type === "page" ? post.path ?? `/${post.slug}` : `/blog/${post.slug}`;
  const evaluatedAt = Date.now();
  const accessLease = () => viewerSubject !== null || passwordVerified || budget.authorizationRecheckAt !== null
    ? { evaluatedAt, expiresAt: Math.min(evaluatedAt + PUBLIC_ACCESS_LEASE_MS, budget.authorizationRecheckAt ?? Infinity) } : null;
  const passwordVerified = post.visibility === "password" && typeof args.password === "string" && !!post.password && timingSafeEquals(post.password, args.password);
  const permitted = await readPublicContent(ctx, post, { passwordVerified, path }, budget);
  if (!permitted) return null;
  const password = permitted.isPasswordProtected && !permitted.passwordVerified;
  const membership = permitted.isMembershipRestricted;
  if (password || membership) return parsePublicCanonicalDocument({
    contract: "canonical-public-document-v1", state: "restricted", viewerSubject, accessLease: accessLease(), historyDigest,
    document: { id: post._id, type: post.type, title: post.title, path, excerpt: permitted.excerpt ?? null },
    restriction: { password, membership },
  });
  const authored = await readStoredDocument(ctx, post, budget);
  const display = await displayContext(ctx, budget);
  const composed = authored.composedDefinitions ? { scope: authored.composedDefinitions.scope, definitions: authored.composedDefinitions } : undefined;
  const projected = await projectPublicBlocks(ctx, authored.blocks, display.scope, display.policy, budget, { composed });
  if (projected.composed) {
    const approved = await loadPublishedComposedRegistry(ctx, projected.resolverTree, projected.composed.definitions, budget);
    projected.composed = { scope: approved.snapshot.scope, definitions: approved.snapshot };
  }
  const blocks = projected.blocks;
  assertPackTreatments(blocks, display.presentation.packId);
  assertPackTreatments(projected.resolverTree, display.presentation.packId);
  const data = await resolveCanonicalPageData(ctx, projected.resolverTree, display.scope, display.policy, budget, {document:post,tree:projected.resolverTree,authoringTree:projected.authoringTree}, request, args.password, recentlyViewedIds, projected.composed);
  const resolved = await resources(ctx, projected.resolverTree, budget, projected.composed);
  return parsePublicCanonicalDocument({ contract: "canonical-public-document-v1", state: "ready", viewerSubject, accessLease: accessLease(), historyDigest, ...display,
    document: { id: post._id, type: post.type, title: post.title, path, blocksVersion: 2, revision: authoringRevision(post), digest: canonicalContentDigest(post.title, blocks, projected.composed), blocks, ...(projected.composed ? { composedDefinitions: projected.composed.definitions } : {}) }, data, resources: resolved, ...(projected.synced ? {synced:projected.synced} : {}),
  });
}

import { replacePublicationSchedule, clearPublicationSchedule } from "../helpers/publicationSchedule";
import { emitEvent } from "../helpers/events";
import { PAGE_EVENTS, POST_EVENTS, SYSTEM } from "../events/constants";
/** Canonical authoring uses the same incremental listeners as the original
 * editors. Only identities and field names enter the event; protected bodies
 * and access secrets stay in the authorized source document. */
async function authoringUpdatedEvent(ctx: MutationCtx, post: Doc<"posts">, fields: string[], budget: RequestReadLedger, previous: Doc<"posts">): Promise<void> {
  await emitEvent(ctx, post.type === "page" ? PAGE_EVENTS.UPDATED : POST_EVENTS.UPDATED,
    post.type === "page" ? SYSTEM.PAGE : SYSTEM.POST, {
      postId: post._id, ...(post.type === "page" ? { pageId: post._id } : {}),
      title: post.title, authorId: post.authorId, changedFields: fields,
      changes: fields.map(field => ({ field, ...(field === "slug" ? { oldValue: previous.slug, newValue: post.slug } : {}) })),
    }, undefined, budget);
}
export type PublicationArgs = { postId: Id<"posts">; expectedRevision: number; status: PublicationStatus; scheduledAt?: number };
async function publishedEvent(ctx: MutationCtx, post: Doc<"posts">, now: number, scheduled: boolean, budget: RequestReadLedger): Promise<void> {
  await emitEvent(ctx, post.type === "page" ? PAGE_EVENTS.PUBLISHED : POST_EVENTS.PUBLISHED, post.type === "page" ? SYSTEM.PAGE : SYSTEM.POST, { postId: post._id, ...(post.type === "page" ? { pageId: post._id } : {}), title: post.title, authorId: post.authorId, publishedAt: now, url: post.type === "page" ? post.path ?? `/${post.slug}` : `/blog/${post.slug}`, scheduledPublish: scheduled }, undefined, budget);
  await ctx.scheduler.runAfter(0, makeFunctionReference<"mutation", { authorId: Id<"users"> }>("posts/internals:updatePostCount"), { authorId: post.authorId });
}
export async function setDocumentPublication(ctx: MutationCtx, args: PublicationArgs): Promise<CanonicalWriteReceipt> {
  const budget = new RequestReadLedger();
  const { post, user } = await authorized(ctx, args.postId, budget);
  if (!post) refuse("NOT_FOUND", "Document not found.");
  await requireCan(ctx, post.type === "page" ? "page.publish" : "post.publish", budget);
  const authored = await readAuthoredDocument(ctx, post, budget);
  const context = authored.composedDefinitions ? { scope: authored.composedDefinitions.scope, definitions: authored.composedDefinitions } : undefined;
  const prepared = context ? prepareCanonicalPublication(post, args, Date.now(), context) : prepareCanonicalPublication(post, args, Date.now());
  // Resource/schema/policy refusal precedes scheduler writes as well as owner writes.
  await project(ctx, post, budget, prepared, {}, args.status === "draft" ? "authoring" : "published");
  if (prepared.changed) {
    if (prepared.publication.status === "future") await replacePublicationSchedule(ctx, post._id, prepared.publication.scheduledAt!, budget);
    else await clearPublicationSchedule(ctx, post._id, budget);
  }
  const receipt = await commit(ctx, post, user, prepared, budget, undefined, prepared.publication);
  if (prepared.changed && args.status === "publish" && post.status !== "publish") await publishedEvent(ctx, post, prepared.publication.publishedAt!, false, budget);
  return receipt;
}
/** A persisted future status is the existing durable publication intention. The
 * job does not revive an expired interactive session; exact deadline and current
 * validated body/resources/policy are rechecked before executing that intention. */
export async function publishScheduledCanonicalDocument(ctx: MutationCtx, post: Doc<"posts">, expectedScheduledAt?: number): Promise<void> {
  if (post.blocksVersion !== 2 || post.status !== "future" || post.scheduledAt === undefined || post.scheduledAt > Date.now() || expectedScheduledAt !== post.scheduledAt) return;
  const budget = new RequestReadLedger();
  budget.record(post);
  const authored = await readApprovedDocument(ctx, post, budget);
  const context = authored.composedDefinitions ? { scope: authored.composedDefinitions.scope, definitions: authored.composedDefinitions } : undefined;
  const publicationArgs = { expectedRevision: authoringRevision(post), status: "publish" as const };
  const prepared = context ? prepareCanonicalPublication(post, publicationArgs, Date.now(), context) : prepareCanonicalPublication(post, publicationArgs, Date.now());
  // No auth impersonation: commit uses only this existing author as snapshot
  // attribution after all scheduled-execution checks have passed.
  budget.beforeRead();
  const author = budget.record(await ctx.db.get("users", post.authorId));
  if (!author || author.status !== "active") refuse("PUBLICATION_AUTHOR_UNAVAILABLE", "The scheduled publication author is unavailable.");
  await commit(ctx, post, author, prepared, budget, undefined, prepared.publication, true);
  await publishedEvent(ctx, post, prepared.publication.publishedAt!, true, budget);
}

import { prepareContentRestrictionCopy } from "../membership/policyCopy";
import { generateUniqueSlug } from "../helpers/slug";
import { assertPagePathAvailable } from "../helpers/pageRouteGuard";
import { getUserIdentifier } from "../helpers/permissions";
import { DOCUMENT_LIMITS } from "./foundation/documentContracts";
export type DuplicateArgs = { postId: Id<"posts">; expectedRevision: number };
/** Exact source CAS, fresh destination identity/revision, and unchanged source.
 * Route restrictions become grouped direct policies on the new draft just as in
 * the established legacy duplication path; no customer grants are copied. */
export async function duplicateDocument(ctx: MutationCtx, args: DuplicateArgs): Promise<CanonicalWriteReceipt & { postId: Id<"posts"> }> {
  const budget = new RequestReadLedger();
  await requireCan(ctx, "post.duplicate", budget);
  const { post, user } = await authorized(ctx, args.postId, budget);
  if (!post) refuse("NOT_FOUND", "Document not found.");
  // Reuse current source-format, status, tree, and revision validation. Duplication
  // does not use a client-provided candidate or copy an unvalidated old envelope.
  const prepared = prepareCanonicalSave(post, { expectedRevision: args.expectedRevision, title: post.title, blocks: post.blocks });
  await project(ctx, post, budget, prepared);
  let copiedRows = 0, copiedBytes = getDocumentSize(post);
  const boundedRows = async <T extends object>(read: () => Promise<T[]>): Promise<T[]> => {
    budget.beforeRead();
    const rows = await read();
    for (const row of rows) {
      budget.record(row);
      copiedRows++;
      copiedBytes += getDocumentSize(row as Record<string, Value>);
      if (copiedRows > 512 || copiedBytes > 2 * 1024 * 1024) refuse("LIMIT_EXCEEDED", "The complete duplication relationships exceed the atomic copy budget.");
    }
    if (rows.length > 256) refuse("LIMIT_EXCEEDED", "The complete duplication relationship page exceeds the atomic copy budget.");
    return rows;
  };
  const metadata = await boundedRows(() => ctx.db.query("postMeta").withIndex("by_post", q => q.eq("postId", post._id)).take(257));
  const terms = await boundedRows(() => ctx.db.query("termRelationships").withIndex("by_post", q => q.eq("postId", post._id)).take(257));
  const restrictions = await prepareContentRestrictionCopy(ctx, post, { maxRows: Math.min(256, 512 - copiedRows), maxBytes: 2 * 1024 * 1024 - copiedBytes }, budget);
  copiedRows += restrictions.policies.length;
  copiedBytes += restrictions.bytes;
  const fields = await boundedRows(() => ctx.db.query("fieldValues").withIndex("by_entity", q => q.eq("entityType", post.type).eq("entityId", String(post._id))).take(257));
  const suffix = " (Copy)";
  const title = `${post.title.slice(0, DOCUMENT_LIMITS.title - suffix.length).trimEnd()}${suffix}`;
  const slug = await generateUniqueSlug(ctx, title, post.type, undefined, budget);
  if (post.type === "page") await assertPagePathAvailable(ctx, `/${slug}`, undefined, budget);
  const now = Date.now();
  const value: WithoutSystemFields<Doc<"posts">> = {
    ...authoringSnapshot(post), title, content: "", contentMode: "blocks", blocksVersion: 2,
    blocks: prepared.blocks, blocksRevision: 1, type: post.type, slug,
    status: "draft", visibility: post.status === "private" ? "private" : post.visibility,
    password: post.password, authorId: user._id,
    ...(post.type === "page" ? { path: `/${slug}`, depth: 0 } : {}),
    commentStatus: post.commentStatus, commentCount: 0, isSticky: false,
    createdAt: now, updatedAt: now,
  };
  assertStoredSize(value, budget);
  const permit = permitValidatedCanonicalAuthoringWrite({ table: "posts", operation: "insert", value });
  await validateNewKnowledgeCategoryReferences(ctx, prepared.blocks, [], budget);
  const postId = await insertWithMediaReferences(ctx, "posts", value, permit, budget);
  await syncDocumentContactForms(ctx, { postId, title, blocks: prepared.blocks }, budget);
  for (const row of metadata) {
    if (["_edit_lock", "_edit_last", "_scheduled_fn"].includes(row.key)) continue;
    await insertWithMediaReferences(ctx, "postMeta", { postId, key: row.key, value: row.value }, undefined, budget);
  }
  for (const row of terms) await insertTermRelationship(ctx, { postId, termId: row.termId, order: row.order });
  for (const policy of restrictions.policies) await catalogRevisionWrites.insertWithMediaReferences<"membership_restriction_rules">(ctx, "membership_restriction_rules", { ...policy, resourceType: post.type, resourceIdOrKey: String(postId), createdAt: now, updatedAt: now });
  for (const row of fields) {
    const { _id, _creationTime, ...field } = row;
    await insertWithMediaReferences(ctx, "fieldValues", { ...field, entityId: String(postId), updatedBy: getUserIdentifier(user), updatedAt: now }, undefined, budget);
  }
  await emitEvent(ctx, POST_EVENTS.DUPLICATED, SYSTEM.POST, { postId, title, authorId: user._id, postType: post.type, status: "draft", duplicatedFrom: post._id }, undefined, budget);
  return { postId, revision: 1, digest: canonicalContentDigest(title, prepared.blocks), changed: true };
}

import { permitValidatedLegacyRecoveryWrite } from "../helpers/authoringVersionFence";
import { parseCanonicalRecoveryReceipt, type CanonicalRecoveryReceipt } from "./foundation/documentContracts";
export type LegacyRecoveryArgs = { postId: Id<"posts">; revisionId: Id<"revisions">; expectedRevision: number };
function legacyRecoveryValue(post: Doc<"posts">, revision: Doc<"revisions">): Partial<WithoutSystemFields<Doc<"posts">>> {
  if (revision.parentId !== post._id || revision.parentType !== post.type) refuse("REVISION_PARENT_MISMATCH", "The revision belongs to another document.");
  if (revision.snapshotVersion !== 2 || (revision.blocksVersion !== undefined && revision.blocksVersion !== 1)) refuse("LEGACY_RECOVERY_UNSUPPORTED", "This revision does not contain a supported complete legacy authoring snapshot.");
  const authored = restoredAuthoring(revision);
  const candidate = { ...post, ...authored, blocksVersion: 1 as const, status: "draft" as const, autosaveTitle: undefined, autosaveContent: undefined, autosavedAt: undefined };
  // Validate the historical visible authoring model without replacing its bytes.
  // An actually empty block page is a supported empty original editor state.
  prepareAuthoredMigration({ ...candidate,
    content: candidate.content || JSON.stringify({ type: "doc", content: [] }),
  });
  return { ...authored, blocksVersion: 1, blocksRevision: authoringRevision(post) + 1, autosaveTitle: undefined, autosaveContent: undefined, autosavedAt: undefined, updatedAt: Date.now() };
}
export async function recoverLegacyDocument(ctx: MutationCtx, args: LegacyRecoveryArgs): Promise<CanonicalRecoveryReceipt> {
  const budget = new RequestReadLedger();
  const { post, user } = await authorized(ctx, args.postId, budget);
  if (!post) refuse("NOT_FOUND", "Document not found.");
  await requireCan(ctx, "revision.restore", budget);
  if (post.status !== "draft") await requireCan(ctx, post.type === "page" ? "page.publish" : "post.publish", budget);
  // Validates current canonical format and exact revision before reading history.
  prepareCanonicalSave(post, { expectedRevision: args.expectedRevision, title: post.title, blocks: post.blocks });
  budget.beforeRead();
  const revision = budget.record(await ctx.db.get("revisions", args.revisionId));
  if (!revision) refuse("NOT_FOUND", "Revision not found.");
  const value = legacyRecoveryValue(post, revision);
  const candidate = { ...post, ...value };
  assertStoredSize(candidate, budget);
  await snapshot(ctx, post, String(user._id), budget);
  const permit = permitValidatedLegacyRecoveryWrite({ table: "posts", operation: "patch", id: post._id, previous: post, value });
  await patchWithMediaReferences(ctx, "posts", post._id, value, permit, budget);
  await authoringUpdatedEvent(ctx, candidate, Object.keys(value), budget, post);
  return parseCanonicalRecoveryReceipt({ postId: post._id, revision: authoringRevision(candidate), blocksVersion: 1, authoringDigest: authoringSourceDigest(candidate) });
}

import {canonicalMenuOptionsSchema, type CanonicalMenuOptions} from './foundation/documentContracts';
/** Menu labels only; eligibility belongs to the current editable document. */
export async function menuOptions(ctx: QueryCtx, args: CanonicalOptionsArgs): Promise<CanonicalMenuOptions> {
  const opts=options(args.paginationOpts),budget=new RequestReadLedger();
  await authorizeOptions(ctx, args, budget);
  budget.beforeRead();
  const result=chargePage(await ctx.db.query('menus').withIndex('by_name').paginate(opts),budget);
  return canonicalMenuOptionsSchema.parse({...result,page:result.page.map(menu=>({id:menu._id,name:menu.name,slug:menu.slug}))});
}

import {canonicalTermOptionsSchema, type CanonicalTermOptions} from './foundation/documentContracts';
export type TermOptionsArgs = {postId:Id<'posts'>;taxonomy:'category'|'tag';paginationOpts:PaginationOptions};
/** Current-document authority and the site's taxonomy index own the choices. */
export async function termOptions(ctx:QueryCtx,args: CanonicalOptionsArgs & { taxonomy: "category" | "tag" }):Promise<CanonicalTermOptions> {
  const opts=options(args.paginationOpts),budget=new RequestReadLedger();
  await authorizeOptions(ctx, args, budget);
  budget.beforeRead();
  const taxonomy=args.taxonomy==='tag'?'post_tag':'category';
  const result=chargePage(await ctx.db.query('terms').withIndex('by_taxonomy_name',q=>q.eq('taxonomy',taxonomy)).paginate(opts),budget);
  return canonicalTermOptionsSchema.parse({...result,page:result.page.filter(term=>term.slug.length<=120).map(term=>({id:term._id,name:term.name,slug:term.slug,taxonomy:args.taxonomy}))});
}

import { canonicalAuthorOptionsSchema, type CanonicalAuthorOptions } from './foundation/documentContracts';
import { publicAuthorProfile } from '../helpers/publicAuthor';
export type AuthorOptionsArgs = {postId:Id<'posts'>;paginationOpts:PaginationOptions};
/** Bounded site-local choices, authorized against the actual edited document. */
export async function authorOptions(ctx:QueryCtx,args: CanonicalOptionsArgs):Promise<CanonicalAuthorOptions> {
  const opts=options(args.paginationOpts),budget=new RequestReadLedger();
  await authorizeOptions(ctx, args, budget);
  budget.beforeRead();
  const result=chargePage(await ctx.db.query('users').withIndex('by_status',q=>q.eq('status','active')).paginate(opts),budget);
  return canonicalAuthorOptionsSchema.parse({...result,page:result.page.flatMap(user=>{
    const profile=publicAuthorProfile(user);
    return profile && profile.displayName.length<=256 ? [{id:profile._id,displayName:profile.displayName}] : [];
  })});
}
import {canonicalEventCategoryOptionsSchema,type CanonicalEventCategoryOptions} from './foundation/documentContracts';
export async function eventCategoryOptions(ctx:QueryCtx,args: CanonicalOptionsArgs):Promise<CanonicalEventCategoryOptions>{
 const opts=options(args.paginationOpts),budget=new RequestReadLedger();await authorizeOptions(ctx, args, budget);
 if(!(await enabledPluginIds(ctx,budget)).includes('events'))refuse('PLUGIN_DISABLED','Enable Events before selecting an event category.');
 budget.beforeRead();const result=chargePage(await ctx.db.query('extension_event_categories').withIndex('by_name').paginate(opts),budget);
 return canonicalEventCategoryOptionsSchema.parse({...result,page:result.page.map(row=>({id:row._id,name:row.name,slug:row.slug}))});
}

import { canonicalFormOptionsSchema, type CanonicalFormOptions } from './foundation/documentContracts';
/** Site-local published forms, authorized against the document being edited. */
export async function formOptions(ctx: QueryCtx, args: CanonicalOptionsArgs): Promise<CanonicalFormOptions> {
  const opts = options(args.paginationOpts), budget = new RequestReadLedger();
  await authorizeOptions(ctx, args, budget);
  if (!(await enabledPluginIds(ctx, budget)).includes('forms')) refuse('PLUGIN_DISABLED', 'Enable Forms before selecting a form.');
  budget.beforeRead();
  const result = chargePage(await ctx.db.query('forms').withIndex('by_status', q => q.eq('status', 'published')).paginate(opts), budget);
  return canonicalFormOptionsSchema.parse({ ...result, page: result.page.map(row => ({ id: row._id, title: row.title, slug: row.slug })) });
}

import { canonicalProductOptionsSchema, type CanonicalProductOptions } from "./foundation/documentContracts";
/** A product picker is an authorized document operation, never a global admin list. */
export async function productOptions(ctx: QueryCtx, args: CanonicalOptionsArgs): Promise<CanonicalProductOptions> {
  const opts = options(args.paginationOpts), budget = new RequestReadLedger();
  await authorizeOptions(ctx, args, budget);
  if (!(await enabledPluginIds(ctx, budget)).includes("commerce")) refuse("PLUGIN_DISABLED", "Enable Commerce before selecting a product.");
  budget.beforeRead();
  const result = chargePage(await ctx.db.query("commerce_products").withIndex("by_status_created", q => q.eq("status", "publish")).order("desc").paginate(opts), budget);
  const page: CanonicalProductOptions["page"] = [], now = Date.now();
  for (const product of result.page) {
    if (product.publishedAt !== undefined && product.publishedAt > now) continue;
    budget.beforeRead();
    const bundle = budget.record(await ctx.db.query("commerce_bundles").withIndex("by_product", q => q.eq("productId", product._id)).first());
    if (!bundle) page.push({ id: product._id, title: product.title, slug: product.slug });
  }
  return canonicalProductOptionsSchema.parse({ ...result, page });
}

import { canonicalProductTermOptionsSchema, type CanonicalProductTermOptions } from "./foundation/documentContracts";
export type ProductTermOptionsArgs = { postId: Id<"posts">; taxonomy: "productCategory" | "productTag"; paginationOpts: PaginationOptions };
/** A bounded catalog page, authorized against the actual document on every request. */
export async function productTermOptions(ctx: QueryCtx, args: CanonicalOptionsArgs & { taxonomy: "productCategory" | "productTag" }): Promise<CanonicalProductTermOptions> {
  const opts = options(args.paginationOpts), budget = new RequestReadLedger();
  await authorizeOptions(ctx, args, budget);
  if (!(await enabledPluginIds(ctx, budget)).includes("commerce")) refuse("PLUGIN_DISABLED", "Enable Commerce before selecting a product category or tag.");
  budget.beforeRead();
  const result = args.taxonomy === "productCategory"
    ? chargePage(await ctx.db.query("commerce_product_categories").withIndex("by_slug").paginate(opts), budget)
    : chargePage(await ctx.db.query("commerce_product_tags").withIndex("by_slug").paginate(opts), budget);
  // Filter only the bounded page. Keep the cursor even for a wholly hidden page.
  const page = result.page.filter(row => row.isVisible !== false && row.name.length > 0 && row.name.length <= 512 && row.slug.length > 0 && row.slug.length <= 160)
    .map(row => ({ id: row._id, name: row.name, slug: row.slug, taxonomy: args.taxonomy }));
  return canonicalProductTermOptionsSchema.parse({ ...result, page });
}

import { canonicalDocumentSettingsSchema, canonicalSettingsWriteSchema, type CanonicalDocumentSettings, type CanonicalSettingsWrite } from "./foundation/documentContracts";
import { planDocumentSlug } from "./settingsRoutes";
function documentSettings(post: Doc<"posts">): CanonicalDocumentSettings {
  if (post.blocksVersion !== 2) refuse("CANONICAL_AUTHORING_REQUIRED", "Open this document in the block editor before changing its settings.");
  const values = {
    postId: post._id, type: post.type, revision: authoringRevision(post), slug: post.slug,
    path: post.type === "post" ? `/blog/${post.slug}` : post.path ?? `/${post.slug}`,
    pageTemplate: post.pageTemplate ?? "default", hideHeader: post.hideHeader ?? false, hideFooter: post.hideFooter ?? false,
    visibility: post.visibility ?? "public", hasPassword: Boolean(post.password),
  };
  return canonicalDocumentSettingsSchema.parse({...values,settingsDigest:sha256Hex(canonicalJson({...values,parentId:post.parentId??null,updatedAt:post.updatedAt}))});
}
export async function getDocumentSettings(ctx: QueryCtx, args: {postId: Id<"posts">}): Promise<CanonicalDocumentSettings> {
  const budget = new RequestReadLedger();
  const {post} = await authorized(ctx,args.postId,budget);
  if (!post) refuse("NOT_FOUND", "Document not found.");
  return documentSettings(post);
}
export async function setDocumentSettings(ctx: MutationCtx, args: CanonicalSettingsWrite & {postId: Id<"posts">}): Promise<CanonicalWriteReceipt> {
  const {postId,...input} = args;
  const requested = canonicalSettingsWriteSchema.parse(input), budget = new RequestReadLedger();
  const {post,user} = await authorized(ctx,postId,budget);
  if (!post) refuse("NOT_FOUND", "Document not found.");
  const previous = documentSettings(post);
  if (previous.revision !== requested.expectedRevision || previous.settingsDigest !== requested.expectedSettingsDigest)
    refuse("CONFLICT", "The document or its settings changed. Reload before saving.");
  const visibility = requested.visibility ?? previous.visibility;
  if (requested.password !== undefined && visibility !== "password")
    refuse("DOCUMENT_VISIBILITY_INVALID", "Choose password protection before setting a password.");
  const password = visibility === "password" ? requested.password ?? post.password
    : requested.visibility === undefined ? post.password : undefined;
  if (visibility === "password" && !password)
    refuse("DOCUMENT_PASSWORD_REQUIRED", "Enter a password to protect this document.");
  const accessChanged = visibility !== previous.visibility || password !== post.password;
  if (accessChanged) await requireCan(ctx, post.type === "page" ? "page.publish" : "post.publish", budget);
  // Reuses canonical format, full-tree and exact revision preparation. A settings
  // save never sends a stale client copy of the body back to the server.
  const prepared = prepareCanonicalSave(post,{expectedRevision:requested.expectedRevision,title:post.title,blocks:post.blocks});
  await project(ctx,post,budget,prepared);
  if (post.type === "post" && requested.pageTemplate !== previous.pageTemplate)
    refuse("DOCUMENT_LAYOUT_INVALID", "Page layouts apply to pages. Posts use the active template's article layout.");
  const routes = await planDocumentSlug(ctx,post,requested.slug,budget);
  const layoutChanged = requested.pageTemplate !== previous.pageTemplate || requested.hideHeader !== previous.hideHeader || requested.hideFooter !== previous.hideFooter;
  if (!routes.length && !layoutChanged && !accessChanged) return {postId,revision:previous.revision,digest:prepared.digest,changed:false};
  const revision = previous.revision + 1;
  const patch = {
    ...(routes.length ? {slug:requested.slug,...(post.type === "page" ? {path:routes[0]!.path,depth:routes[0]!.depth} : {})} : {}),
    pageTemplate:requested.pageTemplate, hideHeader:requested.hideHeader, hideFooter:requested.hideFooter,
    ...(accessChanged ? { visibility, password } : {}),
    blocksRevision:revision, updatedAt:Date.now(),
  };
  assertStoredSize({...post,...patch},budget);
  // Layout belongs to content history; URLs and access policy do not. Restoring
  // old content must not restore an old password or reopen a protected page.
  await snapshot(ctx,post,String(user._id),budget);
  const permit = permitValidatedCanonicalAuthoringWrite({table:"posts",operation:"patch",id:postId,previous:post,value:patch});
  await patchWithMediaReferences(ctx,"posts",postId,patch,permit,budget);
  await authoringUpdatedEvent(ctx, {...post,...patch}, Object.keys(patch), budget, post);
  for (const route of routes.slice(1)) {
    const routePatch = {path:route.path,depth:route.depth,updatedAt:Date.now()};
    await patchWithMediaReferences(ctx,"posts",route.post._id,routePatch,undefined,budget);
    await authoringUpdatedEvent(ctx, {...route.post,...routePatch}, Object.keys(routePatch), budget, route.post);
  }
  return {postId,revision,digest:prepared.digest,changed:true};
}

import {canonicalRecipeOptionsSchema,type CanonicalRecipeOptions} from "./foundation/documentContracts";
/** Editor-authorized, paginated choices; source content is resolved separately. */
export async function recipeOptions(ctx:QueryCtx,args: CanonicalOptionsArgs):Promise<CanonicalRecipeOptions>{
 const opts=options(args.paginationOpts),budget=new RequestReadLedger();
 await authorizeOptions(ctx, args, budget);
 if(!(await enabledPluginIds(ctx,budget)).includes("recipes"))refuse("PLUGIN_DISABLED","Enable Recipes before selecting a recipe.");
 budget.beforeRead();const result=chargePage(await ctx.db.query("recipes").withIndex("by_status_published",q=>q.eq("status","publish")).order("desc").paginate(opts),budget);
 const now=Date.now();
 return canonicalRecipeOptionsSchema.parse({...result,page:result.page.filter(recipe=>(recipe.publishedAt===undefined||recipe.publishedAt<=now)&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(recipe.slug)&&recipe.slug.length<=120).map(recipe=>({id:recipe._id,title:recipe.title,slug:recipe.slug}))});
}

import {canonicalAlbumOptionsSchema,type CanonicalAlbumOptions} from "./foundation/documentContracts";
/** Editor-authorized, paginated choices; source content is resolved separately. */
export async function albumOptions(ctx:QueryCtx,args: CanonicalOptionsArgs):Promise<CanonicalAlbumOptions>{
 const opts=options(args.paginationOpts),budget=new RequestReadLedger();
 await authorizeOptions(ctx, args, budget);
 if(!(await enabledPluginIds(ctx,budget)).includes("gallery"))refuse("PLUGIN_DISABLED","Enable Gallery before selecting an album.");
 budget.beforeRead();const result=chargePage(await ctx.db.query("gallery_albums").withIndex("by_status_published",q=>q.eq("status","publish")).order("desc").paginate(opts),budget);
 const now=Date.now();
 return canonicalAlbumOptionsSchema.parse({...result,page:result.page.filter(album=>album.visibility==="public"&&(album.publishedAt===undefined||album.publishedAt<=now)&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(album.slug)&&album.slug.length<=120).map(album=>({id:album._id,title:album.title,slug:album.slug}))});
}

/** Reviewed content promotion is another canonical authoring operation. The
 * promotion layer owns its manifest/receipt CAS and target reference mappings;
 * this service owns current authority, resources, history and publication. */
import { consumeCanonicalPromotionAllocation, type CanonicalPromotionAllocation } from '../contentPromotion/canonicalAllocation';
export async function writePromotedCanonicalDocument(
  ctx: MutationCtx,
  targetId: Id<"posts"> | null,
  fields: Record<string, unknown>,
  restoring = false,
  allocation?: CanonicalPromotionAllocation,
): Promise<Id<"posts">> {
  const budget = new RequestReadLedger();
  const user = await requireCan(ctx, "manage_options", budget);
  if (fields.type !== "page" && fields.type !== "post") refuse("PROMOTION_CONTENT_KIND", "Expected a page or post.");
  if (fields.blocksVersion !== 2 || fields.contentMode !== "blocks" || fields.content !== "" || fields.canonical !== undefined)
    refuse("PROMOTION_CANONICAL_INVALID", "Expected resolved canonical authoring fields.");
  if (!["draft", "publish", "private", ...(restoring ? ["future"] : [])].includes(String(fields.status)))
    refuse("PROMOTION_PUBLICATION_INVALID", "Unsupported publication transition.");
  const type = fields.type;
  const blocks = validateCanonicalTree(fields.blocks);
  await validateNewKnowledgeCategoryReferences(ctx, blocks, [], budget);
  canonicalContentDigest(String(fields.title), blocks);
  await requireCan(ctx, type === "page" ? targetId && !allocation ? "page.update" : "page.create" : targetId && !allocation ? "post.update" : "post.create", budget);
  if (restoring) await requireCan(ctx, "revision.restore", budget);
  budget.beforeRead();
  let previous = targetId ? budget.record(await ctx.db.get("posts", targetId)) : null;
  if (targetId && !previous) refuse("NOT_FOUND", "Promotion target no longer exists.");
  if (allocation) {
    if (!previous || restoring) refuse('PROMOTION_ALLOCATION_INVALID', 'Expected a new reserved document.');
    await consumeCanonicalPromotionAllocation(ctx, allocation, previous, type);
  }
  if (previous && (previous.type !== type || previous.blocksVersion !== 2 && !allocation))
    refuse("CANONICAL_TARGET_MIGRATION_REQUIRED", "Migrate the existing target document explicitly before canonical promotion.");
  if (previous && !allocation && !(await canEditContent(ctx, previous, budget))) refuse("FORBIDDEN", "You cannot edit this target document.");
  if (fields.status !== "draft" || previous && previous.status !== "draft")
    await requireCan(ctx, type === "page" ? "page.publish" : "post.publish", budget);
  if (type === "page") {
    if (fields.parentId !== previous?.parentId) await requireCan(ctx, "page.set_parent", budget);
    await assertPagePathAvailable(ctx, String(fields.path), previous?.path, budget);
  }
  const now = Date.now(), creating = !previous || !!allocation;
  if (!previous) {
    // Allocate a target-local identity inside this atomic transaction. Any later
    // validation refusal rolls this draft back together with its derived rows.
    targetId = await insertWithMediaReferences(ctx, "posts", {
      type, title:String(fields.title), slug:String(fields.slug), content:"", contentMode:"blocks",
      status:"draft", visibility:"public", commentStatus:"closed", authorId:user._id, createdAt:now, updatedAt:now,
    }, undefined, budget);
    budget.beforeRead(); previous = budget.record(await ctx.db.get("posts", targetId));
  }
  if (!previous || !targetId) refuse("NOT_FOUND", "Target identity allocation failed.");
  const priorRevision = authoringRevision(previous);
  if (priorRevision >= Number.MAX_SAFE_INTEGER - 1) refuse("AUTHORING_REVISION_EXHAUSTED", "Target revision cannot advance safely.");
  const absent = restoring ? Object.fromEntries(Object.keys(previous).filter(key=>key!=="_id" && key!=="_creationTime" && !(key in fields)).map(key=>[key,undefined])) : {};
  const value: Partial<WithoutSystemFields<Doc<"posts">>> = {
    ...absent, ...fields, blocks, blocksVersion:2, contentMode:"blocks", content:"",
    authorId:previous.authorId, createdAt:previous.createdAt, blocksRevision:priorRevision+1,
    autosaveTitle:undefined, autosaveContent:undefined, autosavedAt:undefined,
    scheduledAt:fields.status==="future" ? Number(fields.scheduledAt) : undefined,
    updatedAt:now,
  };
  if (value.status === "future" && (!Number.isFinite(value.scheduledAt) || value.scheduledAt! <= now))
    refuse("PROMOTION_ROLLBACK_SCHEDULE_EXPIRED", "Review a new future publication time before restoring this schedule.");
  const candidate = {...previous, ...value} as Doc<"posts">;
  assertStoredSize(candidate, budget);
  await project(ctx, candidate, budget);
  await syncDocumentContactForms(ctx, {postId:targetId,title:candidate.title,blocks}, budget);
  if (!creating) await snapshot(ctx, previous, String(user._id), budget);
  if (candidate.status === "future") await replacePublicationSchedule(ctx, targetId, candidate.scheduledAt!, budget);
  else await clearPublicationSchedule(ctx, targetId, budget);
  const permit = permitValidatedCanonicalAuthoringWrite({table:"posts",operation:"patch",id:targetId,previous,value});
  await patchWithMediaReferences(ctx, "posts", targetId, value, permit, budget);
  await clearSyncedConsumerDirty(ctx, targetId, budget);
  if (candidate.status === "publish" && previous.status !== "publish") await publishedEvent(ctx,candidate,now,false,budget);
  return targetId;
}

import {canonicalMembershipPlanOptionsSchema,type CanonicalMembershipPlanOptions} from "./foundation/documentContracts";
export async function membershipPlanOptions(ctx:QueryCtx,args: CanonicalOptionsArgs):Promise<CanonicalMembershipPlanOptions>{
 const opts=options(args.paginationOpts),budget=new RequestReadLedger();
 await authorizeOptions(ctx, args, budget);
 if(!(await enabledPluginIds(ctx,budget)).includes("membership"))refuse("PLUGIN_DISABLED","Enable Membership before selecting a plan.");
 budget.beforeRead();const result=chargePage(await ctx.db.query("membership_plans").withIndex("by_status",q=>q.eq("status","active")).paginate(opts),budget);
 return canonicalMembershipPlanOptionsSchema.parse({...result,page:result.page.map(plan=>({id:plan._id,title:plan.title}))});
}


import {instructorAccountFromSource,publicInstructorName} from "./instructor";
export async function instructorOptions(ctx:QueryCtx,args: CanonicalOptionsArgs):Promise<CanonicalAuthorOptions>{
 const requested=options(args.paginationOpts),opts={...requested,numItems:Math.min(6,requested.numItems)},budget=new RequestReadLedger();
 await authorizeOptions(ctx, args, budget);
 if(!(await enabledPluginIds(ctx,budget)).includes("lms"))refuse("PLUGIN_DISABLED","Enable LMS before selecting an instructor.");
 budget.beforeRead();const result=chargePage(await ctx.db.query("users").withIndex("by_status",q=>q.eq("status","active")).paginate(opts),budget);
 const page=[];
 for(const candidate of result.page){
  const user=await instructorAccountFromSource(ctx,candidate,budget);if(!user)continue;
  budget.beforeRead();const course=budget.record(await ctx.db.query("lms_courses").withIndex("by_author_status_created",q=>q.eq("authorId",user._id).eq("status","published")).first());
  if(course)page.push({id:user._id,displayName:publicInstructorName(user)});
 }
 return canonicalAuthorOptionsSchema.parse({...result,page});
}

import {canonicalCourseOptionsSchema,type CanonicalCourseOptions} from "./foundation/documentContracts";
export async function courseOptions(ctx:QueryCtx,args: CanonicalOptionsArgs):Promise<CanonicalCourseOptions>{
 const opts=options(args.paginationOpts),budget=new RequestReadLedger();
 await authorizeOptions(ctx, args, budget);
 if(!(await enabledPluginIds(ctx,budget)).includes("lms"))refuse("PLUGIN_DISABLED","Enable LMS before selecting a course.");
 budget.beforeRead();const result=chargePage(await ctx.db.query("lms_courses").withIndex("by_status",q=>q.eq("status","published")).paginate(opts),budget);
 return canonicalCourseOptionsSchema.parse({...result,page:result.page.map(course=>({id:course._id,title:course.title,slug:course.slug}))});
}

import {canonicalKbCategoryOptionsSchema,type CanonicalKbCategoryOptions} from "./foundation/documentContracts";
export async function kbCategoryOptions(ctx:QueryCtx,args: CanonicalOptionsArgs):Promise<CanonicalKbCategoryOptions>{
 const opts=options(args.paginationOpts),budget=new RequestReadLedger();
 await authorizeOptions(ctx, args, budget);
 if(!(await enabledPluginIds(ctx,budget)).includes("knowledgeBase"))refuse("PLUGIN_DISABLED","Enable Knowledge Base before selecting a help category.");
 budget.beforeRead();const result=chargePage(await ctx.db.query("kb_categories").withIndex("by_published_order",q=>q.eq("isPublished",true)).paginate(opts),budget);
 return canonicalKbCategoryOptionsSchema.parse({...result,page:result.page.map(category=>({id:category._id,name:category.name,slug:category.slug}))});
}

import {canonicalEventOptionsSchema,type CanonicalEventOptions} from "./foundation/documentContracts";
import {listRsvpOptions} from "./rsvpSources";
/** Bounded event choices authorized against the document being edited. */
export async function eventOptions(ctx:QueryCtx,args: CanonicalOptionsArgs):Promise<CanonicalEventOptions>{
 const opts=options(args.paginationOpts),budget=new RequestReadLedger();
 await authorizeOptions(ctx, args, budget);
 const plugins=await enabledPluginIds(ctx,budget);
 return canonicalEventOptionsSchema.parse(await listRsvpOptions(ctx,opts,plugins,budget));
}

/** Bundle identities are selected from this document's current site database. */
export async function bundleOptions(ctx: QueryCtx, args: CanonicalOptionsArgs): Promise<CanonicalProductOptions> {
  const opts = options(args.paginationOpts), budget = new RequestReadLedger();
  await authorizeOptions(ctx, args, budget);
  if (!(await enabledPluginIds(ctx, budget)).includes("commerceBundles")) refuse("PLUGIN_DISABLED", "Enable Product Bundles before selecting a bundle.");
  budget.beforeRead();
  const result = chargePage(await ctx.db.query("commerce_bundles").withIndex("by_status", q => q.eq("status", "active")).order("desc").paginate(opts), budget);
  const page: CanonicalProductOptions["page"] = [], now = Date.now();
  for (const bundle of result.page) {
    if (!bundle.productId || bundle.publishedAt !== undefined && bundle.publishedAt > now) continue;
    budget.beforeRead(); const product = budget.record(await ctx.db.get(bundle.productId));
    if (product?.status === "publish" && (product.publishedAt === undefined || product.publishedAt <= now))
      page.push({ id: bundle._id, title: bundle.name, slug: bundle.slug });
  }
  return canonicalProductOptionsSchema.parse({ ...result, page });
}

import {canonicalMailingListOptionsSchema,type CanonicalMailingListOptions} from "./foundation/documentContracts";
/** Selection grants no access to subscribers; writes and public offers recheck authority separately. */
export async function mailingListOptions(ctx:QueryCtx,args: CanonicalOptionsArgs):Promise<CanonicalMailingListOptions>{
 const opts=options(args.paginationOpts),budget=new RequestReadLedger();
 await authorizeOptions(ctx, args, budget);
 if(!(await enabledPluginIds(ctx,budget)).includes("forms"))refuse("PLUGIN_DISABLED","Enable Forms before selecting a mailing list.");
 budget.beforeRead();
 const identity=budget.record(await ctx.db.query("convexpress_siteIdentity").withIndex("by_identity_key",q=>q.eq("identityKey","site-identity")).unique());
 if(!identity)refuse("SITE_IDENTITY_REQUIRED","Set up this website before selecting its mailing list.");
 budget.beforeRead();
 const result=chargePage(await ctx.db.query("mailingLists").withIndex("by_installation_status_name",q=>q.eq("websiteKey",identity.websiteKey).eq("instanceKey",identity.instanceKey).eq("status","active")).paginate(opts),budget);
 return canonicalMailingListOptionsSchema.parse({...result,page:result.page.map(list=>({id:list._id,name:list.name}))});
}
