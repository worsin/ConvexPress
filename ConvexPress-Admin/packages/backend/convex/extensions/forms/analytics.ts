/**
 * ConvexPress Forms — Analytics (Form Analytics & Export System).
 * API paths:
 *   api.extensions.forms.analytics.recordFunnelPublic   (PUBLIC mutation)
 *   api.extensions.forms.analytics.getFunnel            (admin query)
 *   internal.extensions.forms.analytics.{recordFunnel,onFormSubmitted,sweepAbandoned}
 *
 * Funnel counters live in `form_funnel_stats` (table already exists; NOT edited
 * here). The single index `by_form_day` ["formId","day","stage"] serves BOTH
 * the upsert lookup and the range read — no second index is added.
 *
 * Stage sources:
 *   - viewed / started → the public renderer (recordFunnelPublic), on mount +
 *     first interaction.
 *   - completed → the `form.submitted` event listener (onFormSubmitted), only
 *     when isComplete:true. The submit mutation is UNCHANGED (already emits it).
 *   - abandoned → the daily sweep over stale `partial` submissions.
 *
 * CAPABILITY TYPING: `form.view_analytics` is SURFACED here but REGISTERED by
 * the Role/Capability expert, so it isn't in the closed `Capability` union yet —
 * we cast at the requireCan call site (mirrors mutations.ts).
 */

import { internalMutation, mutation, query } from "../../_generated/server";
import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { requireCan } from "../../helpers/permissions";
import type { Capability } from "../../types/capabilities";

// ─── Constants ──────────────────────────────────────────────────────────────

/** A partial draft is considered "abandoned" after this idle horizon. */
const ABANDON_TTL_MS = 24 * 60 * 60 * 1000;
/** Max rows the sweep processes per invocation (stay within mutation limits). */
const SWEEP_BATCH = 100;

type FunnelStage = "viewed" | "started" | "completed" | "abandoned";

// ─── Module-local helpers ───────────────────────────────────────────────────

/** Cast a `form.*` capability string to `Capability` (see file header). */
function formCap(cap: string): Capability {
  return cap as Capability;
}

/** UTC day bucket "YYYY-MM-DD" for an epoch-ms timestamp. */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Upsert a `form_funnel_stats` counter: +1 on the (formId, day, stage) row, or
 * insert it at 1. Patches `count` ONLY (the row has no `updatedAt` column).
 */
async function incrementStage(
  ctx: { db: any },
  formId: Id<"forms">,
  day: string,
  stage: FunnelStage,
): Promise<void> {
  const existing = await ctx.db
    .query("form_funnel_stats")
    .withIndex("by_form_day", (q: any) =>
      q.eq("formId", formId).eq("day", day).eq("stage", stage),
    )
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, { count: existing.count + 1 });
  } else {
    await ctx.db.insert("form_funnel_stats", { formId, day, stage, count: 1 });
  }
}

// ─── recordFunnel (internal — system/test use) ──────────────────────────────

/**
 * Increment a `viewed` / `started` funnel counter for today. Internal variant
 * for system + test callers. Silent no-op (never throws) on a missing /
 * non-published form.
 */
export const recordFunnel = internalMutation({
  args: {
    formId: v.id("forms"),
    stage: v.union(v.literal("viewed"), v.literal("started")),
    sessionNonce: v.optional(v.string()),
  },
  handler: async (ctx, { formId, stage }) => {
    const form = await ctx.db.get(formId);
    if (!form || form.status !== "published") return;
    await incrementStage(ctx, formId, utcDay(Date.now()), stage);
  },
});

// ─── recordFunnelPublic (PUBLIC — the renderer call site) ───────────────────

/**
 * PUBLIC funnel-write surface for the Website renderer (no auth, no requireCan).
 * The ONLY externally-reachable funnel write; it can only INCREMENT
 * `viewed`/`started` and cannot read the table. Published-form guard kept.
 *
 * TODO(§9): coarse `started` dedup per `sessionNonce`/day + a per-form per-window
 * write clamp for rate-sanity. v1 ships the published-form guard + silent no-op
 * only; this stays a no-throw path. No new table in v1 (the Spam system owns
 * `form_submission_attempts`).
 */
export const recordFunnelPublic = mutation({
  args: {
    formId: v.id("forms"),
    stage: v.union(v.literal("viewed"), v.literal("started")),
    sessionNonce: v.optional(v.string()),
  },
  handler: async (ctx, { formId, stage }) => {
    const form = await ctx.db.get(formId);
    if (!form || form.status !== "published") return;
    await incrementStage(ctx, formId, utcDay(Date.now()), stage);
  },
});

