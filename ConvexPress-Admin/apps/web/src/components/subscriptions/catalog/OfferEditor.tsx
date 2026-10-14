/**
 * OfferEditor — create or edit a subscription offer (the package customers
 * buy: "Launch — $299/month").
 *
 * Prices are typed in the currency's units and stored as minor units. When
 * live contracts bill on the offer, its price, setup fee, currency and
 * template are locked (they are what those customers agreed to); the editor
 * says so up front, from `adminCatalog.getOfferEditor`, instead of after a
 * refused save. A summary shows what a customer will see as it is edited.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import type { FunctionReturnType } from "convex/server";
import { toast } from "sonner";
import { Archive, Info, Save, ShieldCheck, X } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn, getErrorMessage } from "@/lib/utils";
import { FeaturesRepeater, type FeatureItem } from "@/components/subscriptions/FeaturesRepeater";
import { formatCadence, formatMoney } from "@/components/subscriptions/billingFormat";

import { Field, inputClass, MoneyInput, Section, slugify, SLUG_PATTERN, ToggleRow, wholeNumber } from "./fields";

export type OfferEditorData = NonNullable<FunctionReturnType<typeof api.commerceSubscriptions.adminCatalog.getOfferEditor>>;
type OfferStatus = OfferEditorData["offer"]["status"];

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"];

interface OfferEditorProps {
  /** Absent: create a new offer. */
  existing?: OfferEditorData;
}

