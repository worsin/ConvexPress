/**
 * Small helpers shared by the official widget modules.
 */

import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { DashboardWidgetSize } from "../types";

/** Rows a list widget should show at a given size (before the limit setting). */
export function rowsForSize(size: DashboardWidgetSize, base: number): number {
  const factor: Record<DashboardWidgetSize, number> = { sm: 0.5, md: 1, lg: 1, xl: 2 };
  return Math.max(1, Math.round(base * factor[size]));
}

export function ViewAllLink({ to, children = "View all" }: { to: string; children?: ReactNode }) {
  return (
    <Link to={to} className="text-[11px] font-medium text-primary hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
      {children}
    </Link>
  );
}

export function formatMoney(amount: number | undefined, currencyCode = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode || "USD" }).format((amount ?? 0) / 100);
}

export function formatShortDate(ts: number | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "primary" | "destructive" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-none px-1.5 py-0.5 text-[10px] font-medium capitalize",
        tone === "primary" && "bg-primary/10 text-primary",
        tone === "destructive" && "bg-destructive/10 text-destructive",
        tone === "muted" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function statusTone(status: string): "muted" | "primary" | "destructive" {
  const key = status.toLowerCase();
  if (["active", "trialing", "completed", "delivered", "paid", "published", "approved", "shipped"].includes(key)) return "primary";
  if (["cancelled", "canceled", "failed", "refunded", "expired", "past_due", "rejected", "spam", "trash"].includes(key)) return "destructive";
  return "muted";
}
