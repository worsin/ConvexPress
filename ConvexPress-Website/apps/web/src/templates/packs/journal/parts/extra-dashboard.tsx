/**
 * Journal · dashboard parts — the vocabulary the member dashboard surfaces
 * share: the quiet rail of text links, page headings, rule-separated
 * sections and rows, small-caps status pills, stats, progress lines and the
 * descendant-selector frame that restyles the shared behaviour components
 * (ProfileForm, AccountSettingsForm, SecurityOverview, widgets, portal cards)
 * into underline inputs, pill buttons and rules instead of boxes.
 *
 * Same rules as ../parts: tokens only, display type for titles, no icons in
 * the rail.
 */

import { Link, useRouterState } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";

import { badgeCountFor, formatBadge, isNavItemActive, type NavItem } from "@/dashboard/nav";
import { cn } from "@/lib/utils";

import { Eyebrow, Rule, SkeletonBlock, SmallCaps } from "./index";

/* ───────────────────────── frame for shared components ───────────────────────── */

/**
 * Restyles the shared dashboard components through the `data-slot`
 * attributes the UI primitives set: DashboardCard panels become
 * rule-separated sections, inputs become underline inputs, labels small caps,
 * buttons pills, status badges small-caps pills, skeletons soft blocks.
 */
export const JOURNAL_DASHBOARD_FRAME = [
  // DashboardCard → rule-separated section
  "[&_[data-slot=dashboard-card]]:rounded-none [&_[data-slot=dashboard-card]]:border-0 [&_[data-slot=dashboard-card]]:border-t [&_[data-slot=dashboard-card]]:border-border [&_[data-slot=dashboard-card]]:bg-transparent [&_[data-slot=dashboard-card]]:px-0 [&_[data-slot=dashboard-card]]:py-8",
  "[&_[data-slot=dashboard-card-title]]:font-display [&_[data-slot=dashboard-card-title]]:text-xl [&_[data-slot=dashboard-card-title]]:font-normal [&_[data-slot=dashboard-card-title]]:tracking-tight",
  "[&_[data-slot=dashboard-card-description]]:text-sm [&_[data-slot=dashboard-card-description]]:leading-6",
  // Bare panels without a slot (stat tiles, preference sections)
  "[&_.bg-card]:rounded-none [&_.bg-card]:border-0 [&_.bg-card]:border-t [&_.bg-card]:border-border [&_.bg-card]:bg-transparent [&_.bg-card]:px-0 [&_.bg-card]:shadow-none",
  "[&_[data-slot=notification-preferences-section]]:rounded-none [&_[data-slot=notification-preferences-section]]:border-0 [&_[data-slot=notification-preferences-section]]:border-t [&_[data-slot=notification-preferences-section]]:border-border [&_[data-slot=notification-preferences-section]]:bg-transparent",
  // Inputs → underline
  "[&_[data-slot=input]]:h-11 [&_[data-slot=input]]:rounded-none [&_[data-slot=input]]:border-0 [&_[data-slot=input]]:border-b [&_[data-slot=input]]:border-border [&_[data-slot=input]]:bg-transparent [&_[data-slot=input]]:px-0 [&_[data-slot=input]]:text-base [&_[data-slot=input]]:shadow-none",
  "[&_[data-slot=input]:focus-visible]:border-foreground [&_[data-slot=input]:focus-visible]:ring-0",
  "[&_[data-slot=input][aria-invalid=true]]:border-destructive",
  "[&_[data-slot=textarea]]:rounded-none [&_[data-slot=textarea]]:border-0 [&_[data-slot=textarea]]:border-b [&_[data-slot=textarea]]:border-border [&_[data-slot=textarea]]:bg-transparent [&_[data-slot=textarea]]:px-0 [&_[data-slot=textarea]]:text-base [&_[data-slot=textarea]]:shadow-none",
  "[&_[data-slot=textarea]:focus-visible]:border-foreground [&_[data-slot=textarea]:focus-visible]:ring-0",
  "[&_[data-slot=select-trigger]]:rounded-none [&_[data-slot=select-trigger]]:border-0 [&_[data-slot=select-trigger]]:border-b [&_[data-slot=select-trigger]]:border-border [&_[data-slot=select-trigger]]:bg-transparent [&_[data-slot=select-trigger]]:px-0 [&_[data-slot=select-trigger]]:shadow-none",
  // Labels → small caps
  "[&_[data-slot=label]]:text-[11px] [&_[data-slot=label]]:font-medium [&_[data-slot=label]]:uppercase [&_[data-slot=label]]:tracking-[0.18em] [&_[data-slot=label]]:text-muted-foreground",
  // Buttons → pills
  "[&_[data-slot=button]]:rounded-full [&_[data-slot=button]]:px-5",
  // Status badges → small-caps pills
  "[&_[data-slot=status-badge]]:rounded-full [&_[data-slot=status-badge]]:px-2.5 [&_[data-slot=status-badge]]:py-1 [&_[data-slot=status-badge]]:text-[11px] [&_[data-slot=status-badge]]:font-semibold [&_[data-slot=status-badge]]:uppercase [&_[data-slot=status-badge]]:tracking-[0.14em]",
  // Skeletons → soft blocks
  "[&_[data-slot=skeleton]]:rounded-xl",
  // Empty states → display line
  "[&_[data-slot=empty-state]_p:first-of-type]:font-display [&_[data-slot=empty-state]_p:first-of-type]:text-2xl [&_[data-slot=empty-state]_p:first-of-type]:font-normal [&_[data-slot=empty-state]_p:first-of-type]:tracking-tight",
  "[&_[data-slot=empty-state]_svg]:hidden",
].join(" ");