export function OfferEditor({ existing }: OfferEditorProps) {
  const navigate = useNavigate();
  const createOffer = useMutation(api.commerceSubscriptions.offers.createOffer);
  const updateOffer = useMutation(api.commerceSubscriptions.offers.updateOffer);
  const archiveOffer = useMutation(api.commerceSubscriptions.offers.archiveOffer);
  const templates = useQuery(api.commerceSubscriptions.adminCatalog.listTemplateRows, {});
  const plans = useQuery(api.membership.queries.listPlans, {});

  const offer = existing?.offer;
  const locked = new Set(existing?.lockedFields ?? []);
  const lockReason =
    existing && existing.usage.liveContracts > 0
      ? `Locked: ${existing.usage.liveContracts} live contract${existing.usage.liveContracts === 1 ? "" : "s"} bill on this. Create a new offer to sell a different price.`
      : undefined;

  const [title, setTitle] = useState(offer?.title ?? "");
  const [slug, setSlug] = useState(offer?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(offer));
  const [status, setStatus] = useState<OfferStatus>(offer?.status ?? "draft");
  const [publicSummary, setPublicSummary] = useState(offer?.publicSummary ?? "");
  const [description, setDescription] = useState(offer?.description ?? "");
  const [templateId, setTemplateId] = useState<Id<"commerce_subscription_templates"> | "">(offer?.templateId ?? "");
  const [currencyCode, setCurrencyCode] = useState(offer?.currencyCode ?? "USD");
  const [recurringAmount, setRecurringAmount] = useState<number | undefined>(offer?.recurringAmount);
  const [setupFeeAmount, setSetupFeeAmount] = useState<number | undefined>(offer?.setupFeeAmount);
  const [trialText, setTrialText] = useState(offer?.trialDaysOverride === undefined ? "" : String(offer.trialDaysOverride));
  const [availableInDirectForms, setAvailableInDirectForms] = useState(offer?.availableInDirectForms ?? true);
  const [availableInCart, setAvailableInCart] = useState(offer?.availableInCart ?? false);
  const [availableForAdminProvisioning, setAvailableForAdminProvisioning] = useState(offer?.availableForAdminProvisioning ?? true);
  const [limitOnePerCustomer, setLimitOnePerCustomer] = useState(offer?.limitOnePerCustomer ?? false);
  const [pricingCardVisible, setPricingCardVisible] = useState(offer?.pricingCardVisible ?? true);
  const [codes, setCodes] = useState<string[]>(offer?.entitlementCodes ?? []);
  const [codeDraft, setCodeDraft] = useState("");
  const [features, setFeatures] = useState<FeatureItem[]>(offer?.features ?? []);
  const [saving, setSaving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const template = templates?.find((row) => row._id === templateId);
  const trialDays = wholeNumber(trialText);
  const effectiveTrial = trialDays === undefined ? template?.trialDays : trialDays;
  const activeTemplates = (templates ?? []).filter((row) => row.status === "active" || row._id === offer?.templateId);
  const linkedPlans = useMemo(
    () => (plans ?? []).filter((plan) => plan.linkedSubscriptionCode !== undefined && codes.includes(plan.linkedSubscriptionCode)),
    [plans, codes],
  );

  const errors = {
    title: title.trim() ? undefined : "A title is required.",
    slug: SLUG_PATTERN.test(slug) ? undefined : "Lowercase letters, digits and single hyphens.",
    template: templateId ? undefined : "Choose the template this offer bills on.",
    price: recurringAmount === undefined ? "Enter a price, like 299.00." : undefined,
    trial: trialDays !== undefined && (Number.isNaN(trialDays) || trialDays > 365) ? "A trial is 0 to 365 whole days." : undefined,
  };
  const valid = Object.values(errors).every((error) => error === undefined);

  function addCode() {
    const code = codeDraft.trim();
    if (code && !codes.includes(code)) setCodes([...codes, code]);
    setCodeDraft("");
  }

  async function save() {
    setShowErrors(true);
    if (!valid || recurringAmount === undefined || templateId === "") return;
    setSaving(true);
    const trial = trialDays === undefined || Number.isNaN(trialDays) ? undefined : trialDays;
    try {
      if (offer) {
        await updateOffer({
          offerId: offer._id,
          title: title.trim(),
          slug,
          status,
          publicSummary: publicSummary.trim(),
          description: description.trim(),
          trialDaysOverride: trial ?? null,
          availableInDirectForms,
          availableInCart,
          availableForAdminProvisioning,
          limitOnePerCustomer,
          pricingCardVisible,
          entitlementCodes: codes,
          features,
          ...(locked.size === 0
            ? { templateId, currencyCode, recurringAmount, setupFeeAmount: setupFeeAmount ?? 0 }
            : {}),
        });
        toast.success("Offer saved");
      } else {
        const offerId = await createOffer({
          title: title.trim(),
          slug,
          status,
          templateId,
          sourceType: "custom",
          publicSummary: publicSummary.trim() || undefined,
          description: description.trim() || undefined,
          currencyCode,
          recurringAmount,
          setupFeeAmount: setupFeeAmount || undefined,
          trialDaysOverride: trial,
          availableInDirectForms,
          availableInCart,
          availableForAdminProvisioning,
          limitOnePerCustomer,
          pricingCardVisible,
          entitlementCodes: codes.length > 0 ? codes : undefined,
          features: features.length > 0 ? features : undefined,
        });
        toast.success("Offer created");
        void navigate({ to: "/commerce/subscriptions/offers/$offerId/edit", params: { offerId } });
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "The offer could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!offer) return;
    try {
      await archiveOffer({ offerId: offer._id });
      toast.success("Offer archived. Existing contracts keep billing; nobody new can buy it.");
      setStatus("archived");
      setConfirmArchive(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "The offer could not be archived."));
    }
  }

  return (
    <form
      className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="space-y-6">
        {lockReason ? (
          <div className="flex gap-3 rounded-2xl border border-border bg-muted/40 p-4 text-sm" role="note">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p>
              {existing?.usage.liveContracts} customer{existing?.usage.liveContracts === 1 ? " is" : "s are"} subscribed to this offer, so its
              price, setup fee, currency and template stay as they agreed. Everything else (wording, features, where it is sold) can change.
            </p>
          </div>
        ) : null}

        <Section title="What customers buy" description="The name and copy shown on pricing cards and at checkout.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" htmlFor="offer-title" required error={showErrors ? errors.title : undefined}>
              <input
                id="offer-title"
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  if (!slugEdited) setSlug(slugify(event.target.value));
                }}
                placeholder="Growth"
                className={inputClass}
              />
            </Field>
            <Field label="Slug" htmlFor="offer-slug" required error={showErrors ? errors.slug : undefined} helper="Used in links and forms.">
              <input
                id="offer-slug"
                value={slug}
                onChange={(event) => {
                  setSlugEdited(true);
                  setSlug(event.target.value);
                }}
                className={cn(inputClass, "font-mono")}
              />
            </Field>
            <Field label="Summary" htmlFor="offer-summary" className="sm:col-span-2" helper="One line under the title on the pricing card.">
              <input
                id="offer-summary"
                value={publicSummary}
                onChange={(event) => setPublicSummary(event.target.value)}
                placeholder="For practices getting serious about growth"
                className={inputClass}
              />
            </Field>
            <Field label="Internal note" htmlFor="offer-description" className="sm:col-span-2" helper="Only staff see this.">
              <textarea
                id="offer-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={2}
                className={cn(inputClass, "h-auto")}
              />
            </Field>
          </div>
        </Section>

        <Section title="Price and billing" description="What the customer pays and how often. The template sets the cadence, grace and retry schedule.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Template"
              htmlFor="offer-template"
              required
              className="sm:col-span-2"
              error={showErrors ? errors.template : undefined}
              locked={locked.has("templateId") ? lockReason : undefined}
            >
              {templates === undefined ? (
                <div className="h-10 animate-pulse rounded-xl bg-muted" />
              ) : activeTemplates.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No active template yet.{" "}
                  <Link to="/commerce/subscriptions/templates/new" className="font-medium text-foreground underline">
                    Create one
                  </Link>{" "}
                  first; it sets how often customers are billed.
                </p>
              ) : (
                <select
                  id="offer-template"
                  value={templateId}
                  disabled={locked.has("templateId")}
                  onChange={(event) => {
                    const chosen = activeTemplates.find((row) => row._id === event.target.value);
                    setTemplateId(chosen ? chosen._id : "");
                  }}
                  className={inputClass}
                >
                  <option value="">Choose a template…</option>
                  {activeTemplates.map((row) => (
                    <option key={row._id} value={row._id}>
                      {row.title} — billed {formatCadence(row.billingInterval, row.billingIntervalCount)}
                      {row.trialDays ? `, ${row.trialDays}-day trial` : ""}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Price" htmlFor="offer-price" required error={showErrors ? errors.price : undefined} locked={locked.has("recurringAmount") ? lockReason : undefined}>
              <MoneyInput
                id="offer-price"
                value={recurringAmount}
                currencyCode={currencyCode}
                disabled={locked.has("recurringAmount")}
                onChange={(next) => setRecurringAmount(next)}
              />
            </Field>
            <Field label="Currency" htmlFor="offer-currency" locked={locked.has("currencyCode") ? "Locked with the price." : undefined}>
              <select
                id="offer-currency"
                value={currencyCode}
                disabled={locked.has("currencyCode")}
                onChange={(event) => setCurrencyCode(event.target.value)}
                className={inputClass}
              >
                {[...new Set([currencyCode, ...CURRENCIES])].map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Setup fee" htmlFor="offer-setup" helper="Charged once with the first payment." locked={locked.has("setupFeeAmount") ? "Locked with the price." : undefined}>
              <MoneyInput
                id="offer-setup"
                value={setupFeeAmount}
                currencyCode={currencyCode}
                disabled={locked.has("setupFeeAmount")}
                placeholder="None"
                onChange={(next, text) => setSetupFeeAmount(text.trim() === "" ? undefined : next)}
              />
            </Field>
            <Field
              label="Free trial (days)"
              htmlFor="offer-trial"
              error={showErrors ? errors.trial : undefined}
              helper={template ? `Blank uses the template's ${template.trialDays ?? 0}-day trial.` : "Blank uses the template's trial."}
            >
              <input
                id="offer-trial"
                inputMode="numeric"
                value={trialText}
                onChange={(event) => setTrialText(event.target.value)}
                placeholder={template?.trialDays !== undefined ? String(template.trialDays) : "0"}
                className={inputClass}
              />
            </Field>
          </div>
        </Section>

        <Section title="Where it is sold">
          <div className="grid gap-2 sm:grid-cols-2">
            <ToggleRow checked={availableInDirectForms} onChange={setAvailableInDirectForms} title="Signup forms" description="Can be chosen in forms with a subscription step." />
            <ToggleRow checked={pricingCardVisible} onChange={setPricingCardVisible} title="Pricing page" description="Shown as a card on the public pricing page." />
            <ToggleRow checked={availableInCart} onChange={setAvailableInCart} title="Shop cart" description="Can be added to the shop cart (needs the shop)." />
            <ToggleRow
              checked={availableForAdminProvisioning}
              onChange={setAvailableForAdminProvisioning}
              title="Staff can assign it"
              description="Staff can put a customer on this offer."
            />
            <ToggleRow
              checked={limitOnePerCustomer}
              onChange={setLimitOnePerCustomer}
              title="One per customer"
              description="Someone who already has this access changes plan instead of buying it twice."
            />
          </div>
        </Section>

        <Section
          title="Access it grants"
          description="Entitlement codes the subscription grants while it is in good standing. A membership plan whose linked code matches is granted too."
        >
          <div className="flex flex-wrap gap-2">
            {codes.map((code) => (
              <span key={code} className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 font-mono text-xs">
                {code}
                <button type="button" aria-label={`Remove ${code}`} onClick={() => setCodes(codes.filter((entry) => entry !== code))} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              value={codeDraft}
              onChange={(event) => setCodeDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  addCode();
                }
              }}
              onBlur={addCode}
              placeholder={codes.length === 0 ? "Add a code, e.g. pro_access" : "Add another"}
              aria-label="Add entitlement code"
              className="min-w-[180px] flex-1 rounded-full border border-dashed border-border bg-transparent px-3 py-1 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {plans === null ? null : linkedPlans.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {linkedPlans.map((plan) => (
                <span key={plan._id} className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                  <ShieldCheck className="h-3 w-3" /> {plan.title} membership
                </span>
              ))}
            </div>
          ) : codes.length > 0 ? (
            <p className="text-xs text-muted-foreground">No membership plan is linked to these codes.</p>
          ) : null}
        </Section>

        <Section title="Features" description="The checklist on the pricing card.">
          <FeaturesRepeater value={features} onChange={setFeatures} disabled={saving} />
        </Section>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Customers see</p>
          <p className="text-lg font-semibold">{title.trim() || "Untitled offer"}</p>
          {publicSummary.trim() ? <p className="text-sm text-muted-foreground">{publicSummary.trim()}</p> : null}
          <p>
            <span className="text-2xl font-semibold tabular-nums">{recurringAmount === undefined ? "—" : formatMoney(recurringAmount, currencyCode)}</span>{" "}
            <span className="text-sm text-muted-foreground">{template ? formatCadence(template.billingInterval, template.billingIntervalCount) : ""}</span>
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {effectiveTrial ? <li>{effectiveTrial}-day free trial</li> : null}
            {setupFeeAmount ? <li>{formatMoney(setupFeeAmount, currencyCode)} setup fee with the first payment</li> : null}
            {template ? <li>Cancel any time; access runs to the end of the paid period</li> : null}
          </ul>
        </div>

        <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <Field label="Status" htmlFor="offer-status" helper={status === "draft" ? "Drafts are not sold anywhere." : status === "archived" ? "Not sold; existing contracts keep billing." : "On sale where enabled."}>
            <select id="offer-status" value={status} onChange={(event) => setStatus(event.target.value === "active" ? "active" : event.target.value === "archived" ? "archived" : "draft")} className={inputClass}>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              {offer ? <option value="archived">Archived</option> : null}
            </select>
          </Field>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            <Save className="h-4 w-4" /> {saving ? "Saving…" : offer ? "Save offer" : "Create offer"}
          </button>
          {existing ? (
            <p className="text-xs text-muted-foreground">
              {existing.usage.totalContracts === 0
                ? "No one has subscribed yet."
                : `${existing.usage.liveContracts} live of ${existing.usage.totalContracts} contract${existing.usage.totalContracts === 1 ? "" : "s"} ever sold.`}
            </p>
          ) : null}
          {offer && status !== "archived" ? (
            confirmArchive ? (
              <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs">
                <p>Stop selling this offer? Customers already on it keep their subscription.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void archive()} className="rounded-lg bg-destructive px-3 py-1.5 font-medium text-destructive-foreground">
                    Archive
                  </button>
                  <button type="button" onClick={() => setConfirmArchive(false)} className="rounded-lg border border-border px-3 py-1.5">
                    Keep selling
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmArchive(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-2 text-sm hover:bg-muted"
              >
                <Archive className="h-4 w-4" /> Archive offer
              </button>
            )
          ) : null}
        </div>
      </aside>
    </form>
  );
}
