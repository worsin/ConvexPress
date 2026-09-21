/** Shared lossless media-ID discovery for writes and reverse-index backfill. */
import { ConvexError, getDocumentSize } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { RequestReadLedger } from "../helpers/requestReadLedger";
import { inventory } from "./referenceScan";
import { opaqueMediaContainers } from "./referencePolicy";
export type MediaReferenceCandidate = { id: Id<"media">; required: boolean };
export function collectMediaReferenceCandidates(ctx: Pick<QueryCtx, "db">, table: string, candidate: Record<string, unknown>, requiredMediaIds: readonly string[] = []): MediaReferenceCandidate[] {
  const ids = new Map<Id<"media">, boolean>();
  let nodes = 0, bytes = 0, candidates = 0;
  function budget(depth: number) { if (++nodes > 20000 || depth > 64 || bytes > 4 * 1024 * 1024 || ids.size > 100) throw new ConvexError({ code: "MEDIA_ATTACHMENT_BUDGET", message: "Media attachments exceed the supported save budget." }); }
  function id(value: unknown, typed: boolean) {
    if (value == null || value === "") return;
    if (typeof value !== "string") { if (typed) throw new ConvexError({ code: "MEDIA_UNAVAILABLE", message: "Invalid media reference." }); return; }
    const normalized = ctx.db.normalizeId("media", value);
    // Legacy normalization also accepts ordinary 22-character text. Only a typed
    // field or a canonical ID proves reference intent without an existence read.
    if (normalized) ids.set(normalized, Boolean(ids.get(normalized)) || typed || normalized === value);
    else if (typed) throw new ConvexError({ code: "MEDIA_UNAVAILABLE", message: "Invalid media reference." });
  }
  for (const descriptor of inventory[table] ?? []) {
    function typed(value: unknown, path: readonly string[], depth: number) {
      budget(depth);
      if (!path.length) { id(value, true); return; }
      const [key, ...rest] = path;
      if (key === "*") { if (Array.isArray(value)) for (const item of value) typed(item, rest, depth + 1); }
      else if (value && typeof value === "object") typed((value as Record<string, unknown>)[key!], rest, depth + 1);
    }
    typed(candidate, descriptor.path, 0);
  }
  // Authoring systems may supply IDs from their own validated typed fields.
  // Keep this shared scanner independent of any particular block/plugin schema.
  for (const value of requiredMediaIds) id(value, true);
  function opaque(value: unknown, depth: number) {
    budget(depth);
    if (typeof value === "string") {
      bytes += new TextEncoder().encode(value).byteLength; budget(depth);
      id(value, false);
      // Serialized TipTap/legacy HTML IDs remain discoverable without guessing a
      // plugin's field names. normalizeId validates actual target-table identity.
      // Sliding candidates preserve literal-ID substring semantics of the deletion
      // scanner, including an ID adjoining other alphanumeric prose.
      for (const match of value.matchAll(/(?=([a-z0-9]{32}))/g)) {
        if (++candidates > 20000) throw new ConvexError({ code: "MEDIA_ATTACHMENT_BUDGET", message: "Media reference text exceeds the supported inspection budget." });
        id(match[1], false);
      }
      const trimmed = value.trimStart();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        let parsed: unknown; try { parsed = JSON.parse(value); } catch { return; }
        opaque(parsed, depth + 1);
      }
    } else if (Array.isArray(value)) for (const item of value) opaque(item, depth + 1);
    else if (value && typeof value === "object") for (const item of Object.values(value)) opaque(item, depth + 1);
  }
  for (const field of opaqueMediaContainers[table] ?? []) opaque(candidate[field], 0);
  budget(0);
  return [...ids].map(([id, required]) => ({ id, required }));
}

/** Keep the synchronous discovery API for callers that inspect candidates only. */
export function collectMediaReferenceIds(ctx: Pick<QueryCtx, "db">, table: string, candidate: Record<string, unknown>): Id<"media">[] {
  return collectMediaReferenceCandidates(ctx, table, candidate).map(reference => reference.id);
}

/** Ambiguous legacy text only becomes an edge when it names an existing image.
 * Typed and canonical dangling references remain evidence during index backfill.
 */
export async function resolveMediaReferenceIds(ctx: Pick<QueryCtx, "db">, table: string, candidate: Record<string, unknown>, ledger?: RequestReadLedger): Promise<Id<"media">[]> {
  const ids: Id<"media">[] = [];
  let bytes = 0;
  for (const reference of collectMediaReferenceCandidates(ctx, table, candidate)) {
    if (reference.required) { ids.push(reference.id); continue; }
    ledger?.beforeRead();
    const media = await ctx.db.get("media", reference.id);
    ledger?.record(media);
    if (!media) continue;
    bytes += getDocumentSize(media);
    if (bytes > 512 * 1024) throw new ConvexError({ code: "MEDIA_ATTACHMENT_BUDGET", message: "Media metadata exceeds the supported reference inspection budget." });
    ids.push(reference.id);
  }
  return ids;
}
