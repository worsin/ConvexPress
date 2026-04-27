/**
 * Edit Subscription Coupon.
 *
 * Immutability invariant (backend-enforced in
 * `commerceSubscriptions.coupons.updateCoupon`):
 *   Once ANY redemption exists for a coupon, the following fields LOCK:
 *     - code
 *     - discountType
 *   All other fields remain editable.
 *
 * The UI keeps both fields editable on first load; if a save attempt
 * returns IMMUTABLE_FIELD, the affected fields are disabled with a
 * padlock indicator and a banner prompts the user to archive + recreate
 * for repricing.
 */

import { useEffect, useMemo, useState } from "react";
import {
  createFileRoute,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { toast } from "sonner";
import { Archive, ArrowLeft, Lock, Save } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/subscriptions/coupons/$couponId/edit",
)({
  component: EditCouponPage,
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
  locked,
}: {
  label: string;
  required?: boolean;
  helper?: string;
  className?: string;
  children: React.ReactNode;
  locked?: boolean;
}) {
  return (
    <div className={className}>
      <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
        {locked && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            <Lock className="h-2.5 w-2.5" />
            locked
          </span>
        )}
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
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDatetime(str: string): number | undefined {
  if (!str) return undefined;
  const t = new Date(str).getTime();
  return Number.isFinite(t) ? t : undefined;
}

function EditCouponPage() {
  const { couponId } = Route.useParams();
  const navigate = useNavigate();

  const coupon = useQuery(
    (api as any).commerceSubscriptions.coupons.getCoupon,
    { couponId: couponId as Id<"commerce_subscription_coupons"> },
  ) as
    | {
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
      }
    | null
    | undefined;

  const offers = useQuery(
    (api as any).commerceSubscriptions.offers.listOffers,
    {},
  ) as
    | Array<{
        _id: Id<"commerce_subscription_offers">;
        title: string;
        slug: string;
        status: "draft" | "active" | "archived";
      }>
    | null
    | undefined;

  const updateCoupon = useMutation(
    (api as any).commerceSubscriptions.coupons.updateCoupon,
  );
  const archiveCoupon = useMutation(
    (api as any).commerceSubscriptions.coupons.archiveCoupon,
  );

  const [code, setCode] = useState("");
  const [status, setStatus] = useState<CouponStatus>("active");
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [amount, setAmount] = useState("0");
  const [duration, setDuration] = useState<Duration>("once");
  const [durationMonths, setDurationMonths] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [perCustomerLimit, setPerCustomerLimit] = useState("");
  const [offerIds, setOfferIds] = useState<
    Array<Id<"commerce_subscription_offers">>
  >([]);
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  // Soft-lock: true when the last save attempt returned IMMUTABLE_FIELD.
  const [immutableLocked, setImmutableLocked] = useState(false);

  useEffect(() => {
    if (!coupon) return;
    setCode(coupon.code ?? "");
    setStatus(coupon.status);
    setDiscountType(coupon.discountType);
    setAmount(String(coupon.amount ?? 0));
    setDuration(coupon.duration);
    setDurationMonths(
      coupon.durationMonths !== undefined
        ? String(coupon.durationMonths)
        : "",
    );
    setMaxRedemptions(
      coupon.maxRedemptions !== undefined
        ? String(coupon.maxRedemptions)
        : "",
    );
    setPerCustomerLimit(
      coupon.perCustomerLimit !== undefined
        ? String(coupon.perCustomerLimit)
        : "",
    );
    setOfferIds(coupon.offerIds ?? []);
    setStartsAt(toLocalDatetime(coupon.startsAt));
    setExpiresAt(toLocalDatetime(coupon.expiresAt));
  }, [coupon]);

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

  if (coupon === undefined) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (coupon === null) {
    return (
      <div className="space-y-4">
        <Link
          to="/commerce/subscriptions/coupons"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to coupons
        </Link>
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Coupon not found or plugin disabled.
          </p>
        </div>
      </div>
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
      await updateCoupon({
        couponId: coupon._id,
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
      toast.success("Coupon saved");
      setImmutableLocked(false);
    } catch (error) {
      const err = error as {
        data?: { message?: string; code?: string };
      };
      if (err?.data?.code === "IMMUTABLE_FIELD") {
        setImmutableLocked(true);
        toast.error(
          err.data.message ??
            "Code and discount type are locked — this coupon has been redeemed.",
        );
      } else {
        toast.error(err?.data?.message ?? "Failed to save coupon");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive() {
    setArchiving(true);
    try {
      await archiveCoupon({ couponId: coupon._id });
      toast.success("Coupon archived");
      navigate({ to: "/commerce/subscriptions/coupons" });
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to archive coupon",
      );
      setArchiving(false);
      setConfirmArchive(false);
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
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-mono text-3xl font-bold uppercase tracking-tight text-foreground">
              {coupon.code}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Created {new Date(coupon.createdAt).toLocaleDateString("en-US")}
            </p>
          </div>
          <span
            className={cn(
              "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
              coupon.status === "active"
                ? "bg-primary/15 text-primary"
                : coupon.status === "archived"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {coupon.status}
          </span>
        </div>
      </div>

      {immutableLocked && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-destructive">
            <Lock className="h-4 w-4" />
            Code and discount type are locked
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            This coupon has been redeemed by at least one contract. Archive
            this coupon and create a new one to change code or discount
            type. Amount, duration, caps, and scope remain editable.
          </p>
        </div>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
        {/* Section: Identity */}
        <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Identity</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Code"
              required
              locked={immutableLocked}
              helper={
                immutableLocked
                  ? undefined
                  : "Case-insensitive, uppercase for display."
              }
            >
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                disabled={immutableLocked}
                className={cn(inputClass, "font-mono uppercase")}
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
                <option value="archived">Archived</option>
              </select>
            </Field>
          </div>
        </section>

        {/* Section: Discount */}
        <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Discount</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Discount type" required locked={immutableLocked}>
              <div
                className={cn(
                  "flex items-center gap-1 rounded-xl border border-border bg-background p-1",
                  immutableLocked && "opacity-50",
                )}
              >
                {(["percent", "fixed"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    disabled={immutableLocked}
                    onClick={() => setDiscountType(opt)}
                    className={cn(
                      "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed",
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
            <Field label="Max total redemptions" helper="Blank = unlimited.">
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
              Restrict this coupon to specific offers. Empty = applies to any
              offer.
            </p>
          </div>
          {offers === undefined ? (
            <div className="h-16 animate-pulse rounded-xl bg-muted" />
          ) : offers === null || offers.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No offers available — coupon will apply to any offer when
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
                        /{o.slug} · {o.status}
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
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <button
            type="submit"
            disabled={submitting || coupon.status === "archived"}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {submitting ? "Saving…" : "Save changes"}
          </button>
          <Link
            to="/commerce/subscriptions/coupons"
            className="inline-flex rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </Link>
          <div className="ml-auto">
            {coupon.status !== "archived" && !confirmArchive && (
              <button
                type="button"
                onClick={() => setConfirmArchive(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <Archive className="h-4 w-4" />
                Archive coupon
              </button>
            )}
          </div>
        </div>

        {confirmArchive && (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-destructive">
              Archive coupon{" "}
              <strong className="font-mono">{coupon.code}</strong>?
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Already-issued redemptions continue to apply to their contracts
              until their remaining applications hit zero. New redemptions
              are blocked.
            </p>
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                onClick={() => void handleArchive()}
                disabled={archiving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-60"
              >
                <Archive className="h-4 w-4" />
                {archiving ? "Archiving…" : "Archive"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmArchive(false)}
                className="inline-flex rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
