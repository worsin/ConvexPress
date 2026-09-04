/**
 * Depot · dashboard parts — the pieces the member dashboard surfaces share on
 * top of the base vocabulary: the compact page header with an optional back
 * link, status badges mapped from backend status strings, key-figure tiles,
 * a `rounded-md` progress bar and switch, table skeletons, and the frame
 * class that restyles the composed behaviour components (profile / settings
 * forms, widget grid, notification center, subscription portal cards).
 */

import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { InputHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Badge, Card, Label, Skeleton, type BadgeTone } from "./index";
import { frameReset } from "./extra-plugins";

/* ───────────────────────── frames ───────────────────────── */

/**
 * Frame for composed dashboard components: every large radius becomes
 * `rounded-md`, `DashboardCard`s and status badges take the Depot box, inputs
 * become `h-10` on the page background, and the composed h1s take the Depot
 * display size.
 */
export const dashboardFrame = cn(
  frameReset,
  "[&_[data-slot=dashboard-card]]:rounded-md [&_[data-slot=dashboard-card-title]]:text-sm [&_[data-slot=dashboard-card-title]]:font-semibold",
  "[&_[data-slot=status-badge]]:rounded-md [&_[data-slot=empty-state]]:rounded-md [&_[data-slot=dashboard-profile-trigger]]:rounded-md",
  "[&_[data-slot=dashboard-widget-grid]_h1]:font-display [&_[data-slot=dashboard-widget-grid]_h1]:text-2xl [&_[data-slot=dashboard-widget-grid]_h1]:font-semibold [&_[data-slot=dashboard-widget-grid]_h1]:tracking-tight",
  "[&_[data-slot=notification-center]_h1]:font-display [&_[data-slot=notification-center]_h1]:font-semibold",
);

