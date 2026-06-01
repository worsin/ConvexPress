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
 *     first interaction. Public writes are deduped/clamped via
 *     `form_funnel_public_events` before the aggregate counter increments.
 *   - completed → the `form.submitted` event listener (onFormSubmitted), only
 *     when isComplete:true. The submit mutation is UNCHANGED (already emits it).
 *   - abandoned → the daily sweep over stale `partial` submissions.
 *
 * Capability: form.view_analytics. `formCap(...)` keeps the Forms authorization
 * surface explicit at the requireCan call site.
 */

import { internalMutation, mutation, query } from "../../_generated/server";
import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { requireCan } from "../../helpers/permissions";
import { isPluginEnabled, requirePluginEnabled } from "../../helpers/plugins";
import type { Capability } from "../../types/capabilities";

// ─── Constants ──────────────────────────────────────────────────────────────

/** A partial draft is considered "abandoned" after this idle horizon. */
const ABANDON_TTL_MS = 24 * 60 * 60 * 1000;
/** Max rows the sweep processes per invocation (stay within mutation limits). */
const SWEEP_BATCH = 100;
/** Bounded operational health samples; dashboards must never collect unbounded tables. */
const ACTION_HEALTH_LIMIT = 50;
const ATTEMPT_HEALTH_LIMIT = 200;
const PUBLIC_EVENT_HEALTH_LIMIT = 500;
const PARTIAL_DRAFT_HEALTH_LIMIT = 200;
const OPERATIONAL_HEALTH_WINDOW_MS = 60 * 60 * 1000;
/** Public funnel write clamp: accepted writes per form+stage per minute. */
const PUBLIC_FUNNEL_WINDOW_MS = 60 * 1000;
const PUBLIC_FUNNEL_WINDOW_LIMIT = 240;
const PUBLIC_FUNNEL_EVENT_RETENTION_MS = 48 * 60 * 60 * 1000;
const PUBLIC_FUNNEL_SWEEP_BATCH = 500;
const SESSION_NONCE_MAX_LENGTH = 128;

type FunnelStage = "viewed" | "started" | "completed" | "abandoned";

// ─── Module-local helpers ───────────────────────────────────────────────────

/** Local wrapper for Forms capability strings. */
function formCap(cap: string): Capability {
  return cap as Capability;
}

/** UTC day bucket "YYYY-MM-DD" for an epoch-ms timestamp. */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// ─── Pure cores (Convex-free; unit-tested) ──────────────────────────────────

/** Per-stage counter tallies for a form over some window. */
export interface FunnelTotals {
  viewed: number;
  started: number;
  completed: number;
  abandoned: number;
}

/** Conversion + drop-off rates derived from {@link FunnelTotals}. */
export interface FunnelRates {
  startRate: number;
  completionRate: number;
  overallRate: number;
  dropOff: number;
  abandoned: number;
}

/** A single `form_funnel_stats` row, narrowed to the fields aggregation reads. */
export interface FunnelStatRowLike {
  day: string;
  stage: string;
  count: number;
}

const FUNNEL_STAGES: readonly FunnelStage[] = [
  "viewed",
  "started",
  "completed",
  "abandoned",
] as const;

/** A fresh, all-zero totals object. */
function zeroTotals(): FunnelTotals {
  return { viewed: 0, started: 0, completed: 0, abandoned: 0 };
}

/**
 * Coerce a stored counter to a safe, non-negative integer. Corrupt rows
 * (NaN/Infinity/negative/fractional) must not poison a sum or open a
 * divide-by-zero-adjacent path downstream — clamp to 0 and floor.
 */
function safeCount(n: number): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/**
 * Divide-by-zero-guarded ratio. Returns 0 (never NaN/Infinity) when the
 * denominator is non-positive or either operand is non-finite.
 */
export function safeRate(num: number, den: number): number {
  if (
    !Number.isFinite(num) ||
    !Number.isFinite(den) ||
    den <= 0 ||
    num <= 0
  ) {
    return 0;
  }
  return num / den;
}

