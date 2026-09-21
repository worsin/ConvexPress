import type { Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import { z } from "zod";
import type { PaginationOptions } from "convex/server";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Write } from "../extensions/events/rsvp";
import type { RsvpTarget } from "../extensions/events/rsvpAuthority";
import type { RequestReadLedger } from "../helpers/requestReadLedger";
import type { RsvpSnapshot, RsvpReceipt } from "./foundation/rsvpContracts";
import { rsvpProviderIdSchema } from "./foundation/rsvpContracts";
import type { CanonicalEventOptions } from "./foundation/documentContracts";
import { canonicalJson, sha256Hex } from "./foundation/shared/fingerprints";
import { extensionRsvpSources } from "../schema/_rsvpIndex.generated";

export type RsvpSourceSnapshot = RsvpSnapshot & {postId:Id<"posts">};
export interface RsvpSource {
  id: string;
  matchesId(ctx: Pick<QueryCtx, "db">, rawId: string): boolean;
  readSnapshot(ctx: QueryCtx, target: RsvpTarget, budget: RequestReadLedger): Promise<RsvpSourceSnapshot | null>;
  verifiedAction: string;
  write(ctx: MutationCtx, args: Write): Promise<RsvpReceipt>;
  listOptions(ctx: QueryCtx, options: PaginationOptions, budget: RequestReadLedger, now: number): Promise<CanonicalEventOptions>;
}
export function findRsvpSource(ctx: QueryCtx, rawId: string): RsvpSource | null {
  const matches = extensionRsvpSources.filter(source => source.matchesId(ctx, rawId));
  return matches.length === 1 ? matches[0] : null;
}
const cursorSchema = z.strictObject({ v: z.literal(1), sources: z.string().regex(/^[a-f0-9]{64}$/), providerId: rsvpProviderIdSchema, token: z.string().max(16384).nullable() });
const refuseCursor = (): never => { throw new ConvexError({ code: "RSVP_OPTIONS_CURSOR", message: "Available event plugins changed or this cursor is invalid. Refresh the event choices." }); };

/** A page reads one indexed table only. Cursor identity includes the complete
 * enabled provider set, so a plugin toggle cannot reuse another table's cursor. */
export async function listRsvpOptions(ctx: QueryCtx, options: PaginationOptions, enabled: readonly string[], budget: RequestReadLedger): Promise<CanonicalEventOptions> {
  const providers = extensionRsvpSources.filter(source => enabled.includes(source.id)).sort((a, b) => a.id.localeCompare(b.id));
  if (!enabled.includes("forms") || !providers.length) throw new ConvexError({ code: "PLUGIN_DISABLED", message: "Enable Forms and an event plugin before choosing an RSVP event." });
  const ids = providers.map(source => source.id);
  if (new Set(ids).size !== ids.length) refuseCursor();
  const sources = sha256Hex(canonicalJson(ids));
  const encode = (providerId: string, token: string | null) => JSON.stringify({ v: 1, sources, providerId, token });
  const decode = (cursor: string) => {
    if (cursor.length > 32768) return refuseCursor();
    let parsed: z.infer<typeof cursorSchema>;
    try { parsed = cursorSchema.parse(JSON.parse(cursor)); } catch { return refuseCursor(); }
    if (parsed.sources !== sources || !ids.includes(parsed.providerId)) return refuseCursor();
    return parsed;
  };
  const selected = options.cursor ? decode(options.cursor) : { providerId: ids[0], token: null };
  const index = ids.indexOf(selected.providerId), provider = providers[index];
  let endCursor = options.endCursor;
  if (endCursor) { const end = decode(endCursor); if (end.providerId !== selected.providerId) refuseCursor(); endCursor = end.token; }
  const result = await provider.listOptions(ctx, { ...options, cursor: selected.token, endCursor }, budget, Date.now());
  const nextProvider = result.isDone ? providers[index + 1] : undefined;
  const isDone = result.isDone && !nextProvider;
  return {
    ...result, isDone,
    continueCursor: isDone ? "" : nextProvider ? encode(nextProvider.id, null) : encode(provider.id, result.continueCursor),
    ...(result.splitCursor ? { splitCursor: encode(provider.id, result.splitCursor) } : {}),
  };
}
