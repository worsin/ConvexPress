// @ts-ignore Convex backend tsconfig does not include Bun test globals.
import { describe, expect, test } from "bun:test";

import { aggregateFunnel, summarizeOperationalHealth } from "../analytics";
import { csvRow, selectColumns } from "../export";

describe("Forms load/performance guardrails", () => {
  test("funnel aggregation stays bounded and deterministic for a large sparse window", () => {
    const rows = Array.from({ length: 10_000 }, (_, i) => ({
      day: `2026-05-${String((i % 30) + 1).padStart(2, "0")}`,
      stage: (["viewed", "started", "completed", "abandoned"] as const)[i % 4],
      count: 1,
    }));

    const { totals, byDay } = aggregateFunnel(rows);

    expect(totals).toEqual({
      viewed: 2500,
      started: 2500,
      completed: 2500,
      abandoned: 2500,
    });
    expect(byDay.length).toBe(30);
    expect(byDay[0]!.day).toBe("2026-05-01");
    expect(byDay[29]!.day).toBe("2026-05-30");
  });

  test("CSV export helpers handle a wide form while dropping layout-only fields", () => {
    const defs = Array.from({ length: 1_200 }, (_, i) => ({
      name: `field_${i}`,
      label: `Field ${i}`,
      key: `key_${i}`,
      type: i % 10 === 0 ? "page_break" : "text",
    }));

    const { columns, warnings } = selectColumns(defs);
    const row = csvRow(columns.map((col, i) => (i % 101 === 0 ? "=1+1" : col.name)));

    expect(columns.length).toBe(1080);
    expect(warnings).toEqual([]);
    expect(row.includes("=1+1")).toBe(true);
    expect(row.includes("'=1+1")).toBe(true);
  });

  test("operational health summary accepts bounded production samples without unbounded reads", () => {
    const checkedAt = 1_700_000_000_000;
    const staleCutoff = checkedAt - 24 * 60 * 60 * 1000;

    const health = summarizeOperationalHealth({
      checkedAt,
      windowMs: 60 * 60 * 1000,
      staleCutoff,
      actionRuns: [
        ...Array.from({ length: 50 }, (_, i) => ({
          status: "failed" as const,
          createdAt: checkedAt - i,
          updatedAt: checkedAt - i,
        })),
        ...Array.from({ length: 50 }, (_, i) => ({
          status: "pending" as const,
          createdAt: checkedAt - i,
          updatedAt: checkedAt - i,
        })),
      ],
      attempts: Array.from({ length: 200 }, () => ({
        count: 5,
        blockedCount: 1,
      })),
      publicEvents: [
        ...Array.from({ length: 500 }, () => ({ stage: "viewed" as const })),
        ...Array.from({ length: 500 }, () => ({ stage: "started" as const })),
      ],
      partialDrafts: Array.from({ length: 200 }, (_, i) => ({
        submittedAt: staleCutoff - i - 1,
      })),
    });

    expect(health.actionRuns.failed).toBe(50);
    expect(health.actionRuns.pending).toBe(50);
    expect(health.submissionAttempts.attempts).toBe(1000);
    expect(health.submissionAttempts.blocked).toBe(200);
    expect(health.publicFunnel.acceptedEvents).toBe(1000);
    expect(health.staleDrafts.count).toBe(200);
    expect(health.needsAttention).toBe(true);
  });
});