/**
 * Aggregate raw `form_funnel_stats` rows into `{ totals, byDay }`. Pure: no
 * DB/ctx. `totals` sums each stage across the whole window; `byDay` is a sparse
 * per-day breakdown (only days with at least one row appear), sorted ascending
 * by day string (lexicographic == chronological for "YYYY-MM-DD"). Unknown
 * stages and corrupt counts are ignored (never create spurious keys/sums).
 */
export function aggregateFunnel(rows: FunnelStatRowLike[]): {
  totals: FunnelTotals;
  byDay: Array<{ day: string } & FunnelTotals>;
} {
  const totals = zeroTotals();
  const byDayMap = new Map<string, FunnelTotals>();

  for (const row of rows) {
    const stage = row.stage as FunnelStage;
    if (!FUNNEL_STAGES.includes(stage)) continue; // ignore unknown stages
    const count = safeCount(row.count);
    if (count === 0) continue;

    totals[stage] += count;
    let bucket = byDayMap.get(row.day);
    if (!bucket) {
      bucket = zeroTotals();
      byDayMap.set(row.day, bucket);
    }
    bucket[stage] += count;
  }

  const byDay = [...byDayMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, counts]) => ({ day, ...counts }));

  return { totals, byDay };
}

/**
 * Derive conversion/drop-off rates from stage totals. Every ratio is
 * divide-by-zero guarded (0, never NaN/Infinity).
 *
 * `dropOff` is the fraction of *viewers* who did not complete. With zero views
 * there is no funnel to drop out of, so it is 0 — NOT `1 - 0 = 1`. (Reporting a
 * 100% drop-off for a form with no traffic is misleading and was the prior
 * behaviour of `1 - safeRate(completed, viewed)`.)
 */
export function computeRates(totals: FunnelTotals): FunnelRates {
  const viewed = safeCount(totals.viewed);
  const started = safeCount(totals.started);
  const completed = safeCount(totals.completed);
  const abandoned = safeCount(totals.abandoned);

  return {
    startRate: safeRate(started, viewed),
    completionRate: safeRate(completed, started),
    overallRate: safeRate(completed, viewed),
    dropOff: viewed > 0 ? 1 - safeRate(completed, viewed) : 0,
    abandoned: safeRate(abandoned, started),
  };
}

/**
 * Sweep predicate: is a `partial` submission stale enough to count as abandoned?
 * A submission is abandoned when its reference timestamp is STRICTLY OLDER than
 * the cutoff (idle horizon boundary). Exactly-at-cutoff is kept (not swept),
 * matching the `lt(submittedAt, cutoff)` index filter. Missing/non-finite
 * timestamps are treated as NOT abandoned (conservative — never sweep on bad
 * data).
 */
export function isAbandoned(referenceTs: number | undefined, cutoff: number): boolean {
  if (typeof referenceTs !== "number" || !Number.isFinite(referenceTs)) {
    return false;
  }
  return referenceTs < cutoff;
}

/** The cutoff timestamp: rows whose reference ts is `< cutoff` are abandoned. */
export function abandonCutoff(now: number, ttlMs: number = ABANDON_TTL_MS): number {
  return now - ttlMs;
}

/**
 * Parse a `form_submissions.meta` JSON string into an object, tolerating
 * absent/blank/corrupt values (→ `{}`). Pure mirror of the sweep's inline parse.
 */
export function parseMeta(meta: string | undefined | null): Record<string, unknown> {
  if (!meta) return {};
  try {
    const parsed = JSON.parse(meta);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* fall through */
  }
  return {};
}

/** Has this submission already been counted as abandoned (idempotency marker)? */
export function alreadyAbandonCounted(meta: Record<string, unknown>): boolean {
  return meta.abandonCounted === true;
}

/** Fixed-window start for the public analytics write clamp. */
export function publicFunnelWindowStart(
  now: number,
  windowMs: number = PUBLIC_FUNNEL_WINDOW_MS,
): number {
  return Math.floor(now / windowMs) * windowMs;
}

/** Normalize a client-generated analytics nonce into a bounded, non-empty key. */
export function normalizeSessionNonce(
  nonce: string | undefined,
): string | undefined {
  const trimmed = nonce?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, SESSION_NONCE_MAX_LENGTH);
}

export type PublicFunnelDecisionReason =
  | "recorded"
  | "duplicate_started"
  | "window_clamped";

