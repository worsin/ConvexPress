import { MEDIA_IMPORT_PREFIX, MEDIA_INDEX_EPOCH_NAME } from "@convexpress/site-contract/media-index-epoch";
import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import type { SyncedScope } from "../canonicalDocuments/foundation/syncedContent";
import { SYNCED_CONSUMER_INDEX_VERSION } from "./consumerIndexVersion.generated";

export function consumerIndexGeneration(): string | null {
  const epoch = process.env[MEDIA_INDEX_EPOCH_NAME];
  // This external epoch survives database replacement. An import in progress
  // or a restored index certificate cannot authorize runtime activation.
  if (!epoch || epoch.startsWith(MEDIA_IMPORT_PREFIX) || !/^[a-zA-Z0-9_-]{16,128}$/.test(epoch)) return null;
  return `${epoch}:${SYNCED_CONSUMER_INDEX_VERSION}`;
}
export function currentConsumerIndex(state: Doc<"syncedBlockConsumerIndex"> | null, scope: SyncedScope, generation = consumerIndexGeneration()): state is Doc<"syncedBlockConsumerIndex"> {
  return !!generation && !!state && state.generation === generation && state.websiteKey === scope.websiteKey && state.instanceKey === scope.instanceKey && state.deploymentOrigin === scope.deploymentOrigin
    && Number.isSafeInteger(state.sequence) && state.sequence >= 0 && Number.isSafeInteger(state.documents) && state.documents >= 0;
}
export async function readConsumerIndex(ctx: Pick<QueryCtx, "db">, budget: RequestReadLedger) {
  budget.beforeRead();
  return budget.record(await ctx.db.query("syncedBlockConsumerIndex").withIndex("by_key", q => q.eq("key", "active")).unique());
}
export async function hasDirtyConsumers(ctx: Pick<QueryCtx, "db">, budget: RequestReadLedger): Promise<boolean> {
  budget.beforeRead();
  return !!budget.record(await ctx.db.query("syncedBlockConsumerDirty").first());
}
export async function consumerIndexReady(ctx: Pick<QueryCtx, "db">, scope: SyncedScope, budget: RequestReadLedger): Promise<boolean> {
  if (!consumerIndexGeneration()) return false;
  const state = await readConsumerIndex(ctx, budget);
  return currentConsumerIndex(state, scope) && state.phase === "ready" && state.cursor === null && !state.errorCode && !(await hasDirtyConsumers(ctx, budget));
}

/** Forms repair requires complete discovery, including when verification is
 * paused on a stale form. This is deliberately weaker than runtime readiness. */
export async function consumerDiscoveryReady(ctx: Pick<QueryCtx, "db">, scope: SyncedScope, budget: RequestReadLedger): Promise<boolean> {
  if (!consumerIndexGeneration()) return false;
  const state = await readConsumerIndex(ctx, budget);
  return currentConsumerIndex(state, scope)
    && (state.phase === "forms" || state.phase === "ready" && state.cursor === null && !state.errorCode)
    && !(await hasDirtyConsumers(ctx, budget));
}
