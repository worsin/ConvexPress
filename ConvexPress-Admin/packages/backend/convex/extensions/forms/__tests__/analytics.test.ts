/**
 * Forms Analytics — pure funnel-math + sweep-predicate tests.
 * Run: `bun test convex/extensions/forms/__tests__/analytics.test.ts`
 *
 * Covers the Convex-FREE units the funnel query + abandonment cron are built
 * from:
 *   - utcDay: epoch-ms → "YYYY-MM-DD" UTC bucket; bucket edges + timezone-
 *     independence (midnight UTC boundary; the ms before/after a day flip).
 *   - safeRate: divide-by-zero guard — 0 views → 0 (no NaN/Infinity);
 *     ordinary ratios; non-finite/negative operands → 0.
 *   - aggregateFunnel: per-stage totals + sparse, day-sorted byDay; unknown
 *     stages + corrupt/negative counts ignored (no double-count, no spurious
 *     keys).
 *   - computeRates: start/completion/overall ratios + per-step drop-off;
 *     dropOff is 0 (not 1) when there are zero views.
 *   - isAbandoned / abandonCutoff: a partial OLDER than the cutoff is swept, a
 *     NEWER one is kept, and exactly-at-cutoff is kept (boundary == lt filter).
 *   - parseMeta / alreadyAbandonCounted: idempotency-marker parse tolerates
 *     absent/blank/corrupt/array meta.
 *
 * `.toBe` / `.toEqual` only; errors surfaced via a try/catch flag.
 */

// @ts-ignore Convex backend tsconfig does not include Bun test globals.
import { describe, expect, test } from "bun:test";

import {
  utcDay,
  safeRate,
  aggregateFunnel,
  computeRates,
  isAbandoned,
  abandonCutoff,
  parseMeta,
  alreadyAbandonCounted,
  decidePublicFunnelWrite,
  normalizeSessionNonce,
  publicFunnelEventExpired,
  publicFunnelWindowStart,
  summarizeOperationalHealth,
  type FunnelTotals,
  type FunnelStatRowLike,
} from "../analytics";

// ─── utcDay (bucketing edges) ────────────────────────────────────────────────

describe("utcDay — UTC day bucketing", () => {
  test("the UNIX epoch is 1970-01-01", () => {
    expect(utcDay(0)).toBe("1970-01-01");
  });

  test("a known mid-day timestamp buckets to its UTC date", () => {
    // 2024-03-15T12:34:56.000Z
    expect(utcDay(Date.UTC(2024, 2, 15, 12, 34, 56))).toBe("2024-03-15");
  });

  test("the FIRST ms of a UTC day belongs to that day", () => {
    expect(utcDay(Date.UTC(2024, 2, 15, 0, 0, 0, 0))).toBe("2024-03-15");
  });

  test("the LAST ms of a UTC day belongs to that day (no roll-forward)", () => {
    expect(utcDay(Date.UTC(2024, 2, 15, 23, 59, 59, 999))).toBe("2024-03-15");
  });

  test("one ms later rolls to the next UTC day (boundary flip)", () => {
    const lastMs = Date.UTC(2024, 2, 15, 23, 59, 59, 999);
    expect(utcDay(lastMs)).toBe("2024-03-15");
    expect(utcDay(lastMs + 1)).toBe("2024-03-16");
  });

  test("bucketing is by UTC, NOT local time (afternoon-UTC near a date line)", () => {
    // 13:00 UTC on the 15th is the 15th regardless of the host's offset; a
    // local-time impl west of UTC would wrongly report the 14th here.
    expect(utcDay(Date.UTC(2024, 2, 15, 13, 0, 0))).toBe("2024-03-15");
    // 01:00 UTC on the 15th — a host east of UTC must not roll this to the 16th.
    expect(utcDay(Date.UTC(2024, 2, 15, 1, 0, 0))).toBe("2024-03-15");
  });

  test("a month/year boundary buckets correctly", () => {
    expect(utcDay(Date.UTC(2024, 11, 31, 23, 59, 59, 999))).toBe("2024-12-31");
    expect(utcDay(Date.UTC(2025, 0, 1, 0, 0, 0))).toBe("2025-01-01");
  });
});

