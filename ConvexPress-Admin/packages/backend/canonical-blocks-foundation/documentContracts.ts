import {rsvpProviderIdSchema} from "./rsvpContracts";
import { z } from "zod";
import { publicCanonicalTree } from "./publicTree";
import { canonicalNodeSchema, validateCanonicalTree } from "./generated/instances";
import { createComposedRegistry, composedRegistrySnapshotSchema, type ComposedRegistrySnapshot, type RuntimeCanonicalTree } from "./composedRegistry";
import { parseAuthoredDefinitionContent } from "./authoredDefinitions";
import type { ComposedDataContext } from "./planner";
import { dependencyDescriptors } from "./generated/metadata";
import { CanonicalDataError, encodedBytes, scopeSchema, type DataEnvelope, type DataScope, type ResolverPolicy } from "./contracts";
import { validateCanonicalData, canonicalDataEnvelopeSchema } from "./resolve";
import { renderResourcesSchema } from "./renderResources";
import { canonicalJson, sha256Hex } from "./shared/fingerprints";
import { syncedDisplaySchema, containsSyncedContent, resolveSyncedDisplay, type SyncedDisplay } from "./syncedDisplay";
import { planSyncedOccurrenceData } from "./syncedOccurrences";

export const DOCUMENT_LIMITS = Object.freeze({ title: 512, media: 100, resourcesBytes: 512 * 1024, transportBytes: 1600 * 1024 });
const id = z.string().min(1).max(256);
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
export const resolverPolicySchema = z.strictObject({
  enabledPlugins: z.array(z.string().min(1).max(128)).max(128),
  capabilities: z.array(z.string().min(1).max(128)).max(256),
  disabledBlocks: z.array(z.string().min(1).max(128)).max(256),
});
export function canonicalContentDigest(title: string, blocks: unknown, composed?: ComposedDataContext): string {
  if (composed) return parseAuthoredDefinitionContent({ title, blocks, composedDefinitions: composed.definitions }, composed.scope).digest;
  const checkedTitle = z.string().max(DOCUMENT_LIMITS.title).parse(title);
  const checked = validateCanonicalTree(blocks);
  return sha256Hex(canonicalJson({ blocksVersion: 2, title: checkedTitle, blocks: checked }));
}
// This structural transport shape is always followed by definition-aware tree,
// content digest and data validation in parseCanonicalDocumentRead.
const documentTreeSchema = z.array(canonicalNodeSchema).max(80) as z.ZodType<RuntimeCanonicalTree>;
const documentSchema = z.strictObject({
  id, type: z.enum(["post", "page"]), title: z.string().max(DOCUMENT_LIMITS.title), status: z.enum(["draft", "publish", "future", "private"]),
  scheduledAt: z.number().finite().nullable().optional(),
  path: z.string().max(2048).regex(/^\/(?!\/)[^\s\\]*$/u).nullable(),
  blocksVersion: z.literal(2), revision, digest, blocks: documentTreeSchema,
  composedDefinitions: composedRegistrySnapshotSchema.optional(),
});
// Data validation is attrs-bound below, not merely a permissive JSON projection.
export const canonicalDisplayLeaseSchema = z.strictObject({ evaluatedAt: z.number().int().nonnegative(), expiresAt: z.number().int().nonnegative() });
export const canonicalDocumentSchema = z.strictObject({
  contract: z.literal("canonical-document-v1"), scope: scopeSchema, document: documentSchema,
  presentation: z.strictObject({ packId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/u), revision: digest }),
  displayBlocks: documentTreeSchema.optional(), displayLease: canonicalDisplayLeaseSchema.optional(),
  policy: resolverPolicySchema, data: canonicalDataEnvelopeSchema, resources: renderResourcesSchema, synced: syncedDisplaySchema.optional(),
});
export const canonicalInitializationSchema = z.strictObject({
  contract: z.literal("canonical-initialization-v1"), scope: scopeSchema,
  document: z.strictObject({ id, type: z.enum(["post", "page"]), title: z.string().max(DOCUMENT_LIMITS.title), revision, authoringDigest: digest }),
  initialization: z.strictObject({ eligible: z.boolean(), reason: z.enum(["not-draft", "existing-authored-content", "unsupported-format"]).nullable() }),
}).superRefine((value, ctx) => { if (value.initialization.eligible !== (value.initialization.reason === null)) ctx.addIssue({ code: "custom", message: "Initialization eligibility and reason disagree" }); });
export const canonicalWriteReceiptSchema = z.strictObject({ postId: id, revision, digest, changed: z.boolean() });
export type CanonicalWriteReceipt = z.infer<typeof canonicalWriteReceiptSchema>;
export const canonicalRecoveryReceiptSchema = z.strictObject({ postId: id, revision, blocksVersion: z.literal(1), authoringDigest: digest });
export type CanonicalRecoveryReceipt = z.infer<typeof canonicalRecoveryReceiptSchema>;
export function parseCanonicalRecoveryReceipt(value: unknown): CanonicalRecoveryReceipt { return canonicalRecoveryReceiptSchema.parse(value); }
export type CanonicalInitializationDto = z.infer<typeof canonicalInitializationSchema>;
export type CanonicalDocumentDto = Omit<z.infer<typeof canonicalDocumentSchema>, "data"> & { data: DataEnvelope };
export type CanonicalDocumentRead = CanonicalDocumentDto | CanonicalInitializationDto | null;
type DocumentTreeSource = { document: { blocks: unknown; composedDefinitions?: ComposedRegistrySnapshot }; displayBlocks?: RuntimeCanonicalTree };
type DisplayTreeSource = DocumentTreeSource & { scope: DataScope; policy: ResolverPolicy; data: DataEnvelope; synced?: SyncedDisplay };
/** Derive only definitions used by this exact display. This does not authorize
 * a snapshot; server callers must compare it with the current installation. */
