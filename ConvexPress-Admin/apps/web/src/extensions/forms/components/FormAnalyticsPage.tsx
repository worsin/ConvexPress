/**
 * Form Analytics — page + co-located subcomponents (Form Analytics & Export
 * System). One file (lean — split later only if it grows).
 *
 * Renders the funnel (viewed → started → completed, plus abandoned) for a UTC
 * date range, between-stage rates, the largest drop-off callout, a daily series
 * (zero-filled client-side), and a CSV export button gated on
 * `form.export_entries`. Base UI + Tailwind v4 only; no `@radix-ui/*`; no
 * hardcoded color literals (CSS vars / theme tokens only).
 */

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import {
  BarChart3,
  Download,
  Eye,
  CheckCircle2,
  MousePointerClick,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { useCan } from "@/hooks/useCan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

interface FunnelTotals {
  viewed: number;
  started: number;
  completed: number;
  abandoned: number;
}
interface FunnelRates {
  startRate: number;
  completionRate: number;
  overallRate: number;
  dropOff: number;
  abandoned: number;
}
interface FunnelDay extends FunnelTotals {
  day: string;
}
interface FunnelResult {
  totals: FunnelTotals;
  rates: FunnelRates;
  byDay: FunnelDay[];
}

/** UTC "YYYY-MM-DD" for an epoch-ms timestamp. */
function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Default range: the last 30 UTC days (inclusive). */
function defaultRange(): { from: string; to: string } {
  const now = Date.now();
  return { from: utcDay(now - 29 * 24 * 60 * 60 * 1000), to: utcDay(now) };
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

// ─── Page ───────────────────────────────────────────────────────────────────

export function FormAnalyticsPage({ formId }: { formId: Id<"forms"> }) {
  const [range, setRange] = useState(defaultRange);

  const funnel = useQuery(api.extensions.forms.analytics.getFunnel, {
    formId,
    from: range.from,
    to: range.to,
  }) as FunnelResult | undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold text-foreground">Form Analytics</h1>
        </div>
        <div className="flex items-center gap-3">
          <DateRangePicker range={range} onChange={setRange} />
          <ExportButton formId={formId} />
        </div>
      </div>

      {funnel === undefined ? (
        <AnalyticsSkeleton />
      ) : funnel.totals.viewed === 0 && funnel.totals.completed === 0 ? (
        <EmptyAnalytics formId={formId} />
      ) : (
        <>
          <FunnelSummaryCards totals={funnel.totals} rates={funnel.rates} />
          <FunnelChart totals={funnel.totals} byDay={funnel.byDay} range={range} />
          <DropOffCallout totals={funnel.totals} />
        </>
      )}
    </div>
  );
}

// ─── Summary cards ──────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  subtext,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  subtext?: string;
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-1 flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        <span className="text-xs font-medium uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {subtext ? (
        <div className="mt-1 text-xs text-muted-foreground">{subtext}</div>
      ) : null}
    </div>
  );
}

function FunnelSummaryCards({
  totals,
  rates,
}: {
  totals: FunnelTotals;
  rates: FunnelRates;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard label="Viewed" value={totals.viewed} icon={Eye} />
      <StatCard
        label="Started"
        value={totals.started}
        icon={MousePointerClick}
        subtext={`${pct(rates.startRate)} of views`}
      />
      <StatCard
        label="Completed"
        value={totals.completed}
        icon={CheckCircle2}
        subtext={`${pct(rates.completionRate)} of starts`}
      />
      <StatCard
        label="Abandoned"
        value={totals.abandoned}
        icon={XCircle}
        subtext={`${pct(rates.overallRate)} overall conversion`}
      />
    </div>
  );
}

// ─── Funnel chart (CSS bars + daily series) ─────────────────────────────────