/**
 * Decide whether a public funnel write should increment the aggregate counter.
 * `started` is deduped by sessionNonce/day when a nonce is present; every stage
 * is protected by a per-form/stage fixed-window clamp.
 */
export function decidePublicFunnelWrite(args: {
  stage: "viewed" | "started";
  hasSessionNonce: boolean;
  duplicateSession: boolean;
  acceptedInWindow: number;
  windowLimit?: number;
}): { record: boolean; reason: PublicFunnelDecisionReason } {
  if (
    args.stage === "started" &&
    args.hasSessionNonce &&
    args.duplicateSession
  ) {
    return { record: false, reason: "duplicate_started" };
  }
  const limit = args.windowLimit ?? PUBLIC_FUNNEL_WINDOW_LIMIT;
  if (args.acceptedInWindow >= limit) {
    return { record: false, reason: "window_clamped" };
  }
  return { record: true, reason: "recorded" };
}

/** Has a public funnel guard event aged past the short retention horizon? */
export function publicFunnelEventExpired(
  createdAt: number | undefined,
  now: number,
  retentionMs: number = PUBLIC_FUNNEL_EVENT_RETENTION_MS,
): boolean {
  if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) {
    return false;
  }
  return createdAt < now - retentionMs;
}

type ActionRunStatus = "failed" | "pending" | "awaiting_payment";

export interface OperationalActionRunLike {
  status: ActionRunStatus;
  createdAt: number;
  updatedAt: number;
}

export interface OperationalAttemptBucketLike {
  count: number;
  blockedCount?: number;
}

export interface OperationalPublicFunnelEventLike {
  stage: "viewed" | "started";
}

export interface OperationalDraftLike {
  submittedAt?: number;
}

export interface FormsOperationalHealth {
  checkedAt: number;
  windowMs: number;
  actionRuns: {
    failed: number;
    pending: number;
    awaitingPayment: number;
    latestFailureAt?: number;
  };
  submissionAttempts: {
    buckets: number;
    attempts: number;
    blocked: number;
    maxBucketCount: number;
  };
  publicFunnel: {
    acceptedEvents: number;
    viewed: number;
    started: number;
  };
  staleDrafts: {
    count: number;
  };
  needsAttention: boolean;
}

/**
 * Collapse bounded operational samples into one dashboard payload. This is
 * intentionally approximate/recent, not a full historical report: production
 * observability reads must stay indexed and bounded.
 */