export function documentComposedContext(source: DocumentTreeSource, tree: unknown = source.document.blocks): ComposedDataContext | undefined {
  const snapshot = source.document.composedDefinitions;
  if (!snapshot) return undefined;
  const registry = createComposedRegistry(snapshot, snapshot.scope);
  const definitions = registry.snapshotFor(tree);
  return definitions.definitions.length ? { scope: definitions.scope, definitions } : undefined;
}
function documentTree(input: unknown, snapshot?: ComposedRegistrySnapshot): RuntimeCanonicalTree {
  return snapshot ? createComposedRegistry(snapshot, snapshot.scope).validateTree(input) : validateCanonicalTree(input);
}
/** Host data installation and document codecs must agree on the same expanded
 * IDs. Never install a reusable document against its unexpanded authored tree. */
export function resolveDocumentDisplayTree(source: DisplayTreeSource): RuntimeCanonicalTree {
  const tree = canonicalDocumentDisplayRoots(source);
  if (!source.synced) {
    if (containsSyncedContent(tree)) throw new CanonicalDataError("SYNCED_DISPLAY_REQUIRED", "document", "Reusable content requires its complete published display binding");
    return tree;
  }
  if (documentComposedContext(source, tree)) throw new CanonicalDataError("COMPOSED_SYNCED_UNAVAILABLE", "document", "Custom reusable occurrences require definition-aware snapshots");
  const plan = resolveSyncedDisplay(source.synced, validateCanonicalTree(tree), source.scope);
  planSyncedOccurrenceData(plan, source.scope, source.policy, source.data.request);
  return plan.resolverTree;
}
/** Display roots are a redacted, ordered subset of the authored tree, never
 * replacement authoring data. A projection cannot move, add or edit a block. */
