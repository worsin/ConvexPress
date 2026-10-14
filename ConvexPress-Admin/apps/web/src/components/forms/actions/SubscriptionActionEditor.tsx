/**
 * The subscription (and one-time payment) action: which plan the form sells,
 * whose account it belongs to, coupons, and what happens after payment.
 *
 * Plans are picked by name and price, never typed as ids. A form whose plan
 * comes from a field maps each of that field's choices to a plan, and the
 * editor says which choices lead nowhere. The account section reads the
 * form's own account setting, so the operator sees how a signed-out visitor
 * is handled before saving.
 */
import { Link } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import { Field, MoneyInput, inputClass } from "@/components/subscriptions/catalog/fields";
import { formatCadence, formatMoney } from "@/components/subscriptions/billingFormat";
import { cn } from "@/lib/utils";

import type { SubscriptionConfig, SubscriptionConfigProblems } from "./actionConfig";

export type ActionEditorSetup = NonNullable<FunctionReturnType<typeof api.extensions.forms.actions.actionEditorSetup>>;
type SetupOffer = ActionEditorSetup["offers"][number];
type SetupField = ActionEditorSetup["fields"][number];

/** "Launch — $299.00 per month · 14-day free trial · $50.00 setup". */
export function offerSummary(offer: SetupOffer): string {
  const parts = [`${formatMoney(offer.recurringAmount, offer.currencyCode)} ${formatCadence(offer.billingInterval, offer.billingIntervalCount)}`];
  if (offer.trialDays > 0) parts.push(`${offer.trialDays}-day free trial`);
  if (offer.setupFeeAmount > 0) parts.push(`${formatMoney(offer.setupFeeAmount, offer.currencyCode)} setup`);
  return `${offer.title} — ${parts.join(" · ")}`;
}

function offerWarning(offer: SetupOffer | undefined): string | null {
  if (!offer) return null;
  if (offer.status === "draft") return `${offer.title} is a draft: nobody can buy it until its status is Active (Subscriptions → Offers).`;
  if (!offer.availableInDirectForms) return `${offer.title} can't be bought through forms. Turn on "Signup forms" on the offer (Subscriptions → Offers).`;
  return null;
}

function Choice({ name, checked, onSelect, title, description, disabled }: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border bg-background px-3 py-2.5",
        checked ? "border-primary ring-1 ring-primary" : "border-border",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} disabled={disabled} className="mt-1" />
      <span>
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

function Note({ tone, children }: { tone: "ok" | "warn" | "info"; children: React.ReactNode }) {
  const Icon = tone === "ok" ? CheckCircle2 : tone === "warn" ? AlertTriangle : Info;
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-xl border px-3 py-2 text-xs",
        tone === "warn" ? "border-amber-500/40 bg-amber-500/10 text-foreground" : "border-border bg-muted/30 text-muted-foreground",
      )}
    >
      <Icon className={cn("mt-0.5 size-3.5 shrink-0", tone === "warn" ? "text-amber-600" : tone === "ok" ? "text-primary" : "")} />
      <div>{children}</div>
    </div>
  );
}

function FieldPicker({ id, value, onChange, fields, placeholder }: {
  id: string;
  value: string;
  onChange: (key: string) => void;
  fields: SetupField[];
  placeholder: string;
}) {
  const known = fields.some((field) => field.key === value);
  return (
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>
      <option value="">{placeholder}</option>
      {value && !known ? <option value={value}>Missing field ({value})</option> : null}
      {fields.map((field) => (
        <option key={field.key} value={field.key}>
          {field.label || field.name}
        </option>
      ))}
    </select>
  );
}

function OfferPicker({ id, value, onChange, offers, emptyLabel }: {
  id: string;
  value: string;
  onChange: (offerId: string) => void;
  offers: SetupOffer[];
  emptyLabel: string;
}) {
  const known = offers.some((offer) => offer._id === value);
  return (
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>
      <option value="">{emptyLabel}</option>
      {value && !known ? <option value={value}>A plan that no longer exists</option> : null}
      {offers.map((offer) => (
        <option key={offer._id} value={offer._id}>
          {offerSummary(offer)}
        </option>
      ))}
    </select>
  );
}