// ─── onFormSubmitted (internal — completed listener) ────────────────────────

/**
 * `form.submitted` listener: increment the `completed` counter on the
 * submission's day, but ONLY when isComplete:true (a partial save also emits
 * form.submitted with isComplete:false). The dispatcher invokes listeners with
 * `{eventId}`; we read the payload from the event row.
 */
export const onFormSubmitted = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const ev = await ctx.db.get(eventId);
    if (!ev) return;
    let p: any;
    try {
      p = JSON.parse(ev.payload);
    } catch {
      return;
    }
    if (!p || !p.isComplete) return;
    if (!p.formId || typeof p.submittedAt !== "number") return;
    await incrementStage(ctx, p.formId, utcDay(p.submittedAt), "completed");
  },
});

// ─── getFunnel (admin query) ────────────────────────────────────────────────

/**
 * Admin funnel read for a date range. Requires `form.view_analytics`. Returns
 * `{ totals, rates, byDay }` where `byDay` is sparse (the client zero-fills).
 * Rates are divide-by-zero guarded (no NaN when viewed:0).
 */
export const getFunnel = query({
  args: {
    formId: v.id("forms"),
    from: v.string(), // "YYYY-MM-DD" inclusive
    to: v.string(), // "YYYY-MM-DD" inclusive
  },
  handler: async (ctx, { formId, from, to }) => {
    await requireCan(ctx, formCap("form.view_analytics"));

    const rows = await ctx.db
      .query("form_funnel_stats")
      .withIndex("by_form_day", (q: any) =>
        q.eq("formId", formId).gte("day", from).lte("day", to),
      )
      .collect();

    const totals = { viewed: 0, started: 0, completed: 0, abandoned: 0 };
    const byDayMap = new Map<
      string,
      { viewed: number; started: number; completed: number; abandoned: number }
    >();

    for (const row of rows) {
      const stage = row.stage as FunnelStage;
      totals[stage] += row.count;
      let bucket = byDayMap.get(row.day);
      if (!bucket) {
        bucket = { viewed: 0, started: 0, completed: 0, abandoned: 0 };
        byDayMap.set(row.day, bucket);
      }
      bucket[stage] += row.count;
    }

    const safeRate = (num: number, den: number): number =>
      den > 0 ? num / den : 0;

    const rates = {
      startRate: safeRate(totals.started, totals.viewed),
      completionRate: safeRate(totals.completed, totals.started),
      overallRate: safeRate(totals.completed, totals.viewed),
      dropOff: 1 - safeRate(totals.completed, totals.viewed),
      abandoned: safeRate(totals.abandoned, totals.started),
    };

    const byDay = [...byDayMap.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([day, counts]) => ({ day, ...counts }));

    return { totals, rates, byDay };
  },
});

// ─── sweepAbandoned (internal — daily cron) ─────────────────────────────────────

/**
 * Sweep stale `partial` submissions (idle > ABANDON_TTL_MS) into the
 * `abandoned` funnel counter, ONCE each (idempotent via a `meta.abandonCounted`
 * marker). Does NOT delete or re-status the row. Processes up to SWEEP_BATCH per
 * run.
 *
 * `meta` is a JSON STRING (v.optional(v.string())) — parse → set flag →
 * stringify back; never touch `row.meta?.abandonCounted` directly.
 */
export const sweepAbandoned = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - ABANDON_TTL_MS;
    const rows = await ctx.db
      .query("form_submissions")
      .withIndex("by_status", (q: any) => q.eq("status", "partial"))
      .filter((q: any) => q.lt(q.field("submittedAt"), cutoff))
      .take(SWEEP_BATCH);

    let swept = 0;
    for (const row of rows) {
      let meta: Record<string, unknown> = {};
      if (row.meta) {
        try {
          const parsed = JSON.parse(row.meta);
          if (parsed && typeof parsed === "object") {
            meta = parsed as Record<string, unknown>;
          }
        } catch {
          meta = {};
        }
      }
      if (meta.abandonCounted) continue; // already counted — idempotent

      await incrementStage(
        ctx,
        row.formId,
        utcDay(row.submittedAt ?? row.createdAt),
        "abandoned",
      );
      await ctx.db.patch(row._id, {
        meta: JSON.stringify({ ...meta, abandonCounted: true }),
      });
      swept += 1;
    }

    return { swept };
  },
});