/** The widget grid: display heading, pill toolbar, widgets as quiet panels. */
export const JOURNAL_WIDGET_FRAME = [
  "[&_h1]:font-display [&_h1]:text-3xl [&_h1]:font-normal [&_h1]:leading-[1.08] [&_h1]:tracking-tight [&_h1]:md:text-4xl",
  "[&_[data-slot=dashboard-widget-grid]>div:first-child_p]:text-sm [&_[data-slot=dashboard-widget-grid]>div:first-child_p]:leading-6",
  "[&_[role=toolbar]_button]:h-9 [&_[role=toolbar]_button]:rounded-full [&_[role=toolbar]_button]:px-4",
  "[&_[data-slot=dashboard-widget-card]]:rounded-xl [&_[data-slot=dashboard-widget-card]]:bg-background",
  "[&_[data-slot=dashboard-widget-card]_header]:border-border",
  "[&_[data-slot=dashboard-widget-card]_h2]:font-display [&_[data-slot=dashboard-widget-card]_h2]:text-base [&_[data-slot=dashboard-widget-card]_h2]:font-normal",
  "[&_[data-slot=skeleton]]:rounded-xl",
].join(" ");

/** The notification center: display heading, pill buttons, quiet preferences. */
export const JOURNAL_NOTIFICATIONS_FRAME = [
  "[&_[data-slot=notification-center]>div:first-child_h1]:font-display [&_[data-slot=notification-center]>div:first-child_h1]:text-3xl [&_[data-slot=notification-center]>div:first-child_h1]:font-normal [&_[data-slot=notification-center]>div:first-child_h1]:leading-[1.08] [&_[data-slot=notification-center]>div:first-child_h1]:tracking-tight [&_[data-slot=notification-center]>div:first-child_h1]:md:text-4xl",
  "[&_[data-slot=notification-center]>div:first-child_p]:text-sm [&_[data-slot=notification-center]>div:first-child_p]:leading-6",
  "[&_[data-slot=button]]:rounded-full [&_[data-slot=button]]:px-4",
  "[&_[data-slot=notification-preferences-section]]:rounded-none [&_[data-slot=notification-preferences-section]]:border-0 [&_[data-slot=notification-preferences-section]]:border-t [&_[data-slot=notification-preferences-section]]:border-border [&_[data-slot=notification-preferences-section]]:bg-transparent",
].join(" ");

