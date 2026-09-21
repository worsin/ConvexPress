/** Pure mutation preparation. The caller owns current auth, DB CAS transaction,
 * referenced-resource validation, immutable snapshots and media write hooks. */
import { AUTHORING_FIELDS } from "./shared/authoringFields";
import { canonicalJson, sha256Hex } from "./shared/fingerprints";
import { canonicalContentDigest, DOCUMENT_LIMITS } from "./documentContracts";
import { validateCanonicalTree } from "./generated/instances";
import type { CanonicalTree } from "./generated/types";
import type { CanonicalEnvelope } from "./generated/instance-runtime.mjs";
import type { ComposedRegistrySnapshot, RuntimeCanonicalTree } from "./composedRegistry";
import type { SyncedScope } from "./syncedContent";
import { parseAuthoredDefinitionContent, type AuthoredDefinitionContent } from "./authoredDefinitions";
/** Context comes from the authorized server loader, never client write args. */
export interface ComposedWriteContext { scope: SyncedScope; definitions?: ComposedRegistrySnapshot }
export type PreparedRuntimeCanonicalWrite = PreparedCanonicalWrite<RuntimeCanonicalTree>;
import { CanonicalDataError } from "./contracts";
export type StoredAuthoring = Record<string, unknown>;
function fail(code: string, message: string): never { throw new CanonicalDataError(code, "document", message); }
export function authoringRevision(row: StoredAuthoring): number {
  const value = row.blocksRevision === undefined ? 0 : row.blocksRevision;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER - 1) fail("INVALID_AUTHORING_REVISION", "The document revision is unsupported");
  return value;
}
export function authoringSourceDigest(row: StoredAuthoring): string {
  // Explicit absence markers prevent a missing legacy field from colliding with
  // a present null/empty value; no legacy body flattening or text normalization.
  // Preserve pre-composition recovery digests when the new optional field is
  // absent. Once present, the complete definition snapshot participates.
  return sha256Hex(canonicalJson([...AUTHORING_FIELDS, "autosaveTitle", "autosaveContent", "autosavedAt"].filter(field => field !== "composedDefinitions" || row[field] !== undefined).map(field => row[field] === undefined ? [field, false] : [field, true, row[field]])));
}
export type InitializationReason = "not-draft" | "existing-authored-content" | "unsupported-format" | null;
export function initializationReason(row: StoredAuthoring): InitializationReason {
  if (row.composedDefinitions !== undefined) return "unsupported-format";
  if (row.blocksVersion !== undefined && row.blocksVersion !== 1) return "unsupported-format";
  if (row.status !== "draft") return "not-draft";
  if (row.content !== undefined && row.content !== "") return "existing-authored-content";
  if (row.contentMode !== undefined && row.contentMode !== "article" && row.contentMode !== "blocks") return "unsupported-format";
  for (const field of ["blocks", "pageSections"]) if (row[field] !== undefined && (!Array.isArray(row[field]) || row[field].length !== 0)) return "existing-authored-content";
  for (const field of ["excerpt", "hero", "topics", "summary", "sources", "tableOfContents"]) if (row[field] !== undefined && row[field] !== "") return "existing-authored-content";
  // Ordinary saves may leave an autosave matching the saved empty authoring.
  // Only exact equality is redundant: even an empty title can be a distinct
  // unsaved edit. The full source digest still includes all autosave fields.
  if (row.autosaveTitle !== undefined && row.autosaveTitle !== row.title) return "existing-authored-content";
  if (row.autosaveContent !== undefined && row.autosaveContent !== (row.content ?? "")) return "existing-authored-content";
  return null;
}
function checkRevision(row: StoredAuthoring, expected: number): number {
  const revision = authoringRevision(row);
  if (!Number.isSafeInteger(expected) || expected < 0) fail("INVALID_AUTHORING_REVISION", "An exact current revision is required");
  if (revision !== expected) fail("CONFLICT", "The document changed after this draft was opened");
  if (revision >= Number.MAX_SAFE_INTEGER - 1) fail("AUTHORING_REVISION_EXHAUSTED", "The document revision cannot advance safely");
  return revision;
}
function candidate(title: string, blocks: unknown, definitions?: unknown, context?: ComposedWriteContext): AuthoredDefinitionContent {
  if (context) return parseAuthoredDefinitionContent({ title, blocks, composedDefinitions: definitions }, context.scope);
  if (definitions !== undefined) fail("COMPOSED_AUTHORING_CONTEXT_REQUIRED", "Composed definitions require the current site authoring context");
  if (typeof title !== "string" || title.length > DOCUMENT_LIMITS.title) fail("INVALID_DOCUMENT_TITLE", "The title exceeds the supported authoring limit");
  const tree = validateCanonicalTree(blocks);
  return { title, blocks: tree, digest: canonicalContentDigest(title, tree) };
}
export type PreparedCanonicalWrite<Tree extends CanonicalEnvelope[] = CanonicalTree> = { title: string; blocks: Tree; digest: string; revision: number; changed: boolean; composedDefinitions?: ComposedRegistrySnapshot };
type InitializeArgs = { expectedRevision: number; expectedAuthoringDigest: string; title: string; blocks: unknown };
export function prepareCanonicalInitialize(row: StoredAuthoring, args: InitializeArgs): PreparedCanonicalWrite;
export function prepareCanonicalInitialize(row: StoredAuthoring, args: InitializeArgs, context: ComposedWriteContext): PreparedRuntimeCanonicalWrite;
export function prepareCanonicalInitialize(row: StoredAuthoring, args: InitializeArgs, context?: ComposedWriteContext): PreparedRuntimeCanonicalWrite {
  const revision = checkRevision(row, args.expectedRevision);
  if (authoringSourceDigest(row) !== args.expectedAuthoringDigest) fail("CONFLICT", "The legacy authoring state changed after this draft was opened");
  const reason = initializationReason(row);
  if (reason !== null) fail("CANONICAL_INITIALIZATION_UNAVAILABLE", "This authored document requires an explicit lossless migration");
  return { ...candidate(args.title, args.blocks, context?.definitions, context), revision: revision + 1, changed: true };
}
type SaveArgs = { expectedRevision: number; title: string; blocks: unknown };
export function prepareCanonicalSave(row: StoredAuthoring, args: SaveArgs): PreparedCanonicalWrite;
export function prepareCanonicalSave(row: StoredAuthoring, args: SaveArgs, context: ComposedWriteContext): PreparedRuntimeCanonicalWrite;
export function prepareCanonicalSave(row: StoredAuthoring, args: SaveArgs, context?: ComposedWriteContext): PreparedRuntimeCanonicalWrite {
  // A stale identical retry remains a conflict. Never compare before CAS.
  const revision = checkRevision(row, args.expectedRevision);
  if (row.composedDefinitions !== undefined && !context) fail("COMPOSED_AUTHORING_CONTEXT_REQUIRED", "Saving composed definitions requires the version-aware authoring service");
  if (row.blocksVersion !== 2 || row.contentMode !== "blocks") fail("UNSUPPORTED_AUTHORING_VERSION", "The canonical editor requires a canonical document");
  if (!["draft", "publish", "future", "private"].includes(String(row.status))) fail("CANONICAL_DRAFT_REQUIRED", "Restore a supported editable publication state before changing this document");
  if (typeof row.title !== "string") fail("INVALID_DOCUMENT_TITLE", "The stored title is invalid");
  const saved = candidate(row.title, row.blocks, row.composedDefinitions, context);
  const next = candidate(args.title, args.blocks, context?.definitions, context);
  const changed = next.digest !== saved.digest;
  return { ...next, revision: revision + (changed ? 1 : 0), changed };
}
type RestoreArgs = { expectedRevision: number; postId: string; expectedAuthoringDigest?: string };
export function prepareCanonicalRestore(row: StoredAuthoring, snapshot: StoredAuthoring, args: RestoreArgs): PreparedCanonicalWrite;
export function prepareCanonicalRestore(row: StoredAuthoring, snapshot: StoredAuthoring, args: RestoreArgs, context: ComposedWriteContext): PreparedRuntimeCanonicalWrite;
export function prepareCanonicalRestore(row: StoredAuthoring, snapshot: StoredAuthoring, args: RestoreArgs, context?: ComposedWriteContext): PreparedRuntimeCanonicalWrite {
  checkRevision(row, args.expectedRevision);
  if (!context && (row.composedDefinitions !== undefined || snapshot.composedDefinitions !== undefined)) fail("COMPOSED_AUTHORING_CONTEXT_REQUIRED", "Restoring composed definitions requires the version-aware authoring service");
  if (String(row._id) !== args.postId || snapshot.parentId !== args.postId) fail("REVISION_PARENT_MISMATCH", "The revision belongs to another document");
  if (snapshot.blocksVersion !== 2 || snapshot.contentMode !== "blocks") fail("UNSUPPORTED_AUTHORING_VERSION", "This revision requires an explicit supported migration");
  if (typeof snapshot.title !== "string") fail("INVALID_DOCUMENT_TITLE", "The revision title is invalid");
  let next: PreparedRuntimeCanonicalWrite;
  if (row.blocksVersion === undefined || row.blocksVersion === 1) {
    if (args.expectedAuthoringDigest === undefined || authoringSourceDigest(row) !== args.expectedAuthoringDigest) fail("CONFLICT", "The complete legacy source must match the reviewed authoring state");
    if (!["draft", "publish", "future", "private"].includes(String(row.status))) fail("CANONICAL_DRAFT_REQUIRED", "Restore a supported publication state before recovering canonical authoring");
    next = { ...candidate(snapshot.title, snapshot.blocks, snapshot.composedDefinitions, context), changed: true, revision: authoringRevision(row) + 1 };
  } else {
    const save = { expectedRevision: args.expectedRevision, title: snapshot.title, blocks: snapshot.blocks };
    next = context ? prepareCanonicalSave(row, save, { ...context, definitions: snapshot.composedDefinitions as ComposedRegistrySnapshot | undefined }) : prepareCanonicalSave(row, save);
  }
  // Restore is an explicit history operation, even if content is identical;
  // always advance the CURRENT revision rather than reviving the snapshot's.
  return { ...next, changed: true, revision: authoringRevision(row) + 1 };
}