export function canonicalDocumentDisplayRoots(source: DocumentTreeSource): RuntimeCanonicalTree {
  const authored = documentTree(source.document.blocks, source.document.composedDefinitions);
  if (source.displayBlocks === undefined) return authored;
  const display = documentTree(source.displayBlocks, source.document.composedDefinitions), publicTree = publicCanonicalTree(authored);
  function verify(visible: RuntimeCanonicalTree, original: RuntimeCanonicalTree): void {
    let cursor = 0;
    for (const node of visible) {
      while (cursor < original.length && original[cursor]!.id !== node.id) cursor++;
      const candidate = original[cursor++];
      if (!candidate) throw new CanonicalDataError("DISPLAY_TREE_MISMATCH", node.id, "Preview blocks must remain within their authored parent and order");
      const { children, ...fields } = node, { children: originalChildren, ...originalFields } = candidate;
      if (canonicalJson(fields) !== canonicalJson(originalFields) || (children === undefined) !== (originalChildren === undefined))
        throw new CanonicalDataError("DISPLAY_TREE_MISMATCH", node.id, "Preview blocks must match their redacted authored content");
      if (children) verify(children, originalChildren!);
    }
  }
  verify(display, publicTree);
  return display;
}
export function canonicalDisplayDigest(source: Pick<CanonicalDocumentDto, "synced" | "displayBlocks" | "displayLease"> & { document: { digest: string } }): string {
  if (source.displayBlocks !== undefined)
    return sha256Hex(canonicalJson({ contract: "canonical-display-binding-v2", document: source.document.digest, blocks: source.displayBlocks, synced: source.synced ?? null }));
  return source.synced ? sha256Hex(canonicalJson({ contract: "canonical-display-binding-v1", document: source.document.digest, synced: source.synced })) : source.document.digest;
}
/** The Website iframe receives display data only. Keep the original authored
 * tree/digest exclusively in the native editor and its save/recovery session. */
export function canonicalPreviewDocument(source: CanonicalDocumentDto): CanonicalDocumentDto {
  const checked = parseCanonicalDocumentRead(source);
  if (!checked || checked.contract !== "canonical-document-v1") throw new Error("A saved document is required");
  const blocks = publicCanonicalTree(canonicalDocumentDisplayRoots(checked));
  const { displayBlocks: _displayBlocks, ...rest } = checked;
  const composed = documentComposedContext(checked, blocks);
  const { composedDefinitions: _definitions, ...document } = checked.document;
  const result = parseCanonicalDocumentRead({ ...rest, document: { ...document, blocks, digest: canonicalContentDigest(checked.document.title, blocks, composed), ...(composed ? { composedDefinitions: composed.definitions } : {}) } });
  if (!result || result.contract !== "canonical-document-v1") throw new Error("Invalid saved display");
  return result;
}
function valuesAt(value: unknown, path: readonly string[]): unknown[] {
  if (!path.length) return [value];
  const [part, ...rest] = path;
  if (part === "*") return Array.isArray(value) ? value.flatMap(item => valuesAt(item, rest)) : [];
  return value && typeof value === "object" ? valuesAt((value as Record<string, unknown>)[part], rest) : [];
}
/** Exact generated field paths, never guesses based on names or arbitrary strings. */
export function collectCanonicalMediaIds(tree: RuntimeCanonicalTree, composed?: ComposedDataContext): string[] {
  return collectMediaIds(tree, false, composed);
}
/** Download-only references remain authoring dependencies, but do not grant a
 * pre-submission URL. A separate display use of the same media remains public. */
