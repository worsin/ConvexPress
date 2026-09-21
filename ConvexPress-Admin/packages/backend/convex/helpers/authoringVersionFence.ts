/** Low-level format fence. No DB reads, media hooks or canonical service imports.
 * The permit is an internal source-level integration guard, never authorization.
 * Canonical services must validate authority, CAS, full tree and transition rules
 * BEFORE calling permitValidatedCanonicalAuthoringWrite. Client input cannot
 * construct a permit, and a permit is valid for one exact prepared write only. */
import { ConvexError } from "convex/values";
import { AUTHORING_FIELDS } from "./authoringSnapshot";
import { assertCanonicalBlockLocks, CanonicalTreeError } from "../canonicalDocuments/foundation/generated/instance_runtime.mjs";

export type AuthoringWrite = {
  table: string;
  operation: "insert" | "patch" | "replace";
  id?: string;
  previous?: Record<string, unknown> | null;
  value: Record<string, unknown>;
};
declare const canonicalPermit: unique symbol;
export type CanonicalAuthoringWritePermit = { readonly [canonicalPermit]: true };
const protectedFields = new Set<string>([...AUTHORING_FIELDS, "autosaveTitle", "autosaveContent", "autosavedAt"]);
const publicationFields = new Set(["visibility", "password", "scheduledAt", "publishedAt"]);
const permits = new WeakMap<object, { table: string; operation: string; id?: string; value: object; encodedValue: string; previous: string; legacyRecovery?: boolean }>();
function refusal(code = "CANONICAL_AUTHORING_REQUIRED"): never {
  throw new ConvexError({ code, message: code === "UNSUPPORTED_AUTHORING_VERSION" ? "This authoring format is unsupported. It cannot be converted by a legacy writer." : code === "CANONICAL_PUBLICATION_UNAVAILABLE" ? "Canonical publication is not available at this implementation checkpoint." : "This document requires the canonical authoring service. Reload it in the supported editor." });
}
function owns(table: string) { return table === "posts" || table === "revisions"; }
function version(value: Record<string, unknown> | null | undefined): 1 | 2 {
  const raw = value?.blocksVersion;
  if (raw === undefined || raw === 1) {
    if (value?.composedDefinitions !== undefined) return refusal();
    return 1;
  }
  if (raw === 2) return 2;
  return refusal("UNSUPPORTED_AUTHORING_VERSION");
}
export function assertLegacyAuthoring(value: Record<string, unknown>): void { if (version(value) !== 1) refusal(); }
export function authoringWriteNeedsPrevious(table: string, operation: AuthoringWrite["operation"], value: Record<string, unknown>): boolean {
  return owns(table) && operation !== "insert" && (operation === "replace" || Object.keys(value).some(key => protectedFields.has(key) || publicationFields.has(key) || key === "status"));
}
// Tagged encoding preserves missing/undefined/null and sorted object semantics;
// only an in-memory equality receipt is retained, never a logged content hash.
function encode(value: unknown): string {
  const seen = new Set<object>();
  function visit(item: unknown): unknown {
    if (item === undefined) return ["undefined"];
    if (item === null) return ["null"];
    if (typeof item === "string" || typeof item === "boolean") return [typeof item, item];
    if (typeof item === "number" && Number.isFinite(item)) return ["number", item];
    if (typeof item === "bigint") return ["bigint", item.toString()];
    if (typeof item !== "object" || seen.has(item)) return refusal();
    seen.add(item);
    let result: unknown;
    if (item instanceof ArrayBuffer) result = ["bytes", [...new Uint8Array(item)]];
    else if (Array.isArray(item)) result = ["array", item.map(visit)];
    else result = ["object", Object.keys(item).sort().map(key => [key, visit((item as Record<string, unknown>)[key])])];
    seen.delete(item);
    return result;
  }
  return JSON.stringify(visit(value));
}
function priorBinding(write: AuthoringWrite): string {
  const previous = write.previous;
  return encode(previous ? Object.fromEntries(["_id", "status", ...publicationFields, ...protectedFields].filter(key => Object.prototype.hasOwnProperty.call(previous, key)).map(key => [key, previous[key]])) : null);
}
function transition(write: AuthoringWrite): { from: 1 | 2; to: 1 | 2; body: boolean } {
  if (authoringWriteNeedsPrevious(write.table, write.operation, write.value) && !write.previous) throw new ConvexError({ code: "NOT_FOUND", message: "Document not found." });
  const from = version(write.previous);
  const candidate = write.operation === "patch" ? { ...write.previous, ...write.value } : write.value;
  const to = version(candidate);
  if (write.table === "posts" && to === 2 && ["pending", "auto-draft"].includes(String(candidate.status))) refusal("CANONICAL_PUBLICATION_UNAVAILABLE");
  return { from, to, body: write.operation !== "patch" || Object.keys(write.value).some(key => protectedFields.has(key) || publicationFields.has(key) || (key === "status" && ["publish", "future", "private"].includes(String(candidate.status)))) };
}
export function permitValidatedCanonicalAuthoringWrite(write: AuthoringWrite): CanonicalAuthoringWritePermit {
  if (!owns(write.table)) refusal();
  const { to } = transition(write);
  if (to !== 2) refusal();
  const permit = Object.freeze({}) as CanonicalAuthoringWritePermit;
  permits.set(permit, { table: write.table, operation: write.operation, id: write.id, value: write.value, encodedValue: encode(write.value), previous: priorBinding(write) });
  return permit;
}
/** Only the reviewed recovery service may mint this exact v2-to-v1 receipt. */
export function permitValidatedLegacyRecoveryWrite(write: AuthoringWrite): CanonicalAuthoringWritePermit {
  const { from, to } = transition(write);
  if (write.table !== "posts" || write.operation !== "patch" || from !== 2 || to !== 1) refusal();
  const permit = Object.freeze({}) as CanonicalAuthoringWritePermit;
  permits.set(permit, { table: write.table, operation: write.operation, id: write.id, value: write.value, encodedValue: encode(write.value), previous: priorBinding(write), legacyRecovery: true });
  return permit;
}
export function assertAuthoringWrite(write: AuthoringWrite, permit?: CanonicalAuthoringWritePermit): void {
  if (!owns(write.table)) return;
  if (write.operation === "patch" && !authoringWriteNeedsPrevious(write.table, write.operation, write.value)) return;
  const { from, to, body } = transition(write);
  if (!body || (from === 1 && to === 1)) return;
  const receipt = permit && permits.get(permit);
  if (permit) permits.delete(permit);
  if (!receipt || (to !== 2 && !(receipt.legacyRecovery && from === 2 && to === 1)) || receipt.table !== write.table || receipt.operation !== write.operation || receipt.id !== write.id || receipt.value !== write.value || receipt.encodedValue !== encode(write.value) || receipt.previous !== priorBinding(write)) refusal();
  if (write.table === "posts" && from === 2) {
    const candidate = write.operation === "patch" ? { ...write.previous, ...write.value } : write.value;
    try {
      // Returning to a legacy editor cannot erase live canonical safeguards.
      if (to !== 2) {
        const visit = (nodes: unknown): boolean => Array.isArray(nodes) && nodes.some(node => node && typeof node === "object" && (Object.values(node.lock ?? {}).some(Boolean) || visit(node.children)));
        if (visit(write.previous?.blocks)) throw new ConvexError({ code: "BLOCK_LOCKED", message: "Unlock blocks and save before returning to the original editor." });
      } else assertCanonicalBlockLocks(write.previous?.blocks, candidate.blocks);
    } catch (error) {
      if (error instanceof CanonicalTreeError) throw new ConvexError({ code: error.code, message: error.message });
      throw error;
    }
  }
}