// ─── safeRate (divide-by-zero guard) ─────────────────────────────────────────

describe("safeRate — divide-by-zero guard", () => {
  test("ZERO denominator → 0, NOT NaN (the core funnel guarantee)", () => {
    expect(safeRate(0, 0)).toBe(0);
    expect(safeRate(5, 0)).toBe(0);
    expect(Number.isNaN(safeRate(0, 0))).toBe(false);
  });

  test("an ordinary ratio divides", () => {
    expect(safeRate(1, 2)).toBe(0.5);
    expect(safeRate(3, 4)).toBe(0.75);
    expect(safeRate(7, 7)).toBe(1);
  });

  test("a zero numerator over a positive denominator → 0", () => {
    expect(safeRate(0, 10)).toBe(0);
  });

  test("a NEGATIVE denominator → 0 (corrupt data never yields a negative rate)", () => {
    expect(safeRate(5, -1)).toBe(0);
  });

  test("non-finite operands → 0 (never NaN/Infinity leaks out)", () => {
    expect(safeRate(Infinity, 2)).toBe(0);
    expect(safeRate(2, Infinity)).toBe(0);
    expect(safeRate(NaN, 2)).toBe(0);
    expect(safeRate(2, NaN)).toBe(0);
  });
});

// ─── aggregateFunnel (totals + byDay) ────────────────────────────────────────

describe("aggregateFunnel — totals + byDay aggregation", () => {
  test("empty rows → all-zero totals, empty byDay", () => {
    const { totals, byDay } = aggregateFunnel([]);
    expect(totals).toEqual({
      viewed: 0,
      started: 0,
      completed: 0,
      abandoned: 0,
    });
    expect(byDay).toEqual([]);
  });

  test("totals SUM each stage across every day (no double-count, no cross-stage bleed)", () => {
    const rows: FunnelStatRowLike[] = [
      { day: "2024-03-01", stage: "viewed", count: 10 },
      { day: "2024-03-01", stage: "started", count: 4 },
      { day: "2024-03-02", stage: "viewed", count: 5 },
      { day: "2024-03-02", stage: "completed", count: 2 },
      { day: "2024-03-02", stage: "abandoned", count: 1 },
    ];
    const { totals } = aggregateFunnel(rows);
    expect(totals).toEqual({
      viewed: 15,
      started: 4,
      completed: 2,
      abandoned: 1,
    });
  });

  test("two rows for the SAME (day, stage) accumulate into one bucket", () => {
    const rows: FunnelStatRowLike[] = [
      { day: "2024-03-01", stage: "viewed", count: 3 },
      { day: "2024-03-01", stage: "viewed", count: 7 },
    ];
    const { totals, byDay } = aggregateFunnel(rows);
    expect(totals.viewed).toBe(10);
    expect(byDay.length).toBe(1);
    expect(byDay[0]).toEqual({
      day: "2024-03-01",
      viewed: 10,
      started: 0,
      completed: 0,
      abandoned: 0,
    });
  });

  test("byDay is SPARSE (only days present) and SORTED ascending", () => {
    const rows: FunnelStatRowLike[] = [
      { day: "2024-03-03", stage: "viewed", count: 1 },
      { day: "2024-03-01", stage: "viewed", count: 1 },
      { day: "2024-03-02", stage: "viewed", count: 1 },
    ];
    const { byDay } = aggregateFunnel(rows);
    expect(byDay.map((d) => d.day)).toEqual([
      "2024-03-01",
      "2024-03-02",
      "2024-03-03",
    ]);
  });

  test("an UNKNOWN stage is ignored (no spurious key, no sum pollution)", () => {
    const rows = [
      { day: "2024-03-01", stage: "viewed", count: 5 },
      { day: "2024-03-01", stage: "bogus", count: 99 },
    ] as FunnelStatRowLike[];
    const { totals, byDay } = aggregateFunnel(rows);
    expect(totals).toEqual({
      viewed: 5,
      started: 0,
      completed: 0,
      abandoned: 0,
    });
    // No "bogus" key leaked onto the bucket.
    expect(byDay[0]).toEqual({
      day: "2024-03-01",
      viewed: 5,
      started: 0,
      completed: 0,
      abandoned: 0,
    });
  });

  test("NEGATIVE / NaN / Infinity / fractional counts are clamped (never corrupt a total)", () => {
    const rows = [
      { day: "2024-03-01", stage: "viewed", count: -5 },
      { day: "2024-03-01", stage: "viewed", count: NaN },
      { day: "2024-03-01", stage: "viewed", count: Infinity },
      { day: "2024-03-01", stage: "viewed", count: 2.9 }, // floored → 2
      { day: "2024-03-01", stage: "viewed", count: 3 },
    ] as FunnelStatRowLike[];
    const { totals } = aggregateFunnel(rows);
    // -5,NaN,Infinity → 0; 2.9 → 2; 3 → 3  ⇒  5
    expect(totals.viewed).toBe(5);
  });

  test("a zero-count row creates NO day bucket", () => {
    const rows: FunnelStatRowLike[] = [
      { day: "2024-03-01", stage: "viewed", count: 0 },
    ];
    const { byDay } = aggregateFunnel(rows);
    expect(byDay).toEqual([]);
  });

  test("byDay buckets do not share a reference (mutating one never bleeds)", () => {
    const rows: FunnelStatRowLike[] = [
      { day: "2024-03-01", stage: "viewed", count: 1 },
      { day: "2024-03-02", stage: "started", count: 1 },
    ];
    const { byDay } = aggregateFunnel(rows);
    expect(byDay[0]!.started).toBe(0);
    expect(byDay[1]!.viewed).toBe(0);
  });
});

