import { z } from "zod";
import { canonicalTreeSchema, validateCanonicalTree } from "./generated/instances";
import type { CanonicalTree } from "./generated/types";
import { createComposedRegistry, type RuntimeCanonicalTree } from "./composedRegistry";
import type { ComposedDataContext } from "./planner";
import { encodedBytes, type DataScope } from "./contracts";
import { canonicalJson, sha256Hex } from "./shared/fingerprints";
import { publicCanonicalTree, assertPublicCanonicalTree } from "./publicTree";
import { syncedScopeSchema, syncedContentDigest, SYNCED_CONTENT_LIMITS, SyncedContentError, type SyncedRequest, type SyncedScope } from "./syncedContent";
import { resolveSyncedOccurrencesSnapshot, occurrenceResolverTree, type SyncedOccurrence, type SyncedOccurrencePlan } from "./syncedOccurrences";

const id = z.string().min(1).max(256), revision = z.number().int().min(1).max(1_000_000), digest = z.string().regex(/^[a-f0-9]{64}$/u);
const requestSchema = z.discriminatedUnion("revisionPolicy", [z.strictObject({ id, revisionPolicy: z.literal("latest") }), z.strictObject({ id, revisionPolicy: z.literal("pinned"), revision })]);
const targetSchema = z.strictObject({ id, revision, displayDigest: digest });
export const syncedDisplaySchema = z.strictObject({
  contract: z.literal("synced-display-v1"), scope: syncedScopeSchema, rootDigest: digest,
  selections: z.array(z.strictObject({ request: requestSchema, target: targetSchema.nullable() })).max(SYNCED_CONTENT_LIMITS.reads),
  revisions: z.array(targetSchema.extend({ title: z.string().min(1).max(512), blocks: canonicalTreeSchema })).max(SYNCED_CONTENT_LIMITS.reads),
  omitted: z.array(z.string().min(1).max(128)).max(SYNCED_CONTENT_LIMITS.nodes).optional(),
});
export type SyncedDisplay = z.infer<typeof syncedDisplaySchema>;
function fail(message: string): never { throw new SyncedContentError("SYNCED_DISPLAY_INVALID", message); }
function requestKey(request: SyncedRequest): string { return canonicalJson(request); }
function versionKey(source: { id: string; revision: number }): string { return canonicalJson([source.id, source.revision]); }
function rootDigest(tree: RuntimeCanonicalTree): string { return sha256Hex(canonicalJson(tree)); }
export function containsSyncedContent(tree: RuntimeCanonicalTree): boolean { return tree.some(node => node.name === "core/synced" || !!node.children && containsSyncedContent(node.children)); }

/** Strict synchronous transport gate. Rebuild identities and all graph limits
 * using the same walker as server publication. This validates a display from
 * an authenticated transport; it is never a backend authorization credential. */
export function resolveSyncedDisplay(input: unknown, root: unknown, expected: DataScope & Partial<Pick<SyncedScope, "deploymentOrigin">>, composed?: ComposedDataContext): SyncedOccurrencePlan {
  if (encodedBytes(input) > SYNCED_CONTENT_LIMITS.bytes) fail("Reusable display exceeds its transport budget.");
  const value = syncedDisplaySchema.parse(input), tree = composed ? createComposedRegistry(composed.definitions, value.scope).validateTree(root) : validateCanonicalTree(root);
  if (value.scope.websiteKey !== expected.websiteKey || value.scope.instanceKey !== expected.instanceKey || expected.deploymentOrigin !== undefined && value.scope.deploymentOrigin !== expected.deploymentOrigin) fail("Reusable display belongs to another installation.");
  if (value.rootDigest !== rootDigest(tree)) fail("Reusable display belongs to a different authored document.");
  const selections = new Map(value.selections.map(selection => [requestKey(selection.request), selection]));
  const versions = new Map(value.revisions.map(source => [versionKey(source), source]));
  if (selections.size !== value.selections.length || versions.size !== value.revisions.length) fail("Duplicate reusable display binding.");
  for (const source of value.revisions) {
    assertPublicCanonicalTree(source.blocks);
    if (source.displayDigest !== syncedContentDigest(source.title, source.blocks)) fail("Reusable display content digest mismatch.");
  }
  const usedSelections = new Set<string>(), usedVersions = new Set<string>();
  const plan = resolveSyncedOccurrencesSnapshot(tree, value.scope, request => {
    const key = requestKey(request), selection = selections.get(key);
    if (!selection) return fail("Missing reusable selection binding.");
    usedSelections.add(key);
    if (!selection.target) return null;
    const targetKey = versionKey(selection.target), source = versions.get(targetKey);
    if (!source || source.displayDigest !== selection.target.displayDigest) return fail("Missing exact reusable display revision.");
    usedVersions.add(targetKey);
    return { id: source.id, revision: source.revision, title: source.title, blocks: source.blocks, digest: source.displayDigest, scope: value.scope, published: true };
  }, { composed });
  if (usedSelections.size !== selections.size || usedVersions.size !== versions.size) fail("Unreferenced reusable display content is forbidden.");
  return applyDisplayOmissions(plan, value.omitted ?? []);
}