export type PublicationStatus = "draft" | "publish" | "future" | "private";
export type CanonicalPublicationPatch = { status: PublicationStatus; scheduledAt: number | undefined; publishedAt: number | undefined };
type PublicationArgs = { expectedRevision: number; status: PublicationStatus; scheduledAt?: number };
export function prepareCanonicalPublication(row: StoredAuthoring, args: PublicationArgs, now: number): PreparedCanonicalWrite & { publication: CanonicalPublicationPatch };
export function prepareCanonicalPublication(row: StoredAuthoring, args: PublicationArgs, now: number, context: ComposedWriteContext): PreparedRuntimeCanonicalWrite & { publication: CanonicalPublicationPatch };
export function prepareCanonicalPublication(row: StoredAuthoring, args: PublicationArgs, now: number, context?: ComposedWriteContext): PreparedRuntimeCanonicalWrite & { publication: CanonicalPublicationPatch } {
  const revision = checkRevision(row, args.expectedRevision);
  if (row.composedDefinitions !== undefined && !context) fail("COMPOSED_AUTHORING_CONTEXT_REQUIRED", "Publishing composed definitions requires the version-aware authoring service");
  if (row.blocksVersion !== 2 || row.contentMode !== "blocks") fail("UNSUPPORTED_AUTHORING_VERSION", "Publication requires a validated canonical document");
  if (!["draft", "publish", "future", "private"].includes(String(row.status)) || !["draft", "publish", "future", "private"].includes(args.status)) fail("INVALID_PUBLICATION_STATUS", "The publication state is unsupported");
  if (!Number.isFinite(now)) fail("INVALID_PUBLICATION_TIME", "The publication clock is unavailable");
  if (args.status === "future" ? !Number.isFinite(args.scheduledAt) || args.scheduledAt! <= now : args.scheduledAt !== undefined) fail("INVALID_PUBLICATION_TIME", "Only a scheduled publication may supply a future deadline");
  if (row.publishedAt !== undefined && (typeof row.publishedAt !== "number" || !Number.isFinite(row.publishedAt))) fail("INVALID_PUBLICATION_TIME", "The saved publication time is invalid");
  const publication: CanonicalPublicationPatch = { status: args.status, scheduledAt: args.status === "future" ? args.scheduledAt : undefined, publishedAt: typeof row.publishedAt === "number" ? row.publishedAt : args.status === "publish" || args.status === "private" ? now : undefined };
  const changed = publication.status !== row.status || publication.scheduledAt !== row.scheduledAt || publication.publishedAt !== row.publishedAt;
  return { ...candidate(row.title as string, row.blocks, row.composedDefinitions, context), revision: revision + (changed ? 1 : 0), changed, publication };
}
