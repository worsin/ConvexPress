/**
 * Subscription coupons: each code's discount in words, how much it has been
 * used, and whether it is running.
 *
 * Data: `adminCatalog.listCouponRows`.
 */
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { ChevronRight, Plus, TicketPercent } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import { describeCoupon } from "@/components/subscriptions/catalog/CouponEditor";

export const Route = createFileRoute("/_authenticated/_admin/commerce/subscriptions/coupons/")({
  component: CouponsIndex,
});

type CouponStatus = "active" | "paused" | "archived";
const FILTERS: ReadonlyArray<CouponStatus | undefined> = [undefined, "active", "paused", "archived"];
const LABEL: Record<CouponStatus, string> = { active: "Active", paused: "Paused", archived: "Archived" };
const TONE: Record<CouponStatus, string> = {
  active: "bg-primary/15 text-primary",
  paused: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  archived: "bg-muted text-muted-foreground",
};
const COLUMNS = "grid-cols-[150px_minmax(0,2fr)_110px_100px_20px]";

function CouponsIndex() {
  const [status, setStatus] = useState<CouponStatus | undefined>(undefined);
  const coupons = useQuery(api.commerceSubscriptions.adminCatalog.listCouponRows, { status });
  const now = Date.now();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Coupons</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">Discount codes customers enter at signup or from their account.</p>
        </div>
        <Link
          to="/commerce/subscriptions/coupons/new"
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> New coupon
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Status">
        {FILTERS.map((value) => (
          <button
            key={value ?? "all"}
            type="button"
            role="tab"
            aria-selected={status === value}
            onClick={() => setStatus(value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              status === value ? "bg-primary text-primary-foreground" : "border border-border text-foreground hover:bg-muted",
            )}
          >
            {value ? LABEL[value] : "All"}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
        <div className="min-w-[720px]">
          <div className={cn("grid gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground", COLUMNS)}>
            <div>Code</div>
            <div>Discount</div>
            <div>Used</div>
            <div>Status</div>
            <div />
          </div>
          {coupons === undefined ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-12 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : coupons.length === 0 ? (
            <div className="p-10 text-center">
              <TicketPercent className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">{status ? "No coupons here." : "No coupons yet."}</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {coupons.map((coupon) => {
                const expired = coupon.expiresAt !== undefined && coupon.expiresAt < now;
                const usedUp = coupon.maxRedemptions !== undefined && coupon.redemptions >= coupon.maxRedemptions;
                return (
                  <li key={coupon._id}>
                    <Link
                      to="/commerce/subscriptions/coupons/$couponId/edit"
                      params={{ couponId: coupon._id }}
                      className={cn("grid items-center gap-4 px-5 py-3.5 text-sm transition-colors hover:bg-muted/30", COLUMNS)}
                    >
                      <div className="font-mono font-medium tracking-wider">{coupon.code}</div>
                      <div className="min-w-0 text-xs text-muted-foreground">
                        {describeCoupon({
                          discountType: coupon.discountType,
                          amount: coupon.amount,
                          currencyCode: coupon.offers[0]?.currencyCode ?? "USD",
                          duration: coupon.duration,
                          durationMonths: coupon.durationMonths,
                          offerTitles: coupon.offers.map((offer) => offer.title),
                          expiresAt: coupon.expiresAt,
                          maxRedemptions: undefined,
                        })}
                      </div>
                      <div className="text-xs">
                        {coupon.redemptions}
                        {coupon.maxRedemptions ? <span className="text-muted-foreground"> / {coupon.maxRedemptions}</span> : null}
                      </div>
                      <div>
                        <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", expired || usedUp ? TONE.archived : TONE[coupon.status])}>
                          {expired ? "Ended" : usedUp ? "Used up" : LABEL[coupon.status]}
                        </span>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