// ─── computeRates (conversion + drop-off) ────────────────────────────────────

const totalsOf = (t: Partial<FunnelTotals>): FunnelTotals => ({
  viewed: 0,
  started: 0,
  completed: 0,
  abandoned: 0,
  ...t,
});

describe("computeRates — conversion + drop-off math", () => {
  test("ZERO views → every rate 0 AND dropOff 0 (no traffic ≠ 100% drop-off)", () => {
    const rates = computeRates(totalsOf({}));
    expect(rates.startRate).toBe(0);
    expect(rates.completionRate).toBe(0);
    expect(rates.overallRate).toBe(0);
    // The bug fix: prior `1 - safeRate(0,0)` = 1; correct is 0.
    expect(rates.dropOff).toBe(0);
    expect(rates.abandoned).toBe(0);
    expect(Number.isNaN(rates.dropOff)).toBe(false);
  });

  test("a full funnel computes each ratio", () => {
    const rates = computeRates(
      totalsOf({ viewed: 100, started: 50, completed: 25, abandoned: 10 }),
    );
    expect(rates.startRate).toBe(0.5); // 50/100
    expect(rates.completionRate).toBe(0.5); // 25/50
    expect(rates.overallRate).toBe(0.25); // 25/100
    expect(rates.dropOff).toBe(0.75); // 1 - 25/100
    expect(rates.abandoned).toBe(0.2); // 10/50
  });

  test("100% completion → dropOff 0", () => {
    const rates = computeRates(
      totalsOf({ viewed: 10, started: 10, completed: 10 }),
    );
    expect(rates.overallRate).toBe(1);
    expect(rates.dropOff).toBe(0);
  });

  test("0% completion with real views → dropOff 1 (genuine total drop-off)", () => {
    const rates = computeRates(
      totalsOf({ viewed: 10, started: 4, completed: 0 }),
    );
    expect(rates.overallRate).toBe(0);
    expect(rates.dropOff).toBe(1);
  });

  test("views but ZERO starts → completionRate 0 (no divide-by-zero on started)", () => {
    const rates = computeRates(totalsOf({ viewed: 8, started: 0 }));
    expect(rates.startRate).toBe(0);
    expect(rates.completionRate).toBe(0);
    expect(Number.isNaN(rates.completionRate)).toBe(false);
  });

  test("abandoned rate is per-START and guards zero starts", () => {
    expect(computeRates(totalsOf({ started: 8, abandoned: 2 })).abandoned).toBe(
      0.25,
    );
    expect(
      computeRates(totalsOf({ started: 0, abandoned: 5 })).abandoned,
    ).toBe(0);
  });

  test("corrupt totals are clamped before the math (no NaN escapes)", () => {
    const rates = computeRates(
      totalsOf({ viewed: NaN, started: -3, completed: Infinity }),
    );
    expect(rates.startRate).toBe(0);
    expect(rates.completionRate).toBe(0);
    expect(rates.overallRate).toBe(0);
    expect(rates.dropOff).toBe(0);
  });
});

