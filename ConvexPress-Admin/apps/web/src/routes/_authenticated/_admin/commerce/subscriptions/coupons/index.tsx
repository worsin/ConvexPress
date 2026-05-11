/**
 * Subscription Coupons list.
 *
 * Coupons are discount codes redeemable against subscription contracts.
 * The `redeemCouponForContract` mutation runs on ContractActions; here
 * we manage the coupon catalog itself (create / edit / archive).
 *
 * Filters: status (active/paused/archived), search by code.
 */

import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { toast } from "sonner";
import {
  Archive,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Search,
  Tag,
} from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/subscriptions/coupons/",
)({
  component: SubscriptionCouponsIndex,
});

type CouponStatus = "active" | "paused" | "archived";
type DiscountType = "percent" | "fixed";
type Duration = "once" | "forever" | "n_months";

type Coupon = {
  _id: Id<"commerce_subscription_coupons">;
  code: string;
  discountType: DiscountType;
  amount: number;
  duration: Duration;
  durationMonths?: number;
  maxRedemptions?: number;
  perCustomerLimit?: number;
  offerIds?: Array<Id<"commerce_subscription_offers">>;
  startsAt?: number;
  expiresAt?: number;
  status: CouponStatus;
  createdAt: number;
};

function formatDate(ts: number | undefined) {
  if (!ts) return "--";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDiscount(coupon: Coupon) {
  if (coupon.discountType === "percent") {
    return `${coupon.amount}% off`;
  }
  // fixed amount in cents
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(coupon.amount / 100) + " off";
}

function formatDuration(coupon: Coupon) {
  if (coupon.duration === "once") return "One invoice";
  if (coupon.duration === "forever") return "Forever";
  return `${coupon.durationMonths ?? 0} months`;
}

function StatusBadge({ status }: { status: CouponStatus }) {
  const styles: Record<CouponStatus, string> = {
    active: "bg-primary/15 text-primary",
    paused: "bg-muted text-muted-foreground",
    archived: "bg-destructive/10 text-destructive",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        styles[status],
      )}
    >
      {status}
    </span>
  );
}

function SubscriptionCouponsIndex() {
  const navigate = useNavigate();

  const [statusFilter, setStatusFilter] = useState<"" | CouponStatus>("");
  const [search, setSearch] = useState("");
  const coupons = useQuery(
    (api as any).commerceSubscriptions.coupons.listCoupons,
    {
      status: statusFilter || undefined,
      search: search.trim() || undefined,
    },
  ) as Coupon[] | null | undefined;

  const archiveCoupon = useMutation(
    (api as any).commerceSubscriptions.coupons.archiveCoupon,
  );

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pluginDisabled = coupons === null;

  async function handleArchive(id: Id<"commerce_subscription_coupons">) {
    setBusy(true);
    try {
      await archiveCoupon({ couponId: id });
      toast.success("Coupon archived");
      setArchivingId(null);
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to archive coupon",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Coupons</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Discount codes redeemable against subscription contracts.
            Discounts apply on the NEXT invoice — redemption is
            idempotent per contract. Once redeemed, the code and discount
            type lock.
          </p>
        </div>
        <Link
          to="/commerce/subscriptions/coupons/new"
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New coupon
        </Link>
      </div>

      {pluginDisabled && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
          <Tag className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">
            The commerce subscriptions plugin is disabled.
          </p>
        </div>
      )}

      {!pluginDisabled && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              {(["", "active", "paused", "archived"] as const).map((s) => (
                <button
                  key={s || "all"}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    statusFilter === s
                      ? "bg-primary text-primary-foreground"
                      : "border border-border text-foreground hover:bg-muted",
                  )}
                >
                  {s || "All"}
                </button>
              ))}
            </div>
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value.toUpperCase())}
                placeholder="Search by code…"
                className="w-full rounded-xl border border-border bg-background py-2 pl-8 pr-3 font-mono text-sm uppercase text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="grid grid-cols-[1fr_100px_130px_140px_130px_130px] gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <div>Code</div>
              <div>Status</div>
              <div>Discount</div>
              <div>Duration</div>
              <div>Expires</div>
              <div className="text-right">Actions</div>
            </div>

            {coupons === undefined ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-xl bg-muted"
                  />
                ))}
              </div>
            ) : coupons.length === 0 ? (
              <div className="p-10 text-center">
                <Tag className="mx-auto h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">
                  {search || statusFilter
                    ? "No coupons match your filter."
                    : "No coupons yet."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {coupons.map((c) => (
                  <div key={c._id}>
                    <div className="grid grid-cols-[1fr_100px_130px_140px_130px_130px] items-center gap-4 px-5 py-4">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(
                              expandedId === c._id ? null : c._id,
                            )
                          }
                          className="flex items-center gap-2 text-left"
                        >
                          {expandedId === c._id ? (
                            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-mono text-sm font-semibold uppercase tracking-wide text-foreground">
                              {c.code}
                            </p>
                          </div>
                        </button>
                      </div>
                      <div>
                        <StatusBadge status={c.status} />
                      </div>
                      <div className="text-sm font-semibold text-foreground">
                        {formatDiscount(c)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatDuration(c)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatDate(c.expiresAt)}
                      </div>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            navigate({
                              to: "/commerce/subscriptions/coupons/$couponId/edit",
                              params: { couponId: c._id },
                            })
                          }
                          title="Edit coupon"
                          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {c.status !== "archived" && (
                          <button
                            type="button"
                            onClick={() => setArchivingId(c._id)}
                            title="Archive coupon"
                            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {expandedId === c._id && (
                      <div className="border-t border-border/50 bg-muted/20 px-5 py-4">
                        <div className="grid gap-4 text-sm sm:grid-cols-4">
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">
                              Starts at
                            </p>
                            <p className="mt-1 text-foreground">
                              {formatDate(c.startsAt)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">
                              Max redemptions
                            </p>
                            <p className="mt-1 text-foreground">
                              {c.maxRedemptions ?? "Unlimited"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">
                              Per-customer limit
                            </p>
                            <p className="mt-1 text-foreground">
                              {c.perCustomerLimit ?? "Unlimited"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">
                              Scope
                            </p>
                            <p className="mt-1 text-foreground">
                              {c.offerIds && c.offerIds.length > 0
                                ? `${c.offerIds.length} offer${c.offerIds.length === 1 ? "" : "s"}`
                                : "All offers"}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {archivingId === c._id && (
                      <div className="border-t border-destructive/30 bg-destructive/5 px-5 py-4">
                        <p className="text-sm text-destructive">
                          Archive coupon{" "}
                          <strong className="font-mono">{c.code}</strong>?
                          Already-issued redemptions continue to apply
                          until exhausted.
                        </p>
                        <div className="mt-3 flex gap-3">
                          <button
                            type="button"
                            onClick={() => void handleArchive(c._id)}
                            disabled={busy}
                            className="inline-flex rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-60"
                          >
                            Archive
                          </button>
                          <button
                            type="button"
                            onClick={() => setArchivingId(null)}
                            className="inline-flex rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
