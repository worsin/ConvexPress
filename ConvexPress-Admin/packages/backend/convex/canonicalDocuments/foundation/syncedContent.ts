import { z } from "zod";
import { anchorDescriptors } from "./generated/metadata";
import { CANONICAL_TREE_LIMITS, collectCanonicalAnchors, validateCanonicalTree } from "./generated/instances";
import type { ComposedRegistry, RuntimeCanonicalTree } from "./composedRegistry";
import { anchorFields } from "./generated/spec_runtime.mjs";
import type { CanonicalTree } from "./generated/types";
import { canonicalJson, sha256Hex } from "./shared/fingerprints";

/** One request-wide budget, including ordinary nodes and every reused occurrence.
 * Caching a source saves database reads; it never buys extra rendering work. */
export const SYNCED_CONTENT_LIMITS = Object.freeze({
  nodes: CANONICAL_TREE_LIMITS.nodes,
  depth: CANONICAL_TREE_LIMITS.depth,
  bytes: CANONICAL_TREE_LIMITS.bytes,
  reads: 8,
});
export class SyncedContentError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "SyncedContentError"; }
}
function refuse(code: string, message: string): never { throw new SyncedContentError(code, message); }
const idSchema = z.string().min(1).max(256);
const revisionSchema = z.number().int().min(1).max(1_000_000);
const titleSchema = z.string().min(1).max(512);
export const syncedScopeSchema = z.strictObject({
  websiteKey: z.string().min(1).max(128),
  instanceKey: z.string().min(1).max(128),
  deploymentOrigin: z.string().max(2048).refine(value => {
    try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && url.origin === value; }
    catch { return false; }
  }),
});
export type SyncedScope = z.infer<typeof syncedScopeSchema>;
export type SyncedRequest = { id: string; revisionPolicy: "pinned"; revision: number } | { id: string; revisionPolicy: "latest" };
const sourceSchema = z.strictObject({
  id: idSchema, revision: revisionSchema, title: titleSchema, scope: syncedScopeSchema,
  published: z.literal(true), digest: z.string().regex(/^[a-f0-9]{64}$/u), blocks: z.unknown(),
});
export type SyncedRevision = Omit<z.infer<typeof sourceSchema>, "blocks"> & { blocks: CanonicalTree };
export type SyncedTarget = Pick<SyncedRevision, "id" | "revision" | "digest">;
export type SyncedBinding = { path: string[]; target: SyncedTarget | null };
export type SyncedResolution = {
  blocks: RuntimeCanonicalTree;
  revisions: SyncedRevision[];
  bindings: SyncedBinding[];
  expandedNodes: number;
};
function bytes(value: unknown): number {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw Error("Not JSON");
    return new TextEncoder().encode(serialized).length;
  } catch { return refuse("SYNCED_SOURCE_INVALID", "Synced content must be bounded, serializable canonical content."); }
}
export function syncedContentDigest(title: string, input: unknown): string {
  const checkedTitle = titleSchema.parse(title), blocks = validateCanonicalTree(input);
  return sha256Hex(canonicalJson({ contract: "synced-content-revision-v1", title: checkedTitle, blocks }));
}

/** Internal expansion plan, NOT an authorization grant or public DTO. The
 * reader must derive scope from the current installation, authorize the current
 * actor, and return only an immutable revision that was explicitly published.
 * null deliberately covers missing, withdrawn and inaccessible sources alike.
 *
 * Root and revision trees retain their authored IDs and content digests. Paths
 * identify occurrences across trees without rewriting saved documents. The
 * downstream resolver/renderer must use those paths for binding IDs and apply
 * current plugin, visibility, access and media policies to every nested tree.
 * Publication review uses requireAvailable and stores the reviewed targets;
 * this function alone does not publish, promote or grant access to anything. */
