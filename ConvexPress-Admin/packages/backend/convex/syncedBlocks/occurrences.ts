import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { resolveSyncedOccurrences } from "../canonicalDocuments/foundation/syncedOccurrences";
import { installation, publishedReader } from "./model";

/** Service-only expansion of an already authorized document. Read/submission
 * callers must load the current document and check its access first. This
 * helper does not expose drafts or register an anonymous source-read endpoint.
 * The same ledger must continue through data/media/submission authorization. */
export async function resolvePublishedOccurrences(ctx: QueryCtx, authored: unknown, budget: RequestReadLedger, options: { requireAvailable?: boolean; onSource?: (id: Id<"syncedBlocks">) => void } = {}) {
  const scope = await installation(ctx, budget);
  return resolveSyncedOccurrences(authored, scope, publishedReader(ctx, scope, budget, options.onSource), options);
}