export function collectCanonicalDisplayMediaIds(tree: RuntimeCanonicalTree, composed?: ComposedDataContext): string[] {
  return collectMediaIds(tree, true, composed);
}
function collectMediaIds(tree: RuntimeCanonicalTree, displayOnly: boolean, composed?: ComposedDataContext): string[] {
  const registry = composed ? createComposedRegistry(composed.definitions, composed.scope) : undefined;
  const checked = registry ? registry.validateTree(tree) : validateCanonicalTree(tree);
  const ids = new Set<string>();
  function walk(nodes: RuntimeCanonicalTree) {
    for (const node of nodes) {
      const fields = node.name.startsWith("composed/") && registry ? registry.dependencies(node.name, node.version) : dependencyDescriptors[node.name as keyof typeof dependencyDescriptors].fields;
      for (const field of fields) {
        if (field.type !== "media") continue;
        if (displayOnly && node.name === "core/lead-magnet" && field.path.join(".") === "file") continue;
        for (const value of valuesAt(node.attrs, field.path).flatMap(item => valuesAt(item, field.valuePath))) {
          if (value === undefined || value === null || value === "") continue;
          if (typeof value !== "string") throw new CanonicalDataError("INVALID_MEDIA_REFERENCE", node.id, "Invalid generated media reference");
          ids.add(value);
          if (ids.size > DOCUMENT_LIMITS.media) throw new CanonicalDataError("MEDIA_REFERENCE_BUDGET", node.id, "The document exceeds its media reference budget");
        }
      }
      if (node.children) walk(node.children);
    }
  }
  walk(checked);
  return [...ids];
}
export function parseCanonicalDocumentRead(input: unknown): CanonicalDocumentRead {
  if (input === null) return null;
  if (encodedBytes(input) > DOCUMENT_LIMITS.transportBytes) throw new CanonicalDataError("DOCUMENT_TRANSPORT_BUDGET", "document", "Document display transport is too large");
  if (input && typeof input === "object" && (input as {contract?:unknown}).contract === "canonical-initialization-v1") return canonicalInitializationSchema.parse(input);
  const value = canonicalDocumentSchema.parse(input);
  const snapshot = value.document.composedDefinitions;
  if (snapshot && (snapshot.scope.websiteKey !== value.scope.websiteKey || snapshot.scope.instanceKey !== value.scope.instanceKey)) throw new CanonicalDataError("DEFINITION_SCOPE_MISMATCH", "document", "Custom definitions belong to another document scope");
  const authored = parseAuthoredDefinitionContent(value.document, snapshot?.scope);
  if (value.document.digest !== authored.digest) throw new CanonicalDataError("DOCUMENT_DIGEST_MISMATCH", "document", "The document digest does not match the validated content");
  if (value.displayBlocks !== undefined && !value.displayLease) throw new CanonicalDataError("DISPLAY_LEASE_REQUIRED", "document", "An authored display projection requires current access evidence");
  if (value.displayLease && (value.displayLease.expiresAt <= value.displayLease.evaluatedAt || value.displayLease.expiresAt - value.displayLease.evaluatedAt > 60000)) throw new CanonicalDataError("DISPLAY_LEASE_INVALID", "document", "Invalid display access deadline");
  const displayTree = resolveDocumentDisplayTree(value);
  const composed = documentComposedContext(value, displayTree);
  const data = validateCanonicalData(displayTree, value.scope, value.policy, value.data, value.data.request, composed);
  const ids = collectCanonicalDisplayMediaIds(displayTree, composed);
  if (encodedBytes(value.resources) > DOCUMENT_LIMITS.resourcesBytes) throw new CanonicalDataError("MEDIA_RESOURCES_BUDGET", "resources", "Resolved media exceeds the display budget");
  if (Object.keys(value.resources.media).length !== ids.length || ids.some(mediaId => !Object.prototype.hasOwnProperty.call(value.resources.media, mediaId))) throw new CanonicalDataError("MEDIA_BINDING_MISMATCH", "resources", "Resolved media must match the current document's exact references");
  return { ...value, document: { ...value.document, blocks: authored.blocks }, data };
}
// The same trust gate is available to form/transport codecs as a Zod parser.
export const canonicalDocumentReadSchema = z.unknown().transform((value, ctx): CanonicalDocumentRead => {
  try { return parseCanonicalDocumentRead(value); }
  catch { ctx.addIssue({ code: "custom", message: "Invalid or stale canonical document display contract" }); return z.NEVER; }
});
const pagination = {
  isDone: z.boolean(), continueCursor: z.string(),
  splitCursor: z.string().nullable().optional(), pageStatus: z.enum(["SplitRequired", "SplitRecommended"]).nullable().optional(),
};
export const canonicalRevisionPageSchema = z.strictObject({ ...pagination, page: z.array(z.strictObject({
  id, revisionNumber: revision, createdAt: z.number().nonnegative(), type: z.enum(["manual", "autosave"]), title: z.string().max(DOCUMENT_LIMITS.title),
  blocksVersion: z.number().int().nullable(), action: z.enum(["restore-canonical", "recover-legacy", "import-legacy"]).nullable().optional(), hasRetainedAutosave: z.boolean().optional(), restorable: z.boolean(), reason: z.enum(["legacy-format", "unsupported-format"]).nullable(),
})).max(20) });
export const canonicalPageOptionsSchema = z.strictObject({ ...pagination, page: z.array(z.strictObject({ id, title: z.string().max(DOCUMENT_LIMITS.title), path: z.string().max(2048).regex(/^\/(?!\/)[^\s\\]*$/u), status: z.literal("publish") })).max(20) });
export type CanonicalRevisionPage = z.infer<typeof canonicalRevisionPageSchema>;
export type CanonicalPageOptions = z.infer<typeof canonicalPageOptionsSchema>;