function* syncedContentSteps(
  input: unknown,
  installation: SyncedScope,
  options: { requireAvailable?: boolean; rootRegistry?: ComposedRegistry } = {},
): Generator<SyncedRequest, SyncedResolution, unknown> {
  const scope = syncedScopeSchema.parse(installation), blocks = options.rootRegistry ? options.rootRegistry.validateTree(input) : validateCanonicalTree(input);
  const cached = new Map<string, SyncedRevision | null>();
  const versions = new Map<string, SyncedRevision>();
  const bindings: SyncedBinding[] = [];
  const anchors = new Set<string>();
  let reads = 0, readBytes = 0, expandedBytes = 0, expandedNodes = 0;

  function* revision(request: SyncedRequest): Generator<SyncedRequest, SyncedRevision | null, unknown> {
    const key = JSON.stringify([request.id, request.revisionPolicy, "revision" in request ? request.revision : null]);
    if (cached.has(key)) return cached.get(key)!;
    if (reads >= SYNCED_CONTENT_LIMITS.reads) refuse("SYNCED_READ_BUDGET", "Too many distinct synced content reads in one document.");
    reads++;
    // Pass a fresh copy: an adapter cannot rewrite the expected binding.
    const raw = yield { ...request };
    if (raw === null) { cached.set(key, null); return null; }
    readBytes += bytes(raw);
    if (readBytes > SYNCED_CONTENT_LIMITS.bytes) refuse("SYNCED_SOURCE_BUDGET", "Synced sources exceed the request byte budget.");
    let source: SyncedRevision;
    try {
      const parsed = sourceSchema.parse(raw);
      source = { ...parsed, blocks: validateCanonicalTree(parsed.blocks) };
      if (source.id !== request.id || (request.revisionPolicy === "pinned" && source.revision !== request.revision)
        || source.scope.websiteKey !== scope.websiteKey || source.scope.instanceKey !== scope.instanceKey
        || source.scope.deploymentOrigin !== scope.deploymentOrigin
        || source.digest !== syncedContentDigest(source.title, source.blocks)) throw Error("Source binding mismatch");
    } catch { return refuse("SYNCED_SOURCE_INVALID", "Synced content does not match the requested published revision and installation."); }
    const versionKey = JSON.stringify([source.id, source.revision]);
    const previous = versions.get(versionKey);
    if (previous && previous.digest !== source.digest) refuse("SYNCED_REVISION_CONFLICT", "An immutable synced revision changed during resolution.");
    const stable = previous ?? source;
    versions.set(versionKey, stable);
    cached.set(key, stable);
    return stable;
  }

  function* visit(nodes: RuntimeCanonicalTree, parentPath: string[], active: ReadonlySet<string>): Generator<SyncedRequest, void, unknown> {
    for (const node of nodes) {
      const path = [...parentPath, node.id];
      if (path.length > SYNCED_CONTENT_LIMITS.depth) refuse("SYNCED_DEPTH_BUDGET", "Expanded content exceeds the document depth budget.");
      if (++expandedNodes > SYNCED_CONTENT_LIMITS.nodes) refuse("SYNCED_NODE_BUDGET", "Expanded content exceeds the document block budget.");
      const { children, ...own } = node;
      expandedBytes += bytes(own);
      if (expandedBytes > SYNCED_CONTENT_LIMITS.bytes) refuse("SYNCED_EXPANSION_BUDGET", "Expanded content exceeds the document byte budget.");
      const custom = node.name.startsWith("composed/") ? options.rootRegistry?.definition(node.name, node.version) : null;
      const declaredAnchors = collectCanonicalAnchors(node.attrs, custom ? anchorFields(custom.spec.fields) : anchorDescriptors[node.name as keyof typeof anchorDescriptors] ?? []);
      if (node.anchor !== undefined) declaredAnchors.push({ value: node.anchor, path: "anchor" });
      for (const anchor of declaredAnchors) {
        if (anchors.has(anchor.value)) refuse("SYNCED_ANCHOR_CONFLICT", "Reused content creates duplicate page-wide anchors. Remove or rename the conflicting anchors before publishing.");
        anchors.add(anchor.value);
      }
      if (node.name !== "core/synced") {
        if (children) yield* visit(children, path, active);
        continue;
      }
      const attrs = node.attrs;
      if (!attrs.syncedBlock) {
        if (options.requireAvailable) refuse("SYNCED_UNAVAILABLE", "Select published synced content before publishing this document.");
        bindings.push({ path, target: null });
        continue;
      }
      if ((attrs.revisionPolicy === "pinned" && attrs.revision === undefined)
        || (attrs.revisionPolicy === "latest" && attrs.revision !== undefined)) refuse("SYNCED_REVISION_POLICY", "Choose an exact pinned revision or latest published content, without a pinned revision.");
      const request: SyncedRequest = attrs.revisionPolicy === "pinned"
        ? { id: attrs.syncedBlock, revisionPolicy: "pinned", revision: attrs.revision! }
        : { id: attrs.syncedBlock, revisionPolicy: "latest" };
      const source = yield* revision(request);
      if (source === null) {
        if (options.requireAvailable) refuse("SYNCED_UNAVAILABLE", "A referenced published revision is unavailable. Review the selection before publishing.");
        bindings.push({ path, target: null });
        continue;
      }
      const versionKey = JSON.stringify([source.id, source.revision]);
      if (active.has(versionKey)) refuse("SYNCED_CYCLE", "Synced content contains a circular revision reference.");
      bindings.push({ path, target: { id: source.id, revision: source.revision, digest: source.digest } });
      yield* visit(source.blocks, path, new Set([...active, versionKey]));
    }
  }
  yield* visit(blocks, [], new Set());
  return { blocks, revisions: [...versions.values()], bindings, expandedNodes };
}

/** Async server reads and synchronous display decoding use the same walker,
 * cache, binding validation and aggregate limits. Neither driver grants access. */
export async function resolveSyncedContent(input: unknown, installation: SyncedScope, read: (request: SyncedRequest) => Promise<unknown>, options: { requireAvailable?: boolean; rootRegistry?: ComposedRegistry } = {}): Promise<SyncedResolution> {
  const steps = syncedContentSteps(input, installation, options);
  try {
    let next = steps.next();
    while (!next.done) next = steps.next(await read(next.value));
    return next.value;
  } finally { steps.return(undefined as never); }
}
export function resolveSyncedContentSnapshot(input: unknown, installation: SyncedScope, read: (request: SyncedRequest) => unknown, options: { requireAvailable?: boolean; rootRegistry?: ComposedRegistry } = {}): SyncedResolution {
  const steps = syncedContentSteps(input, installation, options);
  try {
    let next = steps.next();
    while (!next.done) next = steps.next(read(next.value));
    return next.value;
  } finally { steps.return(undefined as never); }
}
