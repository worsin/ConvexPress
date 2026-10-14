/**
 * CouponEditor — create or edit a subscription coupon: the code customers
 * type, the discount (percent or an amount), how many billing periods it
 * applies to, limits, the offers it is good for, and when it runs.
 *
 * Codes are capitals (customers may type them in any case). Once a coupon has
 * been redeemed its code and discount type are fixed; the editor shows that
 * from the start. A sentence states the coupon as a customer would read it.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import type { FunctionReturnType } from "convex/server";
import { toast } from "sonner";
import { Archive, Pause, Play, Save, Shuffle } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn, getErrorMessage } from "@/lib/utils";
import { formatDate, formatMoney } from "@/components/subscriptions/billingFormat";

import { Field, inputClass, MoneyInput, Section, wholeNumber } from "./fields";

export type CouponEditorData = NonNullable<FunctionReturnType<typeof api.commerceSubscriptions.adminCatalog.getCouponEditor>>;
type DiscountType = CouponEditorData["discountType"];
type Duration = CouponEditorData["duration"];
type CouponStatus = CouponEditorData["status"];

const CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/;

/** yyyy-mm-dd in local time ⇄ a timestamp at the start (or end) of that day. */
function toDateInput(timestamp: number | undefined): string {
  if (timestamp === undefined) return "";
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function fromDateInput(text: string, endOfDay: boolean): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
  const [year, month, day] = text.split("-").map(Number);
  return endOfDay ? new Date(year, month - 1, day, 23, 59, 59, 999).getTime() : new Date(year, month - 1, day).getTime();
}

function randomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

/** "20% off for 3 months on Launch, until Dec 31, 2026 — 50 uses." */
export function describeCoupon(input: {
  discountType: DiscountType;
  amount: number | undefined;
  currencyCode: string;
  duration: Duration;
  durationMonths: number | undefined;
  offerTitles: string[];
  expiresAt: number | undefined;
  maxRedemptions: number | undefined;
}): string {
  const off =
    input.amount === undefined
      ? "A discount"
      : input.discountType === "percent"
        ? `${input.amount}% off`
        : `${formatMoney(input.amount, input.currencyCode)} off`;
  const span =
    input.duration === "once"
      ? "the first payment"
      : input.duration === "forever"
        ? "every payment"
        : `${input.durationMonths ?? "?"} billing period${input.durationMonths === 1 ? "" : "s"}`;
  const scope = input.offerTitles.length === 0 ? "any offer" : input.offerTitles.join(", ");
  const until = input.expiresAt ? `, until ${formatDate(input.expiresAt)}` : "";
  const uses = input.maxRedemptions ? ` — ${input.maxRedemptions} uses` : "";
  return `${off} ${input.duration === "once" ? "" : "for "}${span} on ${scope}${until}${uses}.`.replace("  ", " ");
}