function FunnelChart({
  totals,
  byDay,
  range,
}: {
  totals: FunnelTotals;
  byDay: FunnelDay[];
  range: { from: string; to: string };
}) {
  // Zero-fill the sparse daily series across the inclusive UTC range.
  const series = useMemo(() => zeroFill(byDay, range.from, range.to), [
    byDay,
    range.from,
    range.to,
  ]);
  const maxBar = Math.max(totals.viewed, 1);
  const maxDaily = Math.max(...series.map((d) => d.viewed), 1);

  const stages: Array<{ key: keyof FunnelTotals; label: string }> = [
    { key: "viewed", label: "Viewed" },
    { key: "started", label: "Started" },
    { key: "completed", label: "Completed" },
  ];

  return (
    <div className="space-y-6 rounded-lg border border-border p-4">
      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground/70">
          Conversion funnel
        </h2>
        <div className="space-y-2">
          {stages.map((s) => {
            const value = totals[s.key];
            const widthPct = Math.round((value / maxBar) * 100);
            return (
              <div key={s.key} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-xs text-muted-foreground">
                  {s.label}
                </span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-muted">
                  <div
                    className="h-full rounded bg-primary"
                    style={{ width: `${widthPct}%` }}
                    aria-hidden="true"
                  />
                </div>
                <span className="w-12 shrink-0 text-right text-xs font-medium tabular-nums text-foreground">
                  {value}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground/70">
          Daily views
        </h2>
        <div className="flex items-end gap-0.5" style={{ height: "80px" }}>
          {series.map((d) => {
            const h = Math.round((d.viewed / maxDaily) * 100);
            return (
              <div
                key={d.day}
                className="flex-1 rounded-t bg-primary/60"
                style={{ height: `${Math.max(h, d.viewed > 0 ? 4 : 1)}%` }}
                title={`${d.day}: ${d.viewed} views, ${d.completed} completed`}
                aria-label={`${d.day}: ${d.viewed} views`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Fill a sparse day list across [from, to] (inclusive) with zero rows. */
function zeroFill(
  byDay: FunnelDay[],
  from: string,
  to: string,
): FunnelDay[] {
  const map = new Map(byDay.map((d) => [d.day, d]));
  const out: FunnelDay[] = [];
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || start > end) {
    return byDay;
  }
  for (let t = start; t <= end; t += 24 * 60 * 60 * 1000) {
    const day = utcDay(t);
    out.push(
      map.get(day) ?? {
        day,
        viewed: 0,
        started: 0,
        completed: 0,
        abandoned: 0,
      },
    );
  }
  return out;
}

// ─── Drop-off callout ───────────────────────────────────────────────────────

function DropOffCallout({ totals }: { totals: FunnelTotals }) {
  const drops = [
    { label: "View → Start", lost: totals.viewed - totals.started },
    { label: "Start → Complete", lost: totals.started - totals.completed },
  ].filter((d) => d.lost > 0);
  if (drops.length === 0) return null;

  const biggest = drops.reduce((a, b) => (b.lost > a.lost ? b : a));
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-sm text-foreground">
        Largest drop-off:{" "}
        <span className="font-semibold">{biggest.label}</span> — lost{" "}
        <span className="font-semibold tabular-nums">{biggest.lost}</span>{" "}
        respondents.
      </p>
    </div>
  );
}

// ─── Date range picker ──────────────────────────────────────────────────────

function DateRangePicker({
  range,
  onChange,
}: {
  range: { from: string; to: string };
  onChange: (r: { from: string; to: string }) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Input
        type="date"
        value={range.from}
        max={range.to}
        onChange={(e) => onChange({ ...range, from: e.target.value })}
        className="w-auto"
        aria-label="From date"
      />
      <span className="text-muted-foreground" aria-hidden="true">
        →
      </span>
      <Input
        type="date"
        value={range.to}
        min={range.from}
        onChange={(e) => onChange({ ...range, to: e.target.value })}
        className="w-auto"
        aria-label="To date"
      />
    </div>
  );
}

// ─── Export button ──────────────────────────────────────────────────────────

function ExportButton({ formId }: { formId: Id<"forms"> }) {
  const canExport = useCan("form.export_entries");
  const exportEntries = useAction(api.extensions.forms.export.exportEntries);
  const [isExporting, setIsExporting] = useState(false);

  if (!canExport) return null;

  async function handleExport() {
    setIsExporting(true);
    try {
      const res = (await exportEntries({ formId })) as {
        filename: string;
        csv: string;
        count: number;
        warnings: string[];
      };
      downloadCsv(res.filename, res.csv);
      if (res.warnings.length > 0) {
        toast.warning(
          `Exported ${res.count} entries. Skipped unknown fields: ${res.warnings.join(", ")}.`,
        );
      } else {
        toast.success(`Exported ${res.count} entries.`);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Export failed. Please try again.",
      );
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Button onClick={handleExport} disabled={isExporting} variant="outline">
      <Download className="mr-2 size-4" />
      {isExporting ? "Exporting…" : "Export CSV"}
    </Button>
  );
}

/** Trigger a browser download of a CSV string via a Blob object URL. */
function downloadCsv(filename: string, csv: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Empty + skeleton states ────────────────────────────────────────────────

function EmptyAnalytics({ formId }: { formId: Id<"forms"> }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-20 text-center">
      <BarChart3 className="size-10 text-muted-foreground" />
      <h2 className="text-lg font-semibold text-foreground">No analytics yet</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Once this form receives views and submissions, the funnel and conversion
        rates will appear here.
      </p>
      <Link
        to="/forms/$formId/edit"
        params={{ formId }}
        className="text-sm font-medium text-primary hover:underline"
      >
        Back to form
      </Link>
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}