/** Compact page header: eyebrow, h1, description, optional back link above and actions on the right. */
export function DashboardPageHeader({
  eyebrow,
  title,
  description,
  aside,
  meta,
  back,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  /** Small tabular text on the right (counts, dates). */
  meta?: ReactNode;
  /** Link (`to`) or button (`onClick`) rendered above the title. */
  back?: { label: string; to?: string; onClick?: () => void };
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2 border-b border-border pb-4", className)}>
      {back ? <BackLink to={back.to} onClick={back.onClick}>{back.label}</BackLink> : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          {eyebrow ? <Label>{eyebrow}</Label> : null}
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{title}</h1>
          {description ? <p className="max-w-3xl text-[13px] leading-5 text-muted-foreground">{description}</p> : null}
        </div>
        {aside || meta ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {meta ? <span className="text-[13px] tabular-nums text-muted-foreground">{meta}</span> : null}
            {aside}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Small "back" link (route link or button). */
export function BackLink({ to, onClick, children, className }: { to?: string; onClick?: () => void; children: ReactNode; className?: string }) {
  const body = (
    <>
      <ArrowLeft className="size-3.5" aria-hidden="true" />
      {children}
    </>
  );
  const classes = cn("inline-flex items-center gap-1 self-start text-[13px] text-muted-foreground transition-colors hover:text-foreground", className);
  if (to) {
    return (
      <Link to={to} className={classes}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes}>
      {body}
    </button>
  );
}

/** Section title row inside a page: h2 left, optional count and action right. */
export function DashboardSection({ title, count, action, children, className }: { title: ReactNode; count?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="flex items-baseline gap-2 text-lg font-semibold text-foreground">
          {title}
          {count !== undefined && count !== null ? <span className="text-[13px] font-normal tabular-nums text-muted-foreground">{count}</span> : null}
        </h2>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

/* ───────────────────────── status ───────────────────────── */

const POSITIVE = new Set(["active", "approved", "published", "paid", "completed", "delivered", "fulfilled", "shipped", "available", "assigned", "refunded", "received", "trialing", "succeeded", "success"]);
const NEGATIVE = new Set(["rejected", "failed", "cancelled", "canceled", "past_due", "revoked", "spam", "trash", "expired", "declined", "error", "voided"]);

/** Badge tone for a backend status string: positive → primary tint, negative → destructive tint, everything else muted. */
export function statusTone(status: string | undefined | null): BadgeTone {
  const key = String(status ?? "").toLowerCase();
  if (POSITIVE.has(key)) return "sale";
  if (NEGATIVE.has(key)) return "danger";
  return "stock";
}

/** "refund_pending" → "Refund pending". */
export function formatStatus(status: string | undefined | null): string {
  const text = String(status ?? "").replace(/[_.]/g, " ").trim();
  if (!text) return "—";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Status badge with the tone derived from the status string. */
export function StatusBadge({ status, label, className }: { status: string | undefined | null; label?: ReactNode; className?: string }) {
  return (
    <Badge tone={statusTone(status)} className={className}>
      {label ?? formatStatus(status)}
    </Badge>
  );
}

/* ───────────────────────── formatting ───────────────────────── */

/** "Sep 4, 2026" or "—". */
export function dateOrDash(ts: number | string | null | undefined): string {
  if (ts === null || ts === undefined || ts === "") return "—";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

/** "Sep 4, 2026, 3:02 PM" or "—". */
export function formatDateTime(ts: number | string | null | undefined): string {
  if (ts === null || ts === undefined || ts === "") return "—";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

/* ───────────────────────── display ───────────────────────── */

/** Label above a tabular figure, in a small box. */
export function StatTile({ label, value, hint, className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <Card className={cn("flex flex-col gap-0.5 px-3 py-2", className)}>
      <Label>{label}</Label>
      <p className="text-sm font-semibold tabular-nums text-foreground">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}

/** Thin `rounded-md` progress bar. */
export function Progress({ value, label, className }: { value: number; label?: string; className?: string }) {
  const percent = Math.min(Math.max(Math.round(value), 0), 100);
  return (
    <div role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={label} className={cn("h-1.5 w-full overflow-hidden rounded-md bg-muted", className)}>
      <div className="h-full rounded-md bg-primary transition-[width]" style={{ width: `${percent}%` }} />
    </div>
  );
}

/** Segmented progress strip (one segment per step). */
export function Steps({ steps, current, failed, className }: { steps: readonly string[]; current: number; failed?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-0.5", className)} aria-hidden="true">
      {steps.map((step, index) => (
        <span key={step} className={cn("h-1.5 flex-1 rounded-md", failed ? "bg-destructive" : index <= current ? "bg-primary" : "bg-muted")} />
      ))}
    </div>
  );
}

/** `rounded-md` switch. */
export function Switch({ checked, onChange, label, disabled, className }: { checked: boolean; onChange: (checked: boolean) => void; label?: ReactNode; disabled?: boolean; className?: string }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-[13px] text-foreground", disabled && "cursor-not-allowed opacity-50", className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-md border transition-colors", checked ? "border-primary bg-primary" : "border-border bg-muted")}
      >
        <span className={cn("inline-block size-3.5 rounded-sm bg-background shadow-sm transition-transform", checked ? "translate-x-[18px]" : "translate-x-[3px]")} />
      </button>
      {label ? <span>{label}</span> : null}
    </label>
  );
}

/** Native checkbox in Depot dress. */
export function Checkbox({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="checkbox" className={cn("size-4 shrink-0 rounded-sm border-border accent-primary disabled:cursor-not-allowed disabled:opacity-50", className)} {...props} />;
}

/* ───────────────────────── loading ───────────────────────── */

/** Skeleton rows inside a table box. */
export function TableSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <Card className={cn("flex flex-col divide-y divide-border", className)} aria-hidden="true">
      <div className="h-9 bg-muted/40" />
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-3 w-1/6" />
          <Skeleton className="ml-auto h-3 w-1/6" />
        </div>
      ))}
    </Card>
  );
}

/** Page skeleton: header row then a few blocks. */
export function DashboardSkeleton({ blocks = ["h-40", "h-32"], className }: { blocks?: string[]; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4", className)} aria-hidden="true">
      <div className="flex flex-col gap-2 border-b border-border pb-4">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-3 w-64" />
      </div>
      {blocks.map((height, index) => (
        <Skeleton key={index} className={cn("w-full", height)} />
      ))}
    </div>
  );
}
