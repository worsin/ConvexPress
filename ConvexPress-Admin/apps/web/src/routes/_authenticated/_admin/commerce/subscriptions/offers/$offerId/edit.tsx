/**
 * Edit Subscription Offer.
 *
 * Immutability: once ANY active-ish contract references this offer,
 * the backend enforces IMMUTABLE_FIELD on:
 *   templateId, currencyCode, recurringAmount, setupFeeAmount,
 *   minimumQuantity, maximumQuantity.
 *
 * The UI surfaces the lock via disabled fields + a banner when we detect
 * the offer was created with a templateId (we can't cheaply know whether
 * a contract exists from the client, so the server returns the canonical
 * error; we trust the user to retry after archiving).
 *
 * Features, pricing-card visibility, title/description, availability
 * flags, entitlementCodes remain editable.
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
import {
  Archive,
  ArrowLeft,
  Lock,
  Save,
  ShieldCheck,
} from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import {
  FeaturesRepeater,
  type FeatureItem,
} from "@/components/subscriptions/FeaturesRepeater";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/subscriptions/offers/$offerId/edit",
)({
  component: EditSubscriptionOfferPage,
});

type OfferStatus = "draft" | "active" | "archived";

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

function EditSubscriptionOfferPage() {
  const { offerId } = Route.useParams();
  const navigate = useNavigate();

  const offer = useQuery(
    (api as any).commerceSubscriptions.offers.getOffer,
    { offerId: offerId as Id<"commerce_subscription_offers"> },
  ) as
    | {
        _id: Id<"commerce_subscription_offers">;
        title: string;
        slug: string;
        status: OfferStatus;
        templateId: Id<"commerce_subscription_templates">;
        description?: string;
        publicSummary?: string;
        currencyCode: string;
        recurringAmount: number;
        setupFeeAmount?: number;
        trialDaysOverride?: number;
        availableInCart?: boolean;
        availableInDirectForms?: boolean;
        availableForAdminProvisioning?: boolean;
        entitlementCodes?: string[];
        features?: FeatureItem[];
        pricingCardVisible?: boolean;
        createdAt: number;
      }
    | null
    | undefined;

  const templates = useQuery(
    (api as any).commerceSubscriptions.queries.listTemplates,
    {},
  ) as
    | Array<{
        _id: Id<"commerce_subscription_templates">;
        title: string;
        slug: string;
        billingInterval: "week" | "month" | "year";
        billingIntervalCount: number;
        status: OfferStatus;
      }>
    | null
    | undefined;

  const plans = useQuery((api as any).membership.queries.listPlans, {}) as
    | Array<{
        _id: Id<"membership_plans">;
        title: string;
        slug: string;
        linkedSubscriptionCode?: string;
      }>
    | null
    | undefined;

  const updateOffer = useMutation(
    (api as any).commerceSubscriptions.offers.updateOffer,
  );
  const archiveOffer = useMutation(
    (api as any).commerceSubscriptions.offers.archiveOffer,
  );

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [publicSummary, setPublicSummary] = useState("");
  const [status, setStatus] = useState<OfferStatus>("draft");
  const [templateId, setTemplateId] =
    useState<Id<"commerce_subscription_templates"> | "">("");
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [recurringAmount, setRecurringAmount] = useState("0");
  const [setupFeeAmount, setSetupFeeAmount] = useState("");
  const [trialDaysOverride, setTrialDaysOverride] = useState("");
  const [availableInCart, setAvailableInCart] = useState(true);
  const [availableInDirectForms, setAvailableInDirectForms] = useState(true);
  const [availableForAdminProvisioning, setAvailableForAdminProvisioning] =
    useState(true);
  const [entitlementCodesText, setEntitlementCodesText] = useState("");
  const [features, setFeatures] = useState<FeatureItem[]>([]);
  const [pricingCardVisible, setPricingCardVisible] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  // Soft-lock: true when the last save attempt returned IMMUTABLE_FIELD.
  // We keep the field editable until then so new offers can still be edited.
  const [immutableLocked, setImmutableLocked] = useState(false);

  useEffect(() => {
    if (!offer) return;
    setTitle(offer.title ?? "");
    setSlug(offer.slug ?? "");
    setDescription(offer.description ?? "");
    setPublicSummary(offer.publicSummary ?? "");
    setStatus(offer.status);
    setTemplateId(offer.templateId);
    setCurrencyCode(offer.currencyCode ?? "USD");
    setRecurringAmount(String(offer.recurringAmount ?? 0));
    setSetupFeeAmount(
      offer.setupFeeAmount !== undefined ? String(offer.setupFeeAmount) : "",
    );
    setTrialDaysOverride(
      offer.trialDaysOverride !== undefined
        ? String(offer.trialDaysOverride)
        : "",
    );
    setAvailableInCart(offer.availableInCart ?? true);
    setAvailableInDirectForms(offer.availableInDirectForms ?? true);
    setAvailableForAdminProvisioning(
      offer.availableForAdminProvisioning ?? true,
    );
    setEntitlementCodesText((offer.entitlementCodes ?? []).join("\n"));
    setFeatures(offer.features ?? []);
    setPricingCardVisible(offer.pricingCardVisible !== false);
  }, [offer]);

  const entitlementCodes = useMemo(
    () =>
      entitlementCodesText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    [entitlementCodesText],
  );

  const linkedPlans = useMemo(() => {
    if (!plans || !plans.length || entitlementCodes.length === 0) return [];
    const codeSet = new Set(entitlementCodes);
    return plans.filter(
      (p) => p.linkedSubscriptionCode && codeSet.has(p.linkedSubscriptionCode),
    );
  }, [plans, entitlementCodes]);

  if (offer === undefined) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (offer === null) {
    return (
      <div className="space-y-4">
        <Link
          to="/commerce/subscriptions/offers"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to offers
        </Link>
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Offer not found or plugin disabled.
          </p>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !slug.trim()) {
      toast.error("Title and slug are required.");
      return;
    }
    setSubmitting(true);
    try {
      await updateOffer({
        offerId: offer._id,
        title: title.trim(),
        slug: slug.trim(),
        status,
        templateId: templateId
          ? (templateId as Id<"commerce_subscription_templates">)
          : undefined,
        description: description.trim() || undefined,
        publicSummary: publicSummary.trim() || undefined,
        currencyCode: currencyCode.trim().toUpperCase(),
        recurringAmount: Math.max(0, Number(recurringAmount) || 0),
        setupFeeAmount: setupFeeAmount.trim()
          ? Math.max(0, Number(setupFeeAmount) || 0)
          : undefined,
        trialDaysOverride: trialDaysOverride.trim()
          ? Math.max(0, Number(trialDaysOverride) || 0)
          : undefined,
        availableInCart,
        availableInDirectForms,
        availableForAdminProvisioning,
        entitlementCodes: entitlementCodes.length ? entitlementCodes : undefined,
        features,
        pricingCardVisible,
      });
      toast.success("Offer saved");
      setImmutableLocked(false);
    } catch (error) {
      const err = error as {
        data?: { message?: string; code?: string };
      };
      if (err?.data?.code === "IMMUTABLE_FIELD") {
        setImmutableLocked(true);
        toast.error(
          err.data.message ??
            "Some fields are locked — this offer has active contracts.",
        );
      } else {
        toast.error(err?.data?.message ?? "Failed to save offer");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive() {
    setArchiving(true);
    try {
      await archiveOffer({ offerId: offer._id });
      toast.success("Offer archived");
      navigate({ to: "/commerce/subscriptions/offers" });
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to archive offer",
      );
      setArchiving(false);
      setConfirmArchive(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/commerce/subscriptions/offers"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to offers
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {offer.title}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-mono">/{offer.slug}</span>
            </p>
          </div>
          <span
            className={cn(
              "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
              offer.status === "active"
                ? "bg-primary/15 text-primary"
                : offer.status === "archived"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {offer.status}
          </span>
        </div>
      </div>

      {immutableLocked && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-destructive">
            <Lock className="h-4 w-4" />
            Price fields are locked
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            This offer has active contracts. Archive and create a new offer
            to reprice. Title, features, entitlement codes, and pricing-card
            visibility remain editable.
          </p>
        </div>
      )}

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="space-y-6"
      >
        {/* Basics */}
        <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Basics</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" required>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Slug" required>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as OfferStatus)}
                className={inputClass}
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </Field>
            <div />
            <Field label="Description" className="sm:col-span-2">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className={cn(inputClass, "h-auto py-2.5")}
              />
            </Field>
            <Field label="Public summary" className="sm:col-span-2">
              <textarea
                value={publicSummary}
                onChange={(e) => setPublicSummary(e.target.value)}
                rows={2}
                className={cn(inputClass, "h-auto py-2.5")}
              />
            </Field>
          </div>
        </section>

        {/* Template + pricing (locked if hot) */}
        <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">
            Template & pricing
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Template"
              required
              className="sm:col-span-2"
              locked={immutableLocked}
            >
              {templates === undefined ? (
                <div className="h-10 animate-pulse rounded-xl bg-muted" />
              ) : (
                <select
                  value={templateId}
                  onChange={(e) =>
                    setTemplateId(
                      e.target
                        .value as Id<"commerce_subscription_templates">,
                    )
                  }
                  disabled={immutableLocked}
                  className={inputClass}
                >
                  <option value="">Choose a template…</option>
                  {(templates ?? []).map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.title} — every {t.billingIntervalCount}{" "}
                      {t.billingInterval}
                      {t.billingIntervalCount !== 1 ? "s" : ""}
                      {t.status !== "active" ? ` (${t.status})` : ""}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Currency code" required locked={immutableLocked}>
              <input
                value={currencyCode}
                onChange={(e) =>
                  setCurrencyCode(e.target.value.toUpperCase().slice(0, 6))
                }
                disabled={immutableLocked}
                className={cn(inputClass, "font-mono")}
              />
            </Field>
            <Field
              label="Recurring amount (minor units)"
              required
              locked={immutableLocked}
            >
              <input
                type="number"
                min={0}
                value={recurringAmount}
                onChange={(e) => setRecurringAmount(e.target.value)}
                disabled={immutableLocked}
                className={inputClass}
              />
            </Field>
            <Field
              label="Setup fee (minor units)"
              locked={immutableLocked}
            >
              <input
                type="number"
                min={0}
                value={setupFeeAmount}
                onChange={(e) => setSetupFeeAmount(e.target.value)}
                disabled={immutableLocked}
                className={inputClass}
              />
            </Field>
            <Field label="Trial days override">
              <input
                type="number"
                min={0}
                value={trialDaysOverride}
                onChange={(e) => setTrialDaysOverride(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        </section>

        {/* Availability */}
        <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">
            Availability
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground">
              <input
                type="checkbox"
                checked={availableInCart}
                onChange={(e) => setAvailableInCart(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-ring"
              />
              Available in cart
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground">
              <input
                type="checkbox"
                checked={availableInDirectForms}
                onChange={(e) =>
                  setAvailableInDirectForms(e.target.checked)
                }
                className="h-4 w-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-ring"
              />
              Available in direct-to-signup forms
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground">
              <input
                type="checkbox"
                checked={availableForAdminProvisioning}
                onChange={(e) =>
                  setAvailableForAdminProvisioning(e.target.checked)
                }
                className="h-4 w-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-ring"
              />
              Available for admin provisioning
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground">
              <input
                type="checkbox"
                checked={pricingCardVisible}
                onChange={(e) => setPricingCardVisible(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-ring"
              />
              Show on the public pricing page
            </label>
          </div>
        </section>

        {/* Entitlements + linked plans */}
        <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Entitlements & linked plans
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Any membership plan with a matching{" "}
              <code className="font-mono">linkedSubscriptionCode</code> is
              granted on signup.
            </p>
          </div>
          <Field label="Entitlement codes (one per line)">
            <textarea
              value={entitlementCodesText}
              onChange={(e) => setEntitlementCodesText(e.target.value)}
              rows={3}
              className={cn(inputClass, "h-auto py-2.5 font-mono text-xs")}
            />
          </Field>
          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Linked membership plans
            </p>
            {plans === undefined ? (
              <div className="h-8 w-48 animate-pulse rounded bg-muted" />
            ) : linkedPlans.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No matching plans yet.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {linkedPlans.map((p) => (
                  <li
                    key={p._id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs"
                  >
                    <ShieldCheck className="h-3 w-3 text-primary" />
                    <span className="font-medium text-foreground">
                      {p.title}
                    </span>
                    <span className="text-muted-foreground">
                      /{p.slug} ↔ {p.linkedSubscriptionCode}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Features */}
        <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Features
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Rendered on the public pricing card.
            </p>
          </div>
          <FeaturesRepeater
            value={features}
            onChange={setFeatures}
            disabled={submitting}
          />
        </section>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {submitting ? "Saving…" : "Save changes"}
          </button>
          <Link
            to="/commerce/subscriptions/offers"
            className="inline-flex rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Back
          </Link>

          {offer.status !== "archived" && (
            <button
              type="button"
              onClick={() => setConfirmArchive(true)}
              disabled={archiving}
              className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
            >
              <Archive className="h-3.5 w-3.5" />
              Archive offer
            </button>
          )}
        </div>

        {confirmArchive && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
            <p className="font-medium text-destructive">
              Archive this offer?
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Existing contracts keep their pricing. The offer is hidden
              from the pricing page.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void handleArchive()}
                disabled={archiving}
                className="rounded-lg bg-destructive px-3 py-2 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
              >
                Yes, archive
              </button>
              <button
                type="button"
                onClick={() => setConfirmArchive(false)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
              >
                No
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