export function summarizeOperationalHealth(args: {
  checkedAt: number;
  windowMs: number;
  staleCutoff: number;
  actionRuns: OperationalActionRunLike[];
  attempts: OperationalAttemptBucketLike[];
  publicEvents: OperationalPublicFunnelEventLike[];
  partialDrafts: OperationalDraftLike[];
}): FormsOperationalHealth {
  let failed = 0;
  let pending = 0;
  let awaitingPayment = 0;
  let latestFailureAt: number | undefined;

  for (const run of args.actionRuns) {
    if (run.status === "failed") {
      failed += 1;
      const at = Number.isFinite(run.updatedAt) ? run.updatedAt : run.createdAt;
      latestFailureAt =
        latestFailureAt === undefined ? at : Math.max(latestFailureAt, at);
    } else if (run.status === "pending") {
      pending += 1;
    } else if (run.status === "awaiting_payment") {
      awaitingPayment += 1;
    }
  }

  let attempts = 0;
  let blocked = 0;
  let maxBucketCount = 0;
  for (const bucket of args.attempts) {
    const count = Math.max(0, Math.floor(bucket.count || 0));
    const blockedCount = Math.max(0, Math.floor(bucket.blockedCount || 0));
    attempts += count;
    blocked += blockedCount;
    maxBucketCount = Math.max(maxBucketCount, count);
  }

  let viewed = 0;
  let started = 0;
  for (const event of args.publicEvents) {
    if (event.stage === "viewed") viewed += 1;
    if (event.stage === "started") started += 1;
  }

  const staleDraftCount = args.partialDrafts.filter((draft) =>
    isAbandoned(draft.submittedAt, args.staleCutoff),
  ).length;

  return {
    checkedAt: args.checkedAt,
    windowMs: args.windowMs,
    actionRuns: {
      failed,
      pending,
      awaitingPayment,
      latestFailureAt,
    },
    submissionAttempts: {
      buckets: args.attempts.length,
      attempts,
      blocked,
      maxBucketCount,
    },
    publicFunnel: {
      acceptedEvents: viewed + started,
      viewed,
      started,
    },
    staleDrafts: {
      count: staleDraftCount,
    },
    needsAttention: failed > 0 || blocked > 0 || staleDraftCount > 0,
  };
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
    if (!(await isPluginEnabled(ctx, "forms"))) return;

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
 * Abuse protection is intentionally silent: duplicate/clamped writes return a
 * small status object but never throw, so analytics cannot break a public form.
 */
export const recordFunnelPublic = mutation({
  args: {
    formId: v.id("forms"),
    stage: v.union(v.literal("viewed"), v.literal("started")),
    sessionNonce: v.optional(v.string()),
  },
  handler: async (ctx, { formId, stage, sessionNonce }) => {
    if (!(await isPluginEnabled(ctx, "forms"))) {
      return { recorded: false, reason: "disabled" as const };
    }

    const form = await ctx.db.get(formId);
    if (!form || form.status !== "published") {
      return { recorded: false, reason: "unpublished" as const };
    }

    const now = Date.now();
    const day = utcDay(now);
    const normalizedNonce = normalizeSessionNonce(sessionNonce);
    const windowStart = publicFunnelWindowStart(now);

    let duplicateSession = false;
    if (stage === "started" && normalizedNonce) {
      const prior = await ctx.db
        .query("form_funnel_public_events")
        .withIndex("by_form_stage_day_nonce", (q: any) =>
          q
            .eq("formId", formId)
            .eq("stage", stage)
            .eq("day", day)
            .eq("sessionNonce", normalizedNonce),
        )
        .first();
      duplicateSession = !!prior;
    }

    const acceptedInWindow = (
      await ctx.db
        .query("form_funnel_public_events")
        .withIndex("by_form_stage_window", (q: any) =>
          q.eq("formId", formId).eq("stage", stage).eq("windowStart", windowStart),
        )
        .take(PUBLIC_FUNNEL_WINDOW_LIMIT)
    ).length;

    const decision = decidePublicFunnelWrite({
      stage,
      hasSessionNonce: !!normalizedNonce,
      duplicateSession,
      acceptedInWindow,
    });
    if (!decision.record) {
      return { recorded: false, reason: decision.reason };
    }

    await ctx.db.insert("form_funnel_public_events", {
      formId,
      day,
      stage,
      sessionNonce: normalizedNonce,
      windowStart,
      createdAt: now,
    });
    await incrementStage(ctx, formId, day, stage);
    return { recorded: true, reason: decision.reason };
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
    if (!(await isPluginEnabled(ctx, "forms"))) return;

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
    await requirePluginEnabled(ctx, "forms");

    const rows = await ctx.db
      .query("form_funnel_stats")
      .withIndex("by_form_day", (q: any) =>
        q.eq("formId", formId).gte("day", from).lte("day", to),
      )
      .collect();

    const { totals, byDay } = aggregateFunnel(rows as FunnelStatRowLike[]);
    const rates = computeRates(totals);

    return { totals, rates, byDay };
  },
});

/**
 * Bounded operational snapshot for the form analytics page. This is the
 * paid-tester "is anything on fire?" surface: recent action failures/retries,
 * rate-limit pressure, public funnel write volume, and stale drafts due for the
 * abandonment sweep.
 */
export const getOperationalHealth = query({
  args: { formId: v.id("forms") },
  handler: async (ctx, { formId }) => {
    await requireCan(ctx, formCap("form.view_analytics"));
    await requirePluginEnabled(ctx, "forms");

    const now = Date.now();
    const windowStart = now - OPERATIONAL_HEALTH_WINDOW_MS;
    const staleCutoff = abandonCutoff(now);

    const [
      failedRuns,
      pendingRuns,
      awaitingPaymentRuns,
      attempts,
      viewedEvents,
      startedEvents,
      stalePartials,
    ] = await Promise.all([
      ctx.db
        .query("form_action_runs")
        .withIndex("by_form_status", (q: any) =>
          q.eq("formId", formId).eq("status", "failed"),
        )
        .order("desc")
        .take(ACTION_HEALTH_LIMIT),
      ctx.db
        .query("form_action_runs")
        .withIndex("by_form_status", (q: any) =>
          q.eq("formId", formId).eq("status", "pending"),
        )
        .order("desc")
        .take(ACTION_HEALTH_LIMIT),
      ctx.db
        .query("form_action_runs")
        .withIndex("by_form_status", (q: any) =>
          q.eq("formId", formId).eq("status", "awaiting_payment"),
        )
        .order("desc")
        .take(ACTION_HEALTH_LIMIT),
      ctx.db
        .query("form_submission_attempts")
        .withIndex("by_form_window", (q: any) =>
          q.eq("formId", formId).gte("windowStart", windowStart),
        )
        .take(ATTEMPT_HEALTH_LIMIT),
      ctx.db
        .query("form_funnel_public_events")
        .withIndex("by_form_stage_window", (q: any) =>
          q.eq("formId", formId).eq("stage", "viewed").gte("windowStart", windowStart),
        )
        .take(PUBLIC_EVENT_HEALTH_LIMIT),
      ctx.db
        .query("form_funnel_public_events")
        .withIndex("by_form_stage_window", (q: any) =>
          q.eq("formId", formId).eq("stage", "started").gte("windowStart", windowStart),
        )
        .take(PUBLIC_EVENT_HEALTH_LIMIT),
      ctx.db
        .query("form_submissions")
        .withIndex("by_form_status", (q: any) =>
          q.eq("formId", formId).eq("status", "partial"),
        )
        .filter((q: any) => q.lt(q.field("submittedAt"), staleCutoff))
        .take(PARTIAL_DRAFT_HEALTH_LIMIT),
    ]);

    return summarizeOperationalHealth({
      checkedAt: now,
      windowMs: OPERATIONAL_HEALTH_WINDOW_MS,
      staleCutoff,
      actionRuns: [
        ...(failedRuns as OperationalActionRunLike[]),
        ...(pendingRuns as OperationalActionRunLike[]),
        ...(awaitingPaymentRuns as OperationalActionRunLike[]),
      ],
      attempts: attempts as OperationalAttemptBucketLike[],
      publicEvents: [
        ...(viewedEvents as OperationalPublicFunnelEventLike[]),
        ...(startedEvents as OperationalPublicFunnelEventLike[]),
      ],
      partialDrafts: stalePartials as OperationalDraftLike[],
    });
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
    if (!(await isPluginEnabled(ctx, "forms"))) return { swept: 0 };

    const cutoff = abandonCutoff(Date.now());
    const rows = await ctx.db
      .query("form_submissions")
      .withIndex("by_status", (q: any) => q.eq("status", "partial"))
      .filter((q: any) => q.lt(q.field("submittedAt"), cutoff))
      .take(SWEEP_BATCH);

    let swept = 0;
    for (const row of rows) {
      // Re-check the cutoff in-handler so the decision is testable + robust to
      // a row whose submittedAt is absent (the index filter drops it, but the
      // predicate also treats undefined as not-abandoned — belt and braces).
      if (!isAbandoned(row.submittedAt, cutoff)) continue;

      const meta = parseMeta(row.meta);
      if (alreadyAbandonCounted(meta)) continue; // already counted — idempotent

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

// ─── sweepPublicFunnelEvents (internal — short-retention guard rows) ──────────

/**
 * Delete short-retention public funnel guard rows. Aggregate analytics remain in
 * `form_funnel_stats`; these rows only prove dedupe/clamp decisions.
 */
export const sweepPublicFunnelEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - PUBLIC_FUNNEL_EVENT_RETENTION_MS;
    const rows = await ctx.db
      .query("form_funnel_public_events")
      .withIndex("by_createdAt", (q: any) => q.lt("createdAt", cutoff))
      .take(PUBLIC_FUNNEL_SWEEP_BATCH);

    let deleted = 0;
    for (const row of rows) {
      if (!publicFunnelEventExpired(row.createdAt, now)) continue;
      await ctx.db.delete(row._id);
      deleted += 1;
    }
    return { deleted };
  },
});
