/**
 * New Subscription Offer form.
 *
 * Fields:
 *   - title, slug, description, publicSummary
 *   - templateId (from active templates)
 *   - sourceType + productId (for now we support 'product' and 'adminProvisioned')
 *   - price in cents, currency, setup fee, trial override
 *   - availability flags
 *   - entitlementCodes[]
 *   - features[] via FeaturesRepeater
 *   - pricingCardVisible toggle
 *
 * Linked membership plans (read-only preview): any plan whose
 * `linkedSubscriptionCode` matches an entry in `entitlementCodes[]`.
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
import { ArrowLeft, Link as LinkIcon, Save, ShieldCheck } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import {
  FeaturesRepeater,
  type FeatureItem,
} from "@/components/subscriptions/FeaturesRepeater";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/subscriptions/offers/new",
)({
  component: NewSubscriptionOfferPage,
});

type OfferStatus = "draft" | "active" | "archived";
type SourceType = "product" | "variant" | "bundle" | "adminProvisioned";

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

function NewSubscriptionOfferPage() {
  const navigate = useNavigate();
  const createOffer = useMutation(
    (api as any).commerceSubscriptions.offers.createOffer,
  );

  const templates = useQuery(
    (api as any).commerceSubscriptions.queries.listTemplates,
    { status: "active" },
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

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [publicSummary, setPublicSummary] = useState("");
  const [status, setStatus] = useState<OfferStatus>("draft");
  const [templateId, setTemplateId] =
    useState<Id<"commerce_subscription_templates"> | "">("");
  const [sourceType, setSourceType] = useState<SourceType>("adminProvisioned");
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

  const entitlementCodes = useMemo(
    () =>
      entitlementCodesText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    [entitlementCodesText],
  );

  // Client-side computed linked-plan preview
  const linkedPlans = useMemo(() => {
    if (!plans || !plans.length || entitlementCodes.length === 0) return [];
    const codeSet = new Set(entitlementCodes);
    return plans.filter(
      (p) => p.linkedSubscriptionCode && codeSet.has(p.linkedSubscriptionCode),
    );
  }, [plans, entitlementCodes]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !slug.trim()) {
      toast.error("Title and slug are required.");
      return;
    }
    if (!templateId) {
      toast.error("Please pick a template.");
      return;
    }
    setSubmitting(true);
    try {
      // Convert dollar strings to cents: 25 -> 2500 is the business contract.
      // The input is expected in cents directly (backend stores cents).
      const id = await createOffer({
        title: title.trim(),
        slug: slug.trim(),
        status,
        templateId: templateId as Id<"commerce_subscription_templates">,
        description: description.trim() || undefined,
        publicSummary: publicSummary.trim() || undefined,
        sourceType,
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
        features: features.length ? features : undefined,
        pricingCardVisible,
      });
      toast.success("Offer created");
      navigate({
        to: "/commerce/subscriptions/offers/$offerId/edit",
        params: { offerId: String(id) },
      });
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to create offer",
      );
    } finally {
      setSubmitting(false);
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
        <h1 className="mt-2 text-3xl font-bold tracking-tight">New offer</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Offers are the sellable packages customers subscribe to. Amounts
          are in minor units (e.g. cents for USD).
        </p>
      </div>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="space-y-6"
      >
        {/* Section: Basics */}
        <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Basics</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" required>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Growth"
                className={inputClass}
              />
            </Field>
            <Field label="Slug" required>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="growth"
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
              </select>
            </Field>
            <Field label="Source type" helper="Where this offer is fulfilled from.">
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as SourceType)}
                className={inputClass}
              >
                <option value="adminProvisioned">Admin-provisioned</option>
                <option value="product">Product</option>
                <option value="variant">Variant</option>
                <option value="bundle">Bundle</option>
              </select>
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className={cn(inputClass, "h-auto py-2.5")}
                placeholder="Internal description (not public)."
              />
            </Field>
            <Field
              label="Public summary"
              className="sm:col-span-2"
              helper="Short marketing copy rendered on pricing cards below the title."
            >
              <textarea
                value={publicSummary}
                onChange={(e) => setPublicSummary(e.target.value)}
                rows={2}
                className={cn(inputClass, "h-auto py-2.5")}
                placeholder="E.g. 'For teams getting serious about scale'."
              />
            </Field>
          </div>
        </section>

        {/* Section: Template + pricing */}
        <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">
            Template & pricing
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Template" required className="sm:col-span-2">
              {templates === undefined ? (
                <div className="h-10 animate-pulse rounded-xl bg-muted" />
              ) : templates === null || templates.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No active templates. Create one under{" "}
                  <Link
                    to="/commerce/subscriptions/templates"
                    className="font-medium text-foreground hover:underline"
                  >
                    Templates
                  </Link>
                  .
                </p>
              ) : (
                <select
                  value={templateId}
                  onChange={(e) =>
                    setTemplateId(
                      e.target
                        .value as Id<"commerce_subscription_templates">,
                    )
                  }
                  className={inputClass}
                >
                  <option value="">Choose a template…</option>
                  {templates.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.title} — every {t.billingIntervalCount}{" "}
                      {t.billingInterval}
                      {t.billingIntervalCount !== 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Currency code" required helper="3-letter ISO (e.g. USD, EUR).">
              <input
                value={currencyCode}
                onChange={(e) =>
                  setCurrencyCode(e.target.value.toUpperCase().slice(0, 6))
                }
                className={cn(inputClass, "font-mono")}
              />
            </Field>
            <Field
              label="Recurring amount (minor units)"
              required
              helper="E.g. 2500 = $25.00 USD."
            >
              <input
                type="number"
                min={0}
                value={recurringAmount}
                onChange={(e) => setRecurringAmount(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Setup fee (minor units)" helper="One-time at signup.">
              <input
                type="number"
                min={0}
                value={setupFeeAmount}
                onChange={(e) => setSetupFeeAmount(e.target.value)}
                placeholder="0"
                className={inputClass}
              />
            </Field>
            <Field
              label="Trial days override"
              helper="Blank uses the template's trial."
            >
              <input
                type="number"
                min={0}
                value={trialDaysOverride}
                onChange={(e) => setTrialDaysOverride(e.target.value)}
                placeholder=""
                className={inputClass}
              />
            </Field>
          </div>
        </section>

        {/* Section: Availability */}
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

        {/* Section: Entitlement codes + linked plans */}
        <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Entitlements & linked plans
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Entitlement codes are string identifiers the subscription
              engine grants on activation. Any membership plan with a
              matching <code className="font-mono">linkedSubscriptionCode</code>{" "}
              is auto-granted on signup.
            </p>
          </div>
          <Field
            label="Entitlement codes (one per line)"
            helper="E.g. 'feature:reports', 'feature:team-seats'."
          >
            <textarea
              value={entitlementCodesText}
              onChange={(e) => setEntitlementCodesText(e.target.value)}
              rows={3}
              className={cn(inputClass, "h-auto py-2.5 font-mono text-xs")}
              placeholder={"feature:reports\nfeature:api-access"}
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

        {/* Section: Features */}
        <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Features
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              The feature list rendered on the pricing card.
            </p>
          </div>
          <FeaturesRepeater
            value={features}
            onChange={setFeatures}
            disabled={submitting}
          />
        </section>

        {/* Actions */}
        <div className="flex items-center gap-3 border-t border-border pt-4">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {submitting ? "Creating…" : "Create offer"}
          </button>
          <Link
            to="/commerce/subscriptions/offers"
            className="inline-flex rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