export function CouponEditor({ existing }: { existing?: CouponEditorData }) {
  const navigate = useNavigate();
  const createCoupon = useMutation(api.commerceSubscriptions.coupons.createCoupon);
  const updateCoupon = useMutation(api.commerceSubscriptions.coupons.updateCoupon);
  const archiveCoupon = useMutation(api.commerceSubscriptions.coupons.archiveCoupon);
  const offers = useQuery(api.commerceSubscriptions.adminCatalog.listOfferRows, {});

  const redeemed = (existing?.redemptions ?? 0) > 0;
  const [code, setCode] = useState(existing?.code ?? "");
  const [discountType, setDiscountType] = useState<DiscountType>(existing?.discountType ?? "percent");
  const [percentText, setPercentText] = useState(existing?.discountType === "percent" ? String(existing.amount) : "");
  const [fixedAmount, setFixedAmount] = useState<number | undefined>(existing?.discountType === "fixed" ? existing.amount : undefined);
  const [duration, setDuration] = useState<Duration>(existing?.duration ?? "once");
  const [monthsText, setMonthsText] = useState(existing?.durationMonths ? String(existing.durationMonths) : "3");
  const [maxText, setMaxText] = useState(existing?.maxRedemptions ? String(existing.maxRedemptions) : "");
  const [perCustomerText, setPerCustomerText] = useState(existing?.perCustomerLimit ? String(existing.perCustomerLimit) : "1");
  const [offerIds, setOfferIds] = useState<Array<Id<"commerce_subscription_offers">>>(existing?.offerIds ?? []);
  const [startsText, setStartsText] = useState(toDateInput(existing?.startsAt));
  const [expiresText, setExpiresText] = useState(toDateInput(existing?.expiresAt));
  const [status, setStatus] = useState<CouponStatus>(existing?.status ?? "active");
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const sellable = (offers ?? []).filter((offer) => offer.status !== "archived" || offerIds.includes(offer._id));
  const chosenOffers = sellable.filter((offer) => offerIds.includes(offer._id));
  const currencyCode = chosenOffers[0]?.currencyCode ?? sellable[0]?.currencyCode ?? "USD";
  const percent = wholeNumber(percentText);
  const amount = discountType === "percent" ? (percent === undefined || Number.isNaN(percent) ? undefined : percent) : fixedAmount;
  const months = wholeNumber(monthsText);
  const maxRedemptions = wholeNumber(maxText);
  const perCustomer = wholeNumber(perCustomerText);
  const startsAt = fromDateInput(startsText, false);
  const expiresAt = fromDateInput(expiresText, true);

  const errors = {
    code: CODE_PATTERN.test(code) ? undefined : "3 to 32 letters, digits, hyphens or underscores.",
    amount:
      discountType === "percent"
        ? percent === undefined || Number.isNaN(percent) || percent < 1 || percent > 100
          ? "1 to 100 percent."
          : undefined
        : fixedAmount === undefined || fixedAmount <= 0
          ? "Enter an amount, like 25.00."
          : undefined,
    months: duration === "n_months" && (months === undefined || Number.isNaN(months) || months < 1 || months > 120) ? "1 to 120 periods." : undefined,
    max: maxRedemptions !== undefined && (Number.isNaN(maxRedemptions) || maxRedemptions < 1) ? "Blank for unlimited, or 1 or more." : undefined,
    perCustomer: perCustomer !== undefined && (Number.isNaN(perCustomer) || perCustomer < 1) ? "Blank for unlimited, or 1 or more." : undefined,
    dates: startsAt !== undefined && expiresAt !== undefined && expiresAt <= startsAt ? "It must end after it starts." : undefined,
  };
  const valid = Object.values(errors).every((error) => error === undefined);
  const optionalCount = (value: number | undefined) => (value === undefined || Number.isNaN(value) ? undefined : value);

  async function save() {
    setShowErrors(true);
    if (!valid || amount === undefined) return;
    const terms = {
      amount,
      duration,
      durationMonths: duration === "n_months" ? optionalCount(months) : undefined,
      maxRedemptions: optionalCount(maxRedemptions),
      perCustomerLimit: optionalCount(perCustomer),
      offerIds,
      startsAt,
      expiresAt,
      status,
    };
    setSaving(true);
    try {
      if (existing) {
        // Blank fields clear what was set (null), rather than leaving it.
        await updateCoupon({
          couponId: existing._id,
          ...terms,
          durationMonths: terms.durationMonths ?? null,
          maxRedemptions: terms.maxRedemptions ?? null,
          perCustomerLimit: terms.perCustomerLimit ?? null,
          startsAt: terms.startsAt ?? null,
          expiresAt: terms.expiresAt ?? null,
          ...(redeemed ? {} : { code, discountType }),
        });
        toast.success("Coupon saved");
      } else {
        const couponId = await createCoupon({ code, discountType, ...terms });
        toast.success(`Coupon ${code} created`);
        void navigate({ to: "/commerce/subscriptions/coupons/$couponId/edit", params: { couponId } });
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "The coupon could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!existing) return;
    try {
      await archiveCoupon({ couponId: existing._id });
      setStatus("archived");
      toast.success("Coupon archived. Customers already using it keep their discount.");
    } catch (error) {
      toast.error(getErrorMessage(error, "The coupon could not be archived."));
    }
  }

  const lockText = redeemed ? `Fixed: redeemed ${existing?.redemptions} time${existing?.redemptions === 1 ? "" : "s"}.` : undefined;

  return (
    <form
      className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="space-y-6">
        <Section title="Code and discount">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code" htmlFor="coupon-code" required error={showErrors ? errors.code : undefined} locked={lockText} helper="Customers can type it in any case.">
              <div className="flex gap-2">
                <input
                  id="coupon-code"
                  value={code}
                  disabled={redeemed}
                  onChange={(event) => setCode(event.target.value.toUpperCase().replace(/\s+/g, ""))}
                  placeholder="WELCOME20"
                  className={cn(inputClass, "font-mono tracking-wider")}
                />
                {!redeemed ? (
                  <button type="button" onClick={() => setCode(randomCode())} className="rounded-xl border border-border px-3 hover:bg-muted" aria-label="Generate a code">
                    <Shuffle className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </Field>
            <Field label="Discount" htmlFor="coupon-amount" required error={showErrors ? errors.amount : undefined}>
              <div className="flex gap-2">
                <select
                  value={discountType}
                  disabled={redeemed}
                  aria-label="Discount type"
                  onChange={(event) => setDiscountType(event.target.value === "fixed" ? "fixed" : "percent")}
                  className={cn(inputClass, "w-36")}
                >
                  <option value="percent">Percent</option>
                  <option value="fixed">Amount</option>
                </select>
                {discountType === "percent" ? (
                  <div className="relative flex-1">
                    <input id="coupon-amount" inputMode="numeric" value={percentText} onChange={(event) => setPercentText(event.target.value)} placeholder="20" className={cn(inputClass, "pr-8")} />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                  </div>
                ) : (
                  <div className="flex-1">
                    <MoneyInput id="coupon-amount" value={fixedAmount} currencyCode={currencyCode} onChange={(next) => setFixedAmount(next)} />
                  </div>
                )}
              </div>
            </Field>
            <Field label="Applies to" htmlFor="coupon-duration" error={showErrors ? errors.months : undefined} className="sm:col-span-2">
              <div className="flex flex-wrap gap-2">
                <select
                  id="coupon-duration"
                  value={duration}
                  onChange={(event) => setDuration(event.target.value === "forever" ? "forever" : event.target.value === "n_months" ? "n_months" : "once")}
                  className={cn(inputClass, "w-auto")}
                >
                  <option value="once">The first payment</option>
                  <option value="n_months">A number of billing periods</option>
                  <option value="forever">Every payment</option>
                </select>
                {duration === "n_months" ? (
                  <input inputMode="numeric" aria-label="Billing periods" value={monthsText} onChange={(event) => setMonthsText(event.target.value)} className={cn(inputClass, "w-24")} />
                ) : null}
              </div>
            </Field>
          </div>
        </Section>

        <Section title="Offers" description="Leave all unticked for a coupon that works on any offer.">
          {offers === undefined ? (
            <div className="h-16 animate-pulse rounded-xl bg-muted" />
          ) : sellable.length === 0 ? (
            <p className="text-xs text-muted-foreground">No offers yet.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {sellable.map((offer) => (
                <label key={offer._id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-background px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={offerIds.includes(offer._id)}
                    onChange={(event) =>
                      setOfferIds(event.target.checked ? [...offerIds, offer._id] : offerIds.filter((id) => id !== offer._id))
                    }
                    className="h-4 w-4 rounded border-border"
                  />
                  <span className="flex-1">{offer.title}</span>
                  <span className="text-xs text-muted-foreground">{formatMoney(offer.recurringAmount, offer.currencyCode)}</span>
                </label>
              ))}
            </div>
          )}
        </Section>

        <Section title="Limits and dates">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Total uses" htmlFor="coupon-max" error={showErrors ? errors.max : undefined} helper="Blank for unlimited.">
              <input id="coupon-max" inputMode="numeric" value={maxText} onChange={(event) => setMaxText(event.target.value)} placeholder="Unlimited" className={inputClass} />
            </Field>
            <Field label="Uses per customer" htmlFor="coupon-per-customer" error={showErrors ? errors.perCustomer : undefined} helper="Blank for unlimited.">
              <input id="coupon-per-customer" inputMode="numeric" value={perCustomerText} onChange={(event) => setPerCustomerText(event.target.value)} placeholder="Unlimited" className={inputClass} />
            </Field>
            <Field label="Starts" htmlFor="coupon-starts" helper="Blank: works now.">
              <input id="coupon-starts" type="date" value={startsText} onChange={(event) => setStartsText(event.target.value)} className={inputClass} />
            </Field>
            <Field label="Ends" htmlFor="coupon-ends" error={showErrors ? errors.dates : undefined} helper="Blank: no end. Works through the whole day.">
              <input id="coupon-ends" type="date" value={expiresText} onChange={(event) => setExpiresText(event.target.value)} className={inputClass} />
            </Field>
          </div>
        </Section>

        {existing && existing.recentRedemptions.length > 0 ? (
          <Section title="Recent redemptions">
            <ul className="divide-y divide-border text-sm">
              {existing.recentRedemptions.map((redemption) => (
                <li key={`${redemption.contractId}-${redemption.redeemedAt}`} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>{redemption.customerEmail ?? "Customer"}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(redemption.redeemedAt)} · {redemption.remainingApplications >= 9999 ? "applies to every payment" : `${redemption.remainingApplications} payment${redemption.remainingApplications === 1 ? "" : "s"} left`}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>

      <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <div className="space-y-2 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{code || "NEW COUPON"}</p>
          <p className="text-sm">
            {describeCoupon({
              discountType,
              amount,
              currencyCode,
              duration,
              durationMonths: optionalCount(months),
              offerTitles: chosenOffers.map((offer) => offer.title),
              expiresAt,
              maxRedemptions: optionalCount(maxRedemptions),
            })}
          </p>
          {existing ? (
            <p className="text-xs text-muted-foreground">
              Used {existing.redemptions} time{existing.redemptions === 1 ? "" : "s"}
              {existing.maxRedemptions ? ` of ${existing.maxRedemptions}` : ""}.
            </p>
          ) : null}
        </div>
        <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          {status !== "archived" ? (
            <div className="flex gap-2" role="radiogroup" aria-label="Status">
              {(["active", "paused"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={status === value}
                  onClick={() => setStatus(value)}
                  className={cn(
                    "inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium",
                    status === value ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted",
                  )}
                >
                  {value === "active" ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                  {value === "active" ? "Active" : "Paused"}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Archived: customers can no longer use it.</p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            <Save className="h-4 w-4" /> {saving ? "Saving…" : existing ? "Save coupon" : "Create coupon"}
          </button>
          {existing && status !== "archived" ? (
            <button type="button" onClick={() => void archive()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-2 text-sm hover:bg-muted">
              <Archive className="h-4 w-4" /> Archive coupon
            </button>
          ) : null}
        </div>
      </aside>
    </form>
  );
}