export const canonicalMenuOptionsSchema = z.strictObject({...pagination,page:z.array(z.strictObject({id,name:z.string().max(512),slug:z.string().max(512)})).max(20)});
export type CanonicalMenuOptions = z.infer<typeof canonicalMenuOptionsSchema>;
export const canonicalTermOptionsSchema = z.strictObject({...pagination,page:z.array(z.strictObject({id,name:z.string().max(512),slug:z.string().max(120),taxonomy:z.enum(['category','tag'])})).max(20)});
export type CanonicalTermOptions = z.infer<typeof canonicalTermOptionsSchema>;

export const canonicalAuthorOptionsSchema = z.strictObject({...pagination,page:z.array(z.strictObject({id,displayName:z.string().max(256)})).max(20)});
export type CanonicalAuthorOptions = z.infer<typeof canonicalAuthorOptionsSchema>;

export const canonicalEventCategoryOptionsSchema=z.strictObject({...pagination,page:z.array(z.strictObject({id,name:z.string().min(1).max(120),slug:z.string().min(1).max(100)})).max(20)});
export type CanonicalEventCategoryOptions=z.infer<typeof canonicalEventCategoryOptionsSchema>;

export const canonicalFormOptionsSchema = z.strictObject({ ...pagination, page: z.array(z.strictObject({ id, title: z.string().max(DOCUMENT_LIMITS.title), slug: z.string().min(1).max(2048) })).max(20) });
export type CanonicalFormOptions = z.infer<typeof canonicalFormOptionsSchema>;

export const canonicalProductOptionsSchema = z.strictObject({...pagination,page:z.array(z.strictObject({id,title:z.string().max(512),slug:z.string().max(512)})).max(20)});
export type CanonicalProductOptions = z.infer<typeof canonicalProductOptionsSchema>;

/** Commerce taxonomy choices are deliberately distinct from editorial terms. */
export const canonicalProductTermOptionsSchema = z.strictObject({ ...pagination, page: z.array(z.strictObject({
  id, name: z.string().min(1).max(512), slug: z.string().min(1).max(160), taxonomy: z.enum(["productCategory", "productTag"]),
})).max(20) });
export type CanonicalProductTermOptions = z.infer<typeof canonicalProductTermOptionsSchema>;

/** Permalinks are not restored with content revisions; layout settings are. */
export const canonicalLayoutSchema = z.strictObject({
  pageTemplate: z.enum(["default", "full-width", "sidebar-left", "sidebar-right", "no-sidebar", "landing", "blank"]),
  hideHeader: z.boolean(), hideFooter: z.boolean(),
});
export const canonicalDocumentSettingsSchema = z.strictObject({
  postId: id, type: z.enum(["page", "post"]), revision, settingsDigest: digest,
  slug: z.string().min(1).max(512), path: z.string().max(2048),
  visibility: z.enum(["public", "private", "password"]), hasPassword: z.boolean(),
  ...canonicalLayoutSchema.shape,
});
export const canonicalSettingsWriteSchema = z.strictObject({
  expectedRevision: revision, expectedSettingsDigest: digest,
  slug: z.string().min(1).max(512), ...canonicalLayoutSchema.shape,
  visibility: z.enum(["public", "private", "password"]).optional(),
  password: z.string().min(1).max(128).optional(),
});
export type CanonicalDocumentSettings = z.infer<typeof canonicalDocumentSettingsSchema>;
export type CanonicalSettingsWrite = z.infer<typeof canonicalSettingsWriteSchema>;