function withRoots(plan: SyncedOccurrencePlan, roots: SyncedOccurrence[]): SyncedOccurrencePlan {
  const byId = new Map<string, SyncedOccurrence>();
  const visit = (nodes: SyncedOccurrence[]) => { for (const node of nodes) { byId.set(node.id, node);visit(node.children); } };
  visit(roots);
  return { ...plan, roots, byId, resolverTree: plan.composed ? createComposedRegistry(plan.composed.definitions, plan.scope).validateTree(occurrenceResolverTree(roots)) : validateCanonicalTree(occurrenceResolverTree(roots)), digest: sha256Hex(canonicalJson({ contract: "synced-occurrences-v1", scope: plan.scope, roots })) };
}
/** A mask can hide a repeated copy only when its content is legitimately
 * displayed elsewhere in this document. Hidden-only bodies must be absent from
 * the transport itself, not merely hidden by the renderer. */
function applyDisplayOmissions(plan: SyncedOccurrencePlan, omitted: string[]): SyncedOccurrencePlan {
  const denied = new Set(omitted), consumed = new Set<string>();
  if (denied.size !== omitted.length) fail("Duplicate omitted placement.");
  for (const id of denied) if (!plan.byId.get(id)?.owner) fail("Only existing reusable descendants may be omitted; root content must be removed from the payload.");
  const filter = (nodes: SyncedOccurrence[]): SyncedOccurrence[] => nodes.flatMap(node => {
    if (denied.has(node.id)) { consumed.add(node.id);return []; }
    return [{ ...node, children: filter(node.children) }];
  });
  const visible = withRoots(plan, filter(plan.roots));
  if (consumed.size !== denied.size) fail("Redundant or unreachable omitted placement.");
  const bodies = new Map<string, Set<string>>(), referenced = new Set<string>();
  for (const node of visible.byId.values()) {
    if (node.reference) referenced.add(versionKey(node.reference));
    if (node.owner) { const key = versionKey(node.owner), ids = bodies.get(key) ?? new Set<string>();ids.add(node.node.id);bodies.set(key, ids); }
  }
  for (const source of plan.resolution.revisions) {
    const key = versionKey(source);
    if (!referenced.has(key)) fail("Hidden-only reusable revision metadata is forbidden.");
    const visit = (nodes: CanonicalTree) => { for (const node of nodes) { if (!bodies.get(key)?.has(node.id)) fail("Hidden-only reusable content must be removed from the payload.");if (node.children) visit(node.children); } };
    visit(source.blocks);
  }
  return visible;
}

/** Produce only published display bodies. Original immutable source digests,
 * recipient addresses, editorial locks and internal occurrence maps never cross
 * this boundary. The document's own authoring digest remains a separate field. */
export function createSyncedDisplay(plan: SyncedOccurrencePlan, options: { publicRoot?: boolean } = {}): SyncedDisplay {
  const value = unmaskedDisplay(plan, options.publicRoot ?? false);
  resolveSyncedDisplay(value, options.publicRoot ? publicCanonicalTree(plan.resolution.blocks) : plan.resolution.blocks, plan.scope, plan.composed);
  return value;
}
function unmaskedDisplay(plan: SyncedOccurrencePlan, publicRoot: boolean): SyncedDisplay {
  const tree = publicRoot ? publicCanonicalTree(plan.resolution.blocks) : plan.resolution.blocks;
  const revisions = plan.resolution.revisions.map(source => {
    const blocks = publicCanonicalTree(source.blocks);
    return { id: source.id, revision: source.revision, title: source.title, blocks, displayDigest: syncedContentDigest(source.title, blocks) };
  });
  const versions = new Map(revisions.map(source => [versionKey(source), source]));
  const selections = new Map<string, SyncedDisplay["selections"][number]>();
  for (const occurrence of plan.byId.values()) {
    const node = occurrence.node;
    if (node.name !== "core/synced" || !node.attrs.syncedBlock) continue;
    const request: SyncedRequest = node.attrs.revisionPolicy === "pinned" ? { id: node.attrs.syncedBlock, revisionPolicy: "pinned", revision: node.attrs.revision! } : { id: node.attrs.syncedBlock, revisionPolicy: "latest" };
    const source = occurrence.reference ? versions.get(versionKey(occurrence.reference)) : null;
    if (occurrence.reference && !source) fail("Missing published source for display projection.");
    const target = source ? { id: source.id, revision: source.revision, displayDigest: source.displayDigest } : null;
    const key = requestKey(request), previous = selections.get(key);
    if (previous && canonicalJson(previous.target) !== canonicalJson(target)) fail("Conflicting reusable selection binding.");
    selections.set(key, { request, target });
  }
  const value: SyncedDisplay = { contract: "synced-display-v1", scope: plan.scope, rootDigest: rootDigest(tree), selections: [...selections.values()], revisions };
  return value;
}