/** Subscription portal cards and the invoice table as quiet panels. */
export const JOURNAL_PORTAL_FRAME = [
  "[&_[data-slot=portal-card]]:rounded-xl [&_[data-slot=portal-card]]:border-border [&_[data-slot=portal-card]]:bg-background [&_[data-slot=portal-card]]:shadow-none",
  "[&_[data-slot=portal-card]_h3]:font-display [&_[data-slot=portal-card]_h3]:text-xl [&_[data-slot=portal-card]_h3]:font-normal [&_[data-slot=portal-card]_h3]:tracking-tight",
  "[&_[data-slot=invoice-history-table]]:rounded-none [&_[data-slot=invoice-history-table]]:border-0 [&_[data-slot=invoice-history-table]]:border-y [&_[data-slot=invoice-history-table]]:border-border [&_[data-slot=invoice-history-table]]:bg-transparent [&_[data-slot=invoice-history-table]]:shadow-none",
  "[&_[data-slot=invoice-history-table]>div]:px-0",
  "[&_[data-slot=invoice-history-table]_[class*=divide-y]>div]:px-0",
  "[&_[data-slot=status-badge]]:rounded-full [&_[data-slot=status-badge]]:px-2.5 [&_[data-slot=status-badge]]:py-1 [&_[data-slot=status-badge]]:text-[11px] [&_[data-slot=status-badge]]:font-semibold [&_[data-slot=status-badge]]:uppercase [&_[data-slot=status-badge]]:tracking-[0.14em]",
  "[&_button.bg-primary]:rounded-full [&_button.bg-destructive]:rounded-full [&_button.border-border]:rounded-full [&_a.bg-primary]:rounded-full",
].join(" ");

/* ───────────────────────── rail ───────────────────────── */

const RAIL_LINK = "block py-1.5 text-sm leading-6 transition-colors";