export const canonicalRecipeOptionsSchema = z.strictObject({...pagination,page:z.array(z.strictObject({id,title:z.string().min(1).max(500),slug:z.string().min(1).max(120)})).max(20)});
export type CanonicalRecipeOptions = z.infer<typeof canonicalRecipeOptionsSchema>;

export const canonicalAlbumOptionsSchema = z.strictObject({...pagination,page:z.array(z.strictObject({id,title:z.string().min(1).max(500),slug:z.string().min(1).max(120)})).max(20)});
export type CanonicalAlbumOptions = z.infer<typeof canonicalAlbumOptionsSchema>;

export const canonicalMembershipPlanOptionsSchema=z.strictObject({...pagination,page:z.array(z.strictObject({id,title:z.string().min(1).max(512)})).max(20)});
export type CanonicalMembershipPlanOptions=z.infer<typeof canonicalMembershipPlanOptionsSchema>;

export const canonicalCourseOptionsSchema=z.strictObject({...pagination,page:z.array(z.strictObject({id,title:z.string().min(1).max(512),slug:z.string().min(1).max(200)})).max(20)});
export type CanonicalCourseOptions=z.infer<typeof canonicalCourseOptionsSchema>;

export const canonicalKbCategoryOptionsSchema=z.strictObject({...pagination,page:z.array(z.strictObject({id,name:z.string().min(1).max(256),slug:z.string().min(1).max(200)})).max(20)});
export type CanonicalKbCategoryOptions=z.infer<typeof canonicalKbCategoryOptionsSchema>;

export const canonicalEventOptionsSchema=z.strictObject({...pagination,page:z.array(z.strictObject({id,providerId:rsvpProviderIdSchema.optional(),title:z.string().min(1).max(200),slug:z.string().min(1).max(100)})).max(20)});
export type CanonicalEventOptions=z.infer<typeof canonicalEventOptionsSchema>;

/** Editor choices intentionally exclude private audience and consent records. */
export const canonicalMailingListOptionsSchema = z.strictObject({...pagination,page:z.array(z.strictObject({id,name:z.string().min(1).max(160)})).max(20)});
export type CanonicalMailingListOptions = z.infer<typeof canonicalMailingListOptionsSchema>;

// Reuse choices contain published metadata only; authored bodies stay behind
// the document projection and source editor authorization boundaries.
const syncedRevisionNumber = z.number().int().min(1).max(1000000);
export const canonicalSyncedOptionSchema = z.strictObject({ id, title: z.string().min(1).max(512), revision: syncedRevisionNumber, digest });
export const canonicalSyncedOptionsSchema = z.strictObject({ ...pagination, page: z.array(canonicalSyncedOptionSchema).max(8) });
export const canonicalSyncedRevisionsSchema = z.strictObject({ ...pagination, sourceId: id, publishedRevision: syncedRevisionNumber, page: z.array(canonicalSyncedOptionSchema.omit({ id: true })).max(8) });
export const canonicalSyncedSelectionSchema = z.strictObject({ scope: scopeSchema, id, revisionPolicy: z.enum(["latest", "pinned"]), revision: syncedRevisionNumber, publishedRevision: syncedRevisionNumber, digest });
export type CanonicalSyncedOption = z.infer<typeof canonicalSyncedOptionSchema>;
export type CanonicalSyncedSelection = z.infer<typeof canonicalSyncedSelectionSchema>;