/** Server projection after per-placement authorization. Returns raw resolver
 * input separately from the redacted transport; never serialize this whole
 * result. Visible IDs must be ancestor-closed and come from this exact plan. */
export function projectSyncedDisplay(plan: SyncedOccurrencePlan, visibleIds: ReadonlySet<string>) {
  for (const id of visibleIds) if (!plan.byId.has(id)) fail("Visibility belongs to another occurrence plan.");
  function allowedForest(nodes: SyncedOccurrence[], parentAllowed = true): SyncedOccurrence[] {
    return nodes.flatMap(node => {
      const allowed = visibleIds.has(node.id);
      if (allowed && !parentAllowed) fail("Visible reusable content requires every ancestor to be visible.");
      const children = allowedForest(node.children, parentAllowed && allowed);
      return allowed ? [{ ...node, children }] : [];
    });
  }
  const allowed = withRoots(plan, allowedForest(plan.roots));
  const rootIds = new Set<string>(), bodyIds = new Map<string, Set<string>>(), referenced = new Set<string>();
  for (const node of allowed.byId.values()) {
    if (node.reference) referenced.add(versionKey(node.reference));
    if (!node.owner) rootIds.add(node.node.id);
    else { const key = versionKey(node.owner), ids = bodyIds.get(key) ?? new Set<string>();ids.add(node.node.id);bodyIds.set(key, ids); }
  }
  const filter = (nodes: RuntimeCanonicalTree, ids: ReadonlySet<string>): RuntimeCanonicalTree => nodes.flatMap(node => ids.has(node.id) ? [{ ...node, ...(node.children ? { children: filter(node.children, ids) } : {}) } as RuntimeCanonicalTree[number]] : []);
  const registry = plan.composed ? createComposedRegistry(plan.composed.definitions, plan.scope) : undefined;
  const root = registry ? registry.validateTree(filter(plan.resolution.blocks, rootIds)) : validateCanonicalTree(filter(plan.resolution.blocks, rootIds));
  const definitions = registry?.snapshotFor(root);
  const composed = definitions?.definitions.length ? { scope: plan.scope, definitions } : undefined;
  const versions = new Map(plan.resolution.revisions.filter(source => referenced.has(versionKey(source))).map(source => {
    const blocks = validateCanonicalTree(filter(source.blocks, bodyIds.get(versionKey(source)) ?? new Set()));
    return [versionKey(source), { ...source, blocks, digest: syncedContentDigest(source.title, blocks) }] as const;
  }));
  const requests = new Map<string, SyncedOccurrence["reference"]>();
  for (const node of plan.byId.values()) if (node.node.name === "core/synced" && node.node.attrs.syncedBlock) {
    const attrs = node.node.attrs;
    const request: SyncedRequest = attrs.revisionPolicy === "pinned" ? { id: attrs.syncedBlock!, revisionPolicy: "pinned", revision: attrs.revision! } : { id: attrs.syncedBlock!, revisionPolicy: "latest" };
    requests.set(requestKey(request), node.reference);
  }
  const union = resolveSyncedOccurrencesSnapshot(root, plan.scope, request => {
    const key = requestKey(request);
    if (!requests.has(key)) return fail("Unknown projected selection.");
    const target = requests.get(key);
    if (!target) return null;
    return versions.get(versionKey(target)) ?? fail("Hidden-only source survived the projection.");
  }, { composed });
  const omitted: string[] = [];
  const visit = (nodes: SyncedOccurrence[]) => { for (const node of nodes) { if (!visibleIds.has(node.id)) omitted.push(node.id);else visit(node.children); } };
  visit(union.roots);
  const synced = { ...unmaskedDisplay(union, true), ...(omitted.length ? { omitted } : {}) };
  const blocks = publicCanonicalTree(root);
  const checked = resolveSyncedDisplay(synced, blocks, plan.scope, composed);
  if (canonicalJson([...checked.byId.keys()]) !== canonicalJson([...allowed.byId.keys()])) fail("Projected visibility does not match the authorized occurrence forest.");
  return { blocks, synced, resolverTree: allowed.resolverTree, displayPlan: checked };
}
