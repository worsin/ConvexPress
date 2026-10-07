import { ConvexError } from "convex/values";
import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { deleteDynamicWithMediaReferences, patchDynamicWithMediaReferences } from "../../media/attachmentGuard";

type Session = Doc<"commerce_assistant_sessions">;
type Reader = Pick<QueryCtx, "db">;

/** Old bearer tokens remain owner-bound; in-flight replies follow their thread. */
export async function resolveThread(ctx: Reader, first: Session) {
  let session = first;
  let adoptedAt = first.adoptedAt ?? 0;
  const seen = new Set<string>();
  while (session.mergedIntoSessionId) {
    if (seen.has(session._id) || seen.size >= 32) throw new ConvexError({ code: "SESSION_HISTORY_INVALID", message: "This conversation needs maintenance before it can continue." });
    seen.add(session._id);
    const next = await ctx.db.get("commerce_assistant_sessions", session.mergedIntoSessionId);
    if (!next || !first.userId || next.userId !== first.userId) throw new ConvexError({ code: "SESSION_OWNER_MISMATCH", message: "This shopping session belongs to another account. Please refresh the shop." });
    adoptedAt = Math.max(adoptedAt, next.adoptedAt ?? 0);
    session = next;
  }
  return { session, adoptedAt };
}

/** Imported turns retain their original timestamps, with a separate visibility epoch. */
export async function visibleMessages(ctx: Reader, session: Session, limit: number) {
  const cutoff = session.clearedBefore ?? 0;
  const [ordinary, adopted] = await Promise.all([
    ctx.db.query("commerce_assistant_messages").withIndex("by_session", q => q.eq("sessionId", session._id).gt("createdAt", cutoff)).order("desc").take(limit),
    ctx.db.query("commerce_assistant_messages").withIndex("by_session_adopted", q => q.eq("sessionId", session._id).gt("adoptedAt", cutoff)).order("desc").take(limit),
  ]);
  return [...new Map([...ordinary, ...adopted].map(row => [row._id, row])).values()]
    .filter(row => (row.adoptedAt ?? row.createdAt) > cutoff)
    .sort((a, b) => (b.adoptedAt ?? b.createdAt) - (a.adoptedAt ?? a.createdAt) || b.createdAt - a.createdAt || b._creationTime - a._creationTime)
    .slice(0, limit);
}

export async function adoptGuestMemory(ctx: MutationCtx, token: string, userId: Session["userId"]) {
  if (!userId) return;
  const [guest, owned] = await Promise.all([token, String(userId)].map(subjectKey =>
    ctx.db.query("commerce_shopper_memory").withIndex("by_subject", q => q.eq("subjectKey", subjectKey)).take(41)));
  if (!guest.length) return;
  if (guest.length > 40 || owned.length > 40) throw new ConvexError({ code: "MEMORY_LIMIT", message: "Please clear saved preferences before continuing." });
  const now = Date.now();
  const byFact = new Map<string, Doc<"commerce_shopper_memory">>();
  for (const row of [...owned, ...guest]) {
    if (row.expiresAt && row.expiresAt <= now) { await deleteDynamicWithMediaReferences(ctx, row._id); continue; }
    const key = row.fact.trim().toLowerCase(), prior = byFact.get(key);
    if (prior) {
      const merged = { ...prior, consented: prior.consented || row.consented, updatedAt: Math.max(prior.updatedAt, row.updatedAt), expiresAt: !prior.expiresAt || !row.expiresAt ? undefined : Math.max(prior.expiresAt, row.expiresAt) };
      await patchDynamicWithMediaReferences(ctx, prior._id, { consented: merged.consented, updatedAt: merged.updatedAt, expiresAt: merged.expiresAt });
      await deleteDynamicWithMediaReferences(ctx, row._id); byFact.set(key, merged);
    } else {
      if (row.subjectKey !== String(userId)) await patchDynamicWithMediaReferences(ctx, row._id, { subjectKey: String(userId) });
      byFact.set(key, row);
    }
  }
  // The existing preference store retains the forty most recently updated facts.
  const sorted = [...byFact.values()].sort((a, b) => b.updatedAt - a.updatedAt || b._creationTime - a._creationTime);
  for (const row of sorted.slice(40)) await deleteDynamicWithMediaReferences(ctx, row._id);
}

/** Caller has authorized both source and destination using assistantScope. */
export async function adoptThread(ctx: MutationCtx, source: Session, destination: Session) {
  if (source._id === destination._id) return;
  if (!source.userId || source.userId !== destination.userId) throw new ConvexError({ code: "SESSION_OWNER_MISMATCH", message: "This shopping session belongs to another account. Please refresh the shop." });
  const now = Math.max(Date.now(), (destination.clearedBefore ?? 0) + 1);
  const recentTimes = await Promise.all([source, destination].map(async session => session.recentUserTurnTimes ??
    (await ctx.db.query("commerce_assistant_messages").withIndex("by_session_role", q => q.eq("sessionId", session._id).eq("role", "user").gte("createdAt", now - 60_000)).take(120)).map(row => row.createdAt)));
  const recent = await visibleMessages(ctx, source, 60);
  for (const message of recent) await patchDynamicWithMediaReferences(ctx, message._id, { sessionId: destination._id, adoptedAt: now });
  await ctx.db.patch("commerce_assistant_sessions", destination._id, {
    messageCount: destination.messageCount + source.messageCount,
    lastQuery: source.lastQuery ?? destination.lastQuery,
    lastRoute: source.lastRoute ?? destination.lastRoute,
    recentUserTurnTimes: recentTimes.flat().filter(time => time >= now - 60_000).sort((a, b) => a - b).slice(-240),
    updatedAt: now,
  });
  await ctx.db.patch("commerce_assistant_sessions", source._id, { mergedIntoSessionId: destination._id, adoptedAt: now, messageCount: 0, updatedAt: now });
  await ctx.scheduler.runAfter(0, (internal as any).commerce.assistant.mutations.transferHistory, { sessionId: source._id });
}

/** Drain every older row without making sign-in an unbounded transaction. */
export async function transferHistoryBatch(ctx: MutationCtx, source: Session) {
  if (!source.mergedIntoSessionId) return;
  const { session: destination, adoptedAt } = await resolveThread(ctx, source);
  const rows = await ctx.db.query("commerce_assistant_messages").withIndex("by_session", q => q.eq("sessionId", source._id)).take(250);
  for (const row of rows) {
    if ((row.adoptedAt ?? row.createdAt) <= (source.clearedBefore ?? 0) || adoptedAt <= (destination.clearedBefore ?? 0)) {
      // Honor a prior source clear, or a destination clear during this transfer.
      await deleteDynamicWithMediaReferences(ctx, row._id);
    } else await patchDynamicWithMediaReferences(ctx, row._id, { sessionId: destination._id, adoptedAt });
  }
  if (rows.length === 250) await ctx.scheduler.runAfter(0, (internal as any).commerce.assistant.mutations.transferHistory, { sessionId: source._id });
}