/** One rail entry: heading → small caps, separator → rule, link → text link (active in text-primary). */
export function RailItem({ item, badges, depth = 0, onNavigate }: { item: NavItem; badges: Record<string, number> | null; depth?: number; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (item.kind === "separator") {
    return (
      <li role="separator" aria-hidden="true" className="py-2">
        <Rule />
      </li>
    );
  }
  if (item.kind === "heading") {
    return (
      <li className={cn("pb-1", depth === 0 && "pt-5 first:pt-0")}>
        <SmallCaps as="span">{item.label}</SmallCaps>
      </li>
    );
  }

  const active = isNavItemActive(item, pathname);
  const count = badgeCountFor(item, badges);
  const linkClass = cn(
    RAIL_LINK,
    "flex items-baseline justify-between gap-3",
    active ? "text-primary" : "text-muted-foreground hover:text-foreground",
    depth > 0 && "pl-4",
  );
  const body = (
    <>
      <span className="min-w-0 truncate">{item.label}</span>
      {count > 0 ? (
        <span aria-label={`${formatBadge(count)} new`} className="shrink-0 text-[11px] font-semibold tabular-nums text-primary">
          {formatBadge(count)}
        </span>
      ) : null}
    </>
  );

  return (
    <li>
      {item.external ? (
        <a href={item.href} target={item.target} rel={item.rel ?? (item.target === "_blank" ? "noopener noreferrer" : undefined)} className={linkClass} onClick={onNavigate}>
          {body}
        </a>
      ) : (
        <Link to={item.href as any} className={linkClass} aria-current={active ? "page" : undefined} onClick={onNavigate}>
          {body}
        </Link>
      )}
      {item.children.length > 0 ? (
        <ul role="list">
          {item.children.map((child) => (
            <RailItem key={child.id} item={child} badges={badges} depth={depth + 1} onNavigate={onNavigate} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** The quiet left rail: text links only, small-caps headings, active link in text-primary. */
export function RailNav({ items, badges, label = "Dashboard", className }: { items: NavItem[]; badges: Record<string, number> | null; label?: string; className?: string }) {
  return (
    <nav aria-label={label} className={className}>
      <ul role="list" className="flex flex-col">
        {items.map((item) => (
          <RailItem key={item.id} item={item} badges={badges} />
        ))}
      </ul>
    </nav>
  );
}

/** A horizontal row of small-caps text links (topbar layout, account tabs). */
export function InlineNav({ items, badges, label, className }: { items: NavItem[]; badges: Record<string, number> | null; label: string; className?: string }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const links = items.filter((item) => item.kind === "link");
  if (links.length === 0) return null;
  return (
    <nav aria-label={label} className={className}>
      <ul role="list" className="flex items-center gap-x-6 gap-y-1 overflow-x-auto">
        {links.map((item) => {
          const active = isNavItemActive(item, pathname);
          const count = badgeCountFor(item, badges);
          const linkClass = cn(
            "inline-flex items-baseline gap-1.5 whitespace-nowrap py-3 text-[11px] font-medium uppercase tracking-[0.18em] transition-colors",
            active ? "text-primary" : "text-muted-foreground hover:text-foreground",
          );
          const body = (
            <>
              {item.label}
              {count > 0 ? <span className="tabular-nums text-primary">{formatBadge(count)}</span> : null}
            </>
          );
          return (
            <li key={item.id}>
              {item.external ? (
                <a href={item.href} target={item.target} rel={item.rel} className={linkClass}>
                  {body}
                </a>
              ) : (
                <Link to={item.href as any} className={linkClass} aria-current={active ? "page" : undefined}>
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ───────────────────────── page structure ───────────────────────── */

/** Eyebrow + display title (h1) + optional lede, with a quiet action opposite. */
export function PageHeading({ eyebrow, title, lede, action, className }: { eyebrow?: ReactNode; title: ReactNode; lede?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <div className={cn("flex flex-col gap-3", action && "sm:flex-row sm:items-end sm:justify-between sm:gap-6")}>
        <h1 className="font-display text-3xl leading-[1.08] tracking-tight text-foreground text-balance md:text-4xl">{title}</h1>
        {action ? <div className="shrink-0 pb-1">{action}</div> : null}
      </div>
      {lede ? <p className="max-w-[60ch] text-base leading-8 text-muted-foreground">{lede}</p> : null}
    </header>
  );
}

/** A rule above, a small-caps title (h2) with an optional action, then content. */
export function Section({ title, lede, action, children, className, ...props }: ComponentProps<"section"> & { title?: ReactNode; lede?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cn("flex flex-col gap-5 border-t border-border pt-8", className)} {...props}>
      {title || action ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <div className="flex flex-col gap-1">
            {title ? <SmallCaps as="h2">{title}</SmallCaps> : null}
            {lede ? <p className="text-sm leading-6 text-muted-foreground">{lede}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Rule-separated rows. */
export function RowList({ className, ...props }: ComponentProps<"ul">) {
  return <ul role="list" className={cn("flex flex-col divide-y divide-border border-y border-border", className)} {...props} />;
}

export function Row({ className, ...props }: ComponentProps<"li">) {
  return <li className={cn("flex flex-col gap-3 py-5", className)} {...props} />;
}

/** Skeleton rows for a loading list. */
export function RowSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col divide-y divide-border border-y border-border", className)} aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center justify-between gap-6 py-5">
          <div className="flex flex-1 flex-col gap-2.5">
            <SkeletonBlock className="h-4 w-1/2" />
            <SkeletonBlock className="h-3 w-1/3 rounded-full" />
          </div>
          <SkeletonBlock className="h-5 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Heading + lede skeleton for a page still loading. */
export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-10" role="status" aria-label="Loading">
      <div className="flex flex-col gap-3" aria-hidden="true">
        <SkeletonBlock className="h-3 w-20 rounded-full" />
        <SkeletonBlock className="h-9 w-1/2" />
        <SkeletonBlock className="h-3 w-2/3 rounded-full" />
      </div>
      <RowSkeleton rows={rows} />
    </div>
  );
}

/* ───────────────────────── status, stats, progress ───────────────────────── */

export type StatusTone = "muted" | "primary" | "destructive";

const STATUS_TONES: Record<string, StatusTone> = {
  active: "primary",
  approved: "primary",
  assigned: "primary",
  available: "primary",
  completed: "primary",
  delivered: "primary",
  fulfilled: "primary",
  paid: "primary",
  published: "primary",
  refunded: "primary",
  trialing: "primary",
  cancelled: "destructive",
  canceled: "destructive",
  expired: "destructive",
  failed: "destructive",
  past_due: "destructive",
  pending_cancel: "destructive",
  rejected: "destructive",
  revoked: "destructive",
  spam: "destructive",
  trash: "destructive",
};

export function statusTone(status: string | undefined | null): StatusTone {
  if (!status) return "muted";
  return STATUS_TONES[status.toLowerCase()] ?? "muted";
}

export function statusLabel(status: string | undefined | null): string {
  return String(status ?? "").replace(/[_.]/g, " ");
}

/** Small-caps status pill; tone derives from the status word unless given. */
export function StatusPill({ status, label, tone, className }: { status?: string | null; label?: ReactNode; tone?: StatusTone; className?: string }) {
  const resolved = tone ?? statusTone(status);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
        resolved === "muted" && "bg-muted text-muted-foreground",
        resolved === "primary" && "bg-primary/10 text-primary",
        resolved === "destructive" && "bg-destructive/10 text-destructive",
        className,
      )}
    >
      {label ?? statusLabel(status)}
    </span>
  );
}

/** Small-caps label over a value (and an optional hint line). */
export function Stat({ label, value, hint, display = false, className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; display?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <SmallCaps as="dt">{label}</SmallCaps>
      <dd className={cn("text-foreground", display ? "font-display text-2xl tabular-nums" : "text-base")}>{value}</dd>
      {hint ? <dd className="text-xs text-muted-foreground">{hint}</dd> : null}
    </div>
  );
}

export function StatGrid({ className, ...props }: ComponentProps<"dl">) {
  return <dl className={cn("grid gap-6 sm:grid-cols-2 lg:grid-cols-3", className)} {...props} />;
}

/** A hairline progress bar. */
export function ProgressLine({ percent, className, label }: { percent: number; className?: string; label?: string }) {
  const clamped = Math.min(Math.max(percent, 0), 100);
  return (
    <div className={cn("h-1 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${clamped}%` }} />
    </div>
  );
}

/** Small-caps step line (Requested / Approved / …) with the reached steps in the foreground. */
export function StepLine({ steps, current, failed, className }: { steps: Array<{ key: string; label: string }>; current: string; failed?: ReactNode; className?: string }) {
  if (failed) {
    return (
      <p className={cn("text-[11px] font-medium uppercase tracking-[0.18em] text-destructive", className)} aria-label="Status">
        {failed}
      </p>
    );
  }
  const currentIndex = steps.findIndex((step) => step.key === current);
  return (
    <ol className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", className)} aria-label="Progress">
      {steps.map((step, index) => {
        const reached = index <= currentIndex;
        const isCurrent = index === currentIndex;
        return (
          <li key={step.key} className="flex items-center gap-x-3">
            {index > 0 ? (
              <span className="text-[11px] text-muted-foreground/60" aria-hidden="true">
                /
              </span>
            ) : null}
            <span aria-current={isCurrent ? "step" : undefined} className={cn("text-[11px] font-medium uppercase tracking-[0.18em]", isCurrent ? "text-foreground underline decoration-foreground underline-offset-[6px]" : reached ? "text-foreground" : "text-muted-foreground")}>
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ───────────────────────── controls ───────────────────────── */

/** Quiet underlined text action (Edit, Remove, Copy link…). */
export function textActionClasses(tone: "muted" | "foreground" | "destructive" | "primary" = "muted", className?: string) {
  return cn(
    "inline-flex items-baseline gap-1 text-sm underline decoration-border underline-offset-4 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    tone === "muted" && "text-muted-foreground hover:text-foreground hover:decoration-foreground",
    tone === "foreground" && "text-foreground hover:decoration-foreground",
    tone === "destructive" && "text-muted-foreground hover:text-destructive hover:decoration-destructive",
    tone === "primary" && "text-primary decoration-primary/40 hover:decoration-primary",
    className,
  );
}

export function TextAction({ tone = "muted", className, type = "button", ...props }: ComponentProps<"button"> & { tone?: "muted" | "foreground" | "destructive" | "primary" }) {
  return <button type={type} className={textActionClasses(tone, className)} {...props} />;
}

/** Small-caps "Back to …" link. */
export function BackLink({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link to={to as any} className={cn("inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground", className)}>
      <span aria-hidden="true">←</span>
      {children}
    </Link>
  );
}

export function BackButton({ children, className, ...props }: ComponentProps<"button">) {
  return (
    <button type="button" className={cn("inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground", className)} {...props}>
      <span aria-hidden="true">←</span>
      {children}
    </button>
  );
}

/** Underline-style textarea, matching UnderlineInput. */
export function UnderlineTextarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full resize-y rounded-none border-0 border-b border-border bg-transparent px-0 py-2 text-base leading-7 text-foreground placeholder:text-muted-foreground focus:border-foreground focus:outline-none focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
}

/** Pill toggle (public / private, on / off). */
export function PillSwitch({ checked, onCheckedChange, label, disabled, className }: { checked: boolean; onCheckedChange: (checked: boolean) => void; label: ReactNode; disabled?: boolean; className?: string }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-3", disabled && "cursor-not-allowed opacity-60", className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors", checked ? "bg-primary" : "bg-muted")}
      >
        <span className={cn("inline-block size-3.5 rounded-full bg-background shadow-sm transition-transform", checked ? "translate-x-[18px]" : "translate-x-[3px]")} />
      </button>
      <span className="text-sm text-muted-foreground">{label}</span>
    </label>
  );
}

/** A choice pill (return reasons, filters). */
export function ChoicePill({ selected, className, type = "button", ...props }: ComponentProps<"button"> & { selected: boolean }) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-full border px-4 text-sm font-medium transition-colors",
        selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-transparent text-foreground hover:border-foreground/40",
        className,
      )}
      {...props}
    />
  );
}

/** Small-caps tab row (Downloads / License keys). */
export function TabLine({ tabs, current, onChange, className }: { tabs: Array<{ key: string; label: ReactNode; count?: number }>; current: string; onChange: (key: string) => void; className?: string }) {
  return (
    <div role="tablist" className={cn("flex items-center gap-x-6 border-y border-border", className)}>
      {tabs.map((tab) => {
        const active = tab.key === current;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.key)}
            className={cn("inline-flex items-baseline gap-1.5 py-3 text-[11px] font-medium uppercase tracking-[0.18em] transition-colors", active ? "text-primary" : "text-muted-foreground hover:text-foreground")}
          >
            {tab.label}
            {typeof tab.count === "number" ? <span className="tabular-nums">{tab.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/* ───────────────────────── dates ───────────────────────── */

export function dashDate(value: number | string | null | undefined, fallback = "—"): string {
  if (value === null || value === undefined || value === "") return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function dashDateTime(value: number | string | null | undefined, fallback = "—"): string {
  if (value === null || value === undefined || value === "") return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}