// ─── isAbandoned / abandonCutoff (sweep boundary) ────────────────────────────

describe("abandonCutoff", () => {
  test("cutoff is now minus the TTL", () => {
    const NOW = 1_000_000_000_000;
    const TTL = 24 * 60 * 60 * 1000;
    expect(abandonCutoff(NOW, TTL)).toBe(NOW - TTL);
  });

  test("defaults to the 24h TTL when not supplied", () => {
    const NOW = 1_000_000_000_000;
    expect(abandonCutoff(NOW)).toBe(NOW - 24 * 60 * 60 * 1000);
  });
});

describe("isAbandoned — sweep cutoff boundary", () => {
  const CUTOFF = 1_000_000_000_000;

  test("a partial OLDER than the cutoff IS abandoned (swept)", () => {
    expect(isAbandoned(CUTOFF - 1, CUTOFF)).toBe(true);
    expect(isAbandoned(CUTOFF - 60_000, CUTOFF)).toBe(true);
  });

  test("a partial NEWER than the cutoff is KEPT", () => {
    expect(isAbandoned(CUTOFF + 1, CUTOFF)).toBe(false);
    expect(isAbandoned(CUTOFF + 60_000, CUTOFF)).toBe(false);
  });

  test("EXACTLY at the cutoff is KEPT (boundary matches the `lt` index filter)", () => {
    expect(isAbandoned(CUTOFF, CUTOFF)).toBe(false);
  });

  test("a missing / non-finite reference timestamp is NOT abandoned (conservative)", () => {
    expect(isAbandoned(undefined, CUTOFF)).toBe(false);
    expect(isAbandoned(NaN, CUTOFF)).toBe(false);
    expect(isAbandoned(Infinity, CUTOFF)).toBe(false);
  });

  test("end-to-end with a real now/TTL: a 25h-old partial is swept, a 23h-old one is kept", () => {
    const NOW = 1_700_000_000_000;
    const cutoff = abandonCutoff(NOW); // 24h TTL
    const h = 60 * 60 * 1000;
    expect(isAbandoned(NOW - 25 * h, cutoff)).toBe(true);
    expect(isAbandoned(NOW - 23 * h, cutoff)).toBe(false);
    // exactly 24h old == cutoff → kept
    expect(isAbandoned(NOW - 24 * h, cutoff)).toBe(false);
  });
});

// ─── parseMeta / alreadyAbandonCounted (idempotency) ─────────────────────────

