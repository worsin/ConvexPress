/**
 * New Subscription Coupon form.
 *
 * Fields:
 *   - code (uppercase), status (active/paused)
 *   - discountType (percent/fixed), amount
 *   - duration (once/forever/n_months), durationMonths (conditional)
 *   - maxRedemptions (global cap), perCustomerLimit
 *   - offerIds[] (scope — if empty, the coupon applies to any offer)
 *   - startsAt, expiresAt (datetime-local inputs → epoch ms)
 *
 * Backend: commerceSubscriptions.coupons.createCoupon
 */

import { useMemo, useState } from "react";
import {
  createFileRoute,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/subscriptions/coupons/new",
)({
  component: NewCouponPage,
});

type CouponStatus = "active" | "paused" | "archived";
type DiscountType = "percent" | "fixed";
type Duration = "once" | "forever" | "n_months";

const inputClass =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

function Field({
  label,
  required,
  helper,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {children}
      {helper && (
        <p className="mt-1 text-[11px] text-muted-foreground">{helper}</p>
      )}
    </div>
  );
}

function toLocalDatetime(ms: number | undefined) {
  if (!ms) return "";
  const d = new Date(ms);
  // Format as yyyy-mm-ddTHH:MM
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDatetime(str: string): number | undefined {
  if (!str) return undefined;
  const t = new Date(str).getTime();
  return Number.isFinite(t) ? t : undefined;
}

function NewCouponPage() {
  const navigate = useNavigate();
  const createCoupon = useMutation(
    (api as any).commerceSubscriptions.coupons.createCoupon,
  );

  const offers = useQuery(
    (api as any).commerceSubscriptions.offers.listOffers,
    { status: "active" },
  ) as
    | Array<{
        _id: Id<"commerce_subscription_offers">;
        title: string;
        slug: string;
      }>
    | null
    | undefined;

  const [code, setCode] = useState("");
  const [status, setStatus] = useState<CouponStatus>("active");
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [amount, setAmount] = useState("10");
  const [duration, setDuration] = useState<Duration>("once");
  const [durationMonths, setDurationMonths] = useState("3");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [perCustomerLimit, setPerCustomerLimit] = useState("");
  const [offerIds, setOfferIds] = useState<
    Array<Id<"commerce_subscription_offers">>
  >([]);
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const amountHelper = useMemo(() => {
    if (discountType === "percent") {
      return "Integer 0–100 (e.g. 25 = 25% off).";
    }
    return "Fixed amount in minor units (e.g. 500 = $5.00 off).";
  }, [discountType]);

  function toggleOffer(id: Id<"commerce_subscription_offers">) {
    setOfferIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedCode) {
      toast.error("Code is required.");
      return;
    }
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      toast.error("Amount must be non-negative.");
      return;
    }
    if (discountType === "percent" && amountNum > 100) {
      toast.error("Percent discounts cap at 100.");
      return;
    }
    if (duration === "n_months") {
      const dm = Number(durationMonths);
      if (!Number.isFinite(dm) || dm <= 0) {
        toast.error("Duration months must be a positive number.");
        return;
      }
    }
    const starts = fromLocalDatetime(startsAt);
    const expires = fromLocalDatetime(expiresAt);
    if (
      typeof starts === "number" &&
      typeof expires === "number" &&
      expires <= starts
    ) {
      toast.error("Expiration must be after start date.");
      return;
    }

    setSubmitting(true);
    try {
      const id = await createCoupon({
        code: trimmedCode,
        status,
        discountType,
        amount: amountNum,
        duration,
        durationMonths:
          duration === "n_months" ? Number(durationMonths) : undefined,
        maxRedemptions: maxRedemptions.trim()
          ? Math.max(0, Number(maxRedemptions) || 0)
          : undefined,
        perCustomerLimit: perCustomerLimit.trim()
          ? Math.max(0, Number(perCustomerLimit) || 0)
          : undefined,
        offerIds: offerIds.length ? offerIds : undefined,
        startsAt: starts,
        expiresAt: expires,
      });
      toast.success("Coupon created");
      navigate({
        to: "/commerce/subscriptions/coupons/$couponId/edit",
        params: { couponId: String(id) },
      });
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to create coupon",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/commerce/subscriptions/coupons"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to coupons
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">New coupon</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Discount codes applied to subscription contracts. Once redeemed,
          the code and discount type lock — plan the details carefully.
        </p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
        {/* Section: Code & status */}
        <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Identity</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Code"
              required
              helper="Case-insensitive, uppercase for display. Must be unique."
            >
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="SAVE20"
                className={cn(inputClass, "font-mono uppercase")}
                autoCapitalize="characters"
              />
            </Field>
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as CouponStatus)}
                className={inputClass}
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
            </Field>
          </div>
        </section>

        {/* Section: Discount */}
        <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Discount</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Discount type" required>
              <div className="flex items-center gap-1 rounded-xl border border-border bg-background p-1">
                {(["percent", "fixed"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setDiscountType(opt)}
                    className={cn(
                      "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                      discountType === opt
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {opt === "percent" ? "Percent %" : "Fixed amount"}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Amount" required helper={amountHelper}>
              <input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Duration" required>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value as Duration)}
                className={inputClass}
              >
                <option value="once">Once — applies to next invoice only</option>
                <option value="forever">Forever — applies to every invoice</option>
                <option value="n_months">N months — applies for N invoices</option>
              </select>
            </Field>
            {duration === "n_months" && (
              <Field label="Duration months" required>
                <input
                  type="number"
                  min={1}
                  value={durationMonths}
                  onChange={(e) => setDurationMonths(e.target.value)}
                  className={inputClass}
                />
              </Field>
            )}
          </div>
        </section>

        {/* Section: Limits */}
        <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Limits</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Max total redemptions"
              helper="Blank = unlimited."
            >
              <input
                type="number"
                min={0}
                value={maxRedemptions}
                onChange={(e) => setMaxRedemptions(e.target.value)}
                placeholder="Unlimited"
                className={inputClass}
              />
            </Field>
            <Field
              label="Per-customer limit"
              helper="How many contracts a single user may redeem on. Blank = unlimited."
            >
              <input
                type="number"
                min={0}
                value={perCustomerLimit}
                onChange={(e) => setPerCustomerLimit(e.target.value)}
                placeholder="Unlimited"
                className={inputClass}
              />
            </Field>
            <Field label="Starts at" helper="Blank = effective immediately.">
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Expires at" helper="Blank = never expires.">
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        </section>

        {/* Section: Scope */}
        <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Scope</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Restrict this coupon to specific offers. Leave empty to apply
              to any offer.
            </p>
          </div>
          {offers === undefined ? (
            <div className="h-16 animate-pulse rounded-xl bg-muted" />
          ) : offers === null || offers.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No active offers. The coupon will apply to any offer when
              redeemed.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {offers.map((o) => {
                const selected = offerIds.includes(o._id);
                return (
                  <button
                    key={o._id}
                    type="button"
                    onClick={() => toggleOffer(o._id)}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                      selected
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border bg-background text-foreground hover:bg-muted",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{o.title}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        /{o.slug}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={selected}
                      readOnly
                      className="h-4 w-4 rounded border-border text-primary"
                    />
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Actions */}
        <div className="flex items-center gap-3 border-t border-border pt-4">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {submitting ? "Creating…" : "Create coupon"}
          </button>
          <Link
            to="/commerce/subscriptions/coupons"
            className="inline-flex rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