export function SubscriptionActionEditor({ formId, setup, config, problems, onChange }: {
  formId: string;
  setup: ActionEditorSetup;
  config: SubscriptionConfig;
  problems: SubscriptionConfigProblems;
  onChange: (next: SubscriptionConfig) => void;
}) {
  const set = (patch: Partial<SubscriptionConfig>) => onChange({ ...config, ...patch });
  const offerById = new Map(setup.offers.map((offer) => [String(offer._id), offer]));
  const choiceFields = setup.fields.filter((field) => field.choices.length > 0);
  const planField = setup.fields.find((field) => field.key === config.offerFieldName);
  const fixedOffer = offerById.get(config.offerId);
  const currency = (config.offerMode === "fixed" ? fixedOffer?.currencyCode : undefined) ?? setup.offers[0]?.currencyCode ?? "USD";

  // A choice leads to a plan through the map, or (older forms) by having an offer id as its value.
  const planForChoice = (value: string): string => config.offerFieldMap[value] ?? (offerById.has(value) ? value : "");
  const unmapped = planField ? planField.choices.filter((choice) => !planForChoice(choice.value)) : [];

  if (setup.offers.length === 0) {
    return (
      <Note tone="warn">
        There are no plans to sell yet. Create one under{" "}
        <Link to="/commerce/subscriptions/offers" className="font-medium underline">
          Subscriptions → Offers
        </Link>
        , then come back to connect it to this form.
      </Note>
    );
  }

  return (
    <div className="grid gap-6">
      {/* Plan */}
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-semibold text-foreground">Plan</legend>
        <div className="grid gap-2 md:grid-cols-2">
          <Choice
            name="offer-mode"
            checked={config.offerMode === "fixed"}
            onSelect={() => set({ offerMode: "fixed" })}
            title="One plan"
            description="Every submission buys the same plan."
          />
          <Choice
            name="offer-mode"
            checked={config.offerMode === "fromField"}
            onSelect={() => set({ offerMode: "fromField" })}
            title="The plan the buyer picks"
            description="A choice field on the form decides the plan."
            disabled={choiceFields.length === 0 && config.offerMode !== "fromField"}
          />
        </div>

        {config.offerMode === "fixed" ? (
          <Field label="Plan" htmlFor="action-offer" required error={problems.offer}>
            <OfferPicker id="action-offer" value={config.offerId} onChange={(offerId) => set({ offerId })} offers={setup.offers} emptyLabel="Choose a plan" />
          </Field>
        ) : (
          <>
            <Field
              label="Field where the buyer picks"
              htmlFor="action-offer-field"
              required
              error={problems.offerField}
              helper="A choice field: radio buttons, a dropdown or plan cards."
            >
              <FieldPicker
                id="action-offer-field"
                value={config.offerFieldName}
                onChange={(offerFieldName) => set({ offerFieldName, offerFieldMap: {} })}
                fields={choiceFields}
                placeholder="Choose a field"
              />
            </Field>

            {planField ? (
              <div className="grid gap-2">
                <span className="text-xs font-medium text-muted-foreground">Each choice buys</span>
                <div className="divide-y divide-border rounded-xl border border-border">
                  {planField.choices.map((choice) => (
                    <div key={choice.value} className="grid items-center gap-2 px-3 py-2 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                      <label htmlFor={`choice-${choice.value}`} className="truncate text-sm text-foreground">
                        {choice.label}
                        {choice.label !== choice.value ? <span className="ml-1 text-xs text-muted-foreground">({choice.value})</span> : null}
                      </label>
                      <OfferPicker
                        id={`choice-${choice.value}`}
                        value={planForChoice(choice.value)}
                        onChange={(offerId) => set({ offerFieldMap: { ...config.offerFieldMap, [choice.value]: offerId } })}
                        offers={setup.offers}
                        emptyLabel="No plan (checkout stops)"
                      />
                    </div>
                  ))}
                </div>
                {unmapped.length > 0 ? (
                  <Note tone="warn">
                    {unmapped.length === 1 ? `"${unmapped[0]?.label}" doesn't` : `${unmapped.length} choices don't`} lead to a plan. A buyer who
                    picks {unmapped.length === 1 ? "it" : "one"} can submit the form, but no checkout starts.
                  </Note>
                ) : (
                  <Note tone="ok">Every choice leads to a plan. Pricing pages link here with the plan already picked.</Note>
                )}
              </div>
            ) : null}
          </>
        )}
        {config.offerMode === "fixed" && offerWarning(fixedOffer) ? <Note tone="warn">{offerWarning(fixedOffer)}</Note> : null}
        {config.offerMode === "fromField" && planField
          ? [...new Set(planField.choices.map((choice) => planForChoice(choice.value)).filter(Boolean))].map((offerId) => {
              const warning = offerWarning(offerById.get(offerId));
              return warning ? (
                <Note key={offerId} tone="warn">
                  {warning}
                </Note>
              ) : null;
            })
          : null}
      </fieldset>

      {/* Account */}
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-semibold text-foreground">Buyer's account</legend>
        {setup.account === "at_end" ? (
          <Note tone="ok">This form asks for an account at the end, so every buyer is signed in when they pay. The subscription belongs to that account.</Note>
        ) : setup.account === "required" ? (
          <Note tone="ok">Only signed-in visitors can open this form, so every buyer pays from their own account.</Note>
        ) : (
          <Note tone="warn">
            This form doesn't ask for an account. With "Signed-in account" below, a visitor who isn't signed in fills in the whole form and
            is then told to sign in. Choose{" "}
            <Link to="/forms/$formId/settings" params={{ formId }} className="font-medium underline">
              Ask for an account at the end
            </Link>{" "}
            in the form's settings so they create one inside the form, before paying.
          </Note>
        )}
        <div className="grid gap-2 md:grid-cols-2">
          <Choice
            name="account-policy"
            checked={config.accountPolicy === "require_existing"}
            onSelect={() => set({ accountPolicy: "require_existing" })}
            title="Signed-in account (recommended)"
            description="The buyer pays from their own account; it is the one that gets access."
          />
          <Choice
            name="account-policy"
            checked={config.accountPolicy === "create_on_website"}
            onSelect={() => set({ accountPolicy: "create_on_website" })}
            title="The email in the form"
            description="A buyer who isn't signed in pays first. Access starts once they verify that email on the site."
          />
        </div>
        <Field
          label="Email field"
          htmlFor="action-email-field"
          required={config.accountPolicy === "create_on_website"}
          error={problems.email}
          helper={
            config.accountPolicy === "create_on_website"
              ? "The email that identifies a buyer who isn't signed in."
              : "Optional. A signed-in buyer's account email is always used."
          }
        >
          <FieldPicker
            id="action-email-field"
            value={config.emailFieldName}
            onChange={(emailFieldName) => set({ emailFieldName })}
            fields={setup.fields}
            placeholder={config.accountPolicy === "create_on_website" ? "Choose a field" : "None"}
          />
        </Field>
      </fieldset>

      {/* Coupon */}
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-semibold text-foreground">Coupon</legend>
        <div className="grid gap-2 md:grid-cols-3">
          <Choice name="coupon-mode" checked={config.couponMode === "none"} onSelect={() => set({ couponMode: "none" })} title="None" description="Buyers can still enter a code at checkout." />
          <Choice name="coupon-mode" checked={config.couponMode === "fixed"} onSelect={() => set({ couponMode: "fixed" })} title="Always apply a code" description="Every buyer gets the same discount." />
          <Choice name="coupon-mode" checked={config.couponMode === "fromField"} onSelect={() => set({ couponMode: "fromField" })} title="From a field" description="A field where the buyer types a code." />
        </div>
        {config.couponMode === "fixed" ? (
          <Field label="Code" htmlFor="action-coupon-code" required error={problems.coupon}>
            <input
              id="action-coupon-code"
              value={config.couponCode}
              onChange={(event) => set({ couponCode: event.target.value.toUpperCase() })}
              placeholder="SAVE20"
              className={cn(inputClass, "font-mono uppercase")}
            />
          </Field>
        ) : null}
        {config.couponMode === "fromField" ? (
          <Field label="Coupon field" htmlFor="action-coupon-field" required error={problems.coupon}>
            <FieldPicker id="action-coupon-field" value={config.couponFieldName} onChange={(couponFieldName) => set({ couponFieldName })} fields={setup.fields} placeholder="Choose a field" />
          </Field>
        ) : null}
      </fieldset>

      {/* After payment */}
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-semibold text-foreground">After payment</legend>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Send the buyer to" htmlFor="action-return-url" helper="A page on this site (/welcome) or a full URL. Empty shows the form's confirmation.">
            <input
              id="action-return-url"
              value={config.returnUrl}
              onChange={(event) => set({ returnUrl: event.target.value })}
              placeholder="/welcome"
              className={inputClass}
            />
          </Field>
          <Field label="Largest first charge" htmlFor="action-max-amount" helper="Optional safety limit: a checkout whose first charge is higher is refused.">
            <MoneyInput
              id="action-max-amount"
              value={config.maxInitialAmount}
              onChange={(maxInitialAmount) => set({ maxInitialAmount })}
              currencyCode={currency}
              placeholder="No limit"
            />
          </Field>
        </div>
      </fieldset>
    </div>
  );
}