describe("parseMeta — tolerant meta parse", () => {
  test("absent / blank meta → {}", () => {
    expect(parseMeta(undefined)).toEqual({});
    expect(parseMeta(null)).toEqual({});
    expect(parseMeta("")).toEqual({});
  });

  test("a valid object round-trips", () => {
    expect(parseMeta('{"abandonCounted":true,"x":1}')).toEqual({
      abandonCounted: true,
      x: 1,
    });
  });

  test("corrupt JSON → {} (never throws)", () => {
    let threw = false;
    let out: Record<string, unknown> = { sentinel: 1 };
    try {
      out = parseMeta("{not json");
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(out).toEqual({});
  });

  test("a JSON array (non-object) → {} (not spread as a bag)", () => {
    expect(parseMeta("[1,2,3]")).toEqual({});
  });

  test("a JSON scalar → {}", () => {
    expect(parseMeta("42")).toEqual({});
    expect(parseMeta("true")).toEqual({});
    expect(parseMeta('"hi"')).toEqual({});
  });
});

// ─── Public funnel write guard (abuse protection) ────────────────────────────

describe("public funnel write guard", () => {
  test("publicFunnelWindowStart floors timestamps to a fixed window", () => {
    expect(publicFunnelWindowStart(1_234, 1_000)).toBe(1_000);
    expect(publicFunnelWindowStart(59_999, 60_000)).toBe(0);
    expect(publicFunnelWindowStart(60_000, 60_000)).toBe(60_000);
  });

  test("normalizeSessionNonce trims, drops blanks, and bounds length", () => {
    expect(normalizeSessionNonce(undefined)).toBe(undefined);
    expect(normalizeSessionNonce("   ")).toBe(undefined);
    expect(normalizeSessionNonce("  abc  ")).toBe("abc");
    expect(normalizeSessionNonce("x".repeat(200))).toBe("x".repeat(128));
  });

  test("started writes dedupe by session nonce before incrementing", () => {
    expect(
      decidePublicFunnelWrite({
        stage: "started",
        hasSessionNonce: true,
        duplicateSession: true,
        acceptedInWindow: 0,
      }),
    ).toEqual({ record: false, reason: "duplicate_started" });
  });

  test("missing started nonce still records unless the window is clamped", () => {
    expect(
      decidePublicFunnelWrite({
        stage: "started",
        hasSessionNonce: false,
        duplicateSession: true,
        acceptedInWindow: 0,
      }),
    ).toEqual({ record: true, reason: "recorded" });
  });

  test("per-form/stage public window clamp blocks once the limit is reached", () => {
    expect(
      decidePublicFunnelWrite({
        stage: "viewed",
        hasSessionNonce: false,
        duplicateSession: false,
        acceptedInWindow: 239,
        windowLimit: 240,
      }),
    ).toEqual({ record: true, reason: "recorded" });
    expect(
      decidePublicFunnelWrite({
        stage: "viewed",
        hasSessionNonce: false,
        duplicateSession: false,
        acceptedInWindow: 240,
        windowLimit: 240,
      }),
    ).toEqual({ record: false, reason: "window_clamped" });
  });

  test("publicFunnelEventExpired applies the short retention boundary", () => {
    const now = 1_000_000;
    const retention = 10_000;
    expect(publicFunnelEventExpired(now - retention - 1, now, retention)).toBe(
      true,
    );
    expect(publicFunnelEventExpired(now - retention, now, retention)).toBe(false);
    expect(publicFunnelEventExpired(undefined, now, retention)).toBe(false);
  });
});

describe("summarizeOperationalHealth — bounded ops dashboard math", () => {
  const NOW = 1_700_000_000_000;
  const HOUR = 60 * 60 * 1000;

  test("empty samples produce a calm all-zero snapshot", () => {
    expect(
      summarizeOperationalHealth({
        checkedAt: NOW,
        windowMs: HOUR,
        staleCutoff: NOW - 24 * HOUR,
        actionRuns: [],
        attempts: [],
        publicEvents: [],
        partialDrafts: [],
      }),
    ).toEqual({
      checkedAt: NOW,
      windowMs: HOUR,
      actionRuns: {
        failed: 0,
        pending: 0,
        awaitingPayment: 0,
        latestFailureAt: undefined,
      },
      submissionAttempts: {
        buckets: 0,
        attempts: 0,
        blocked: 0,
        maxBucketCount: 0,
      },
      publicFunnel: {
        acceptedEvents: 0,
        viewed: 0,
        started: 0,
      },
      staleDrafts: {
        count: 0,
      },
      needsAttention: false,
    });
  });

  test("counts action status samples and tracks the latest failure timestamp", () => {
    const health = summarizeOperationalHealth({
      checkedAt: NOW,
      windowMs: HOUR,
      staleCutoff: NOW - 24 * HOUR,
      actionRuns: [
        { status: "failed", createdAt: NOW - 10, updatedAt: NOW - 5 },
        { status: "failed", createdAt: NOW - 50, updatedAt: NOW - 40 },
        { status: "pending", createdAt: NOW - 30, updatedAt: NOW - 20 },
        {
          status: "awaiting_payment",
          createdAt: NOW - 15,
          updatedAt: NOW - 15,
        },
      ],
      attempts: [],
      publicEvents: [],
      partialDrafts: [],
    });

    expect(health.actionRuns.failed).toBe(2);
    expect(health.actionRuns.pending).toBe(1);
    expect(health.actionRuns.awaitingPayment).toBe(1);
    expect(health.actionRuns.latestFailureAt).toBe(NOW - 5);
    expect(health.needsAttention).toBe(true);
  });

  test("sums submission pressure and accepted public funnel events", () => {
    const health = summarizeOperationalHealth({
      checkedAt: NOW,
      windowMs: HOUR,
      staleCutoff: NOW - 24 * HOUR,
      actionRuns: [],
      attempts: [
        { count: 4, blockedCount: 1 },
        { count: 8, blockedCount: 3 },
        { count: -99, blockedCount: -1 },
      ],
      publicEvents: [
        { stage: "viewed" },
        { stage: "viewed" },
        { stage: "started" },
      ],
      partialDrafts: [],
    });

    expect(health.submissionAttempts.buckets).toBe(3);
    expect(health.submissionAttempts.attempts).toBe(12);
    expect(health.submissionAttempts.blocked).toBe(4);
    expect(health.submissionAttempts.maxBucketCount).toBe(8);
    expect(health.publicFunnel).toEqual({
      acceptedEvents: 3,
      viewed: 2,
      started: 1,
    });
    expect(health.needsAttention).toBe(true);
  });

  test("flags only drafts strictly older than the abandonment cutoff", () => {
    const cutoff = NOW - 24 * HOUR;
    const health = summarizeOperationalHealth({
      checkedAt: NOW,
      windowMs: HOUR,
      staleCutoff: cutoff,
      actionRuns: [],
      attempts: [],
      publicEvents: [],
      partialDrafts: [
        { submittedAt: cutoff - 1 },
        { submittedAt: cutoff },
        { submittedAt: cutoff + 1 },
        {},
      ],
    });

    expect(health.staleDrafts.count).toBe(1);
    expect(health.needsAttention).toBe(true);
  });
});

describe("alreadyAbandonCounted — idempotency marker", () => {
  test("true only when the flag is strictly true", () => {
    expect(alreadyAbandonCounted({ abandonCounted: true })).toBe(true);
  });

  test("false when absent or falsy", () => {
    expect(alreadyAbandonCounted({})).toBe(false);
    expect(alreadyAbandonCounted({ abandonCounted: false })).toBe(false);
    // A non-boolean truthy must NOT silently count as "counted".
    expect(alreadyAbandonCounted({ abandonCounted: 1 as unknown as boolean })).toBe(
      false,
    );
  });

  test("a freshly parsed empty meta is not yet counted (sweeps on first pass)", () => {
    expect(alreadyAbandonCounted(parseMeta(undefined))).toBe(false);
  });

  test("a previously swept row is skipped on the next pass (idempotent)", () => {
    const meta = parseMeta(JSON.stringify({ abandonCounted: true }));
    expect(alreadyAbandonCounted(meta)).toBe(true);
  });
});
