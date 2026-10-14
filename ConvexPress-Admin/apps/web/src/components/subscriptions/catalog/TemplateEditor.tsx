/**
 * TemplateEditor — create or edit a subscription template: how often offers
 * on it bill, the free trial, the grace period, whether customers may pause,
 * and what happens when a renewal payment fails (the retry schedule).
 *
 * The retry schedule is shown as the timeline a customer with a failing card
 * goes through, so the effect of each number is visible as it is edited.
 */
import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { toast } from "sonner";
import { Archive, Minus, Plus, Save } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import { cn, getErrorMessage } from "@/lib/utils";
import { formatCadence } from "@/components/subscriptions/billingFormat";

import { Field, inputClass, Section, slugify, SLUG_PATTERN, ToggleRow, wholeNumber } from "./fields";

export type TemplateEditorData = NonNullable<FunctionReturnType<typeof api.commerceSubscriptions.adminCatalog.getTemplateEditor>>;
/** The cadences a template can be created or changed to (`subscriptionIntervalValidator`). */
type Interval = Exclude<TemplateEditorData["template"]["billingInterval"], "day">;
type TemplateStatus = TemplateEditorData["template"]["status"];

const DEFAULT_RETRY_DAYS = [1, 3, 7];
const PRESETS: ReadonlyArray<{ label: string; days: number[] }> = [
  { label: "Standard", days: [1, 3, 7] },
  { label: "Patient", days: [3, 7, 14] },
  { label: "Quick", days: [1, 2] },
  { label: "No retries", days: [] },
];
const INTERVALS: ReadonlyArray<{ value: Interval; label: string }> = [
  { value: "week", label: "week(s)" },
  { value: "month", label: "month(s)" },
  { value: "year", label: "year(s)" },
];

function isInterval(value: string): value is Interval {
  return INTERVALS.some((entry) => entry.value === value);
}

export function TemplateEditor({ existing }: { existing?: TemplateEditorData }) {
  const navigate = useNavigate();
  const createTemplate = useMutation(api.commerceSubscriptions.mutations.createTemplate);
  const updateTemplate = useMutation(api.commerceSubscriptions.mutations.updateTemplate);
  const archiveTemplate = useMutation(api.commerceSubscriptions.templates.archiveTemplate);

  const template = existing?.template;
  const liveContracts = existing?.offers.reduce((sum, offer) => sum + offer.usage.liveContracts, 0) ?? 0;

  const [title, setTitle] = useState(template?.title ?? "");
  const [slug, setSlug] = useState(template?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(template));
  const [status, setStatus] = useState<TemplateStatus>(template?.status ?? "active");
  const [cadence, setCadence] = useState<Interval>(
    template && template.billingInterval !== "day" ? template.billingInterval : "month",
  );
  const [intervalTouched, setIntervalTouched] = useState(false);
  const [countText, setCountText] = useState(String(template?.billingIntervalCount ?? 1));
  const [trialText, setTrialText] = useState(template?.trialDays ? String(template.trialDays) : "");
  const [graceText, setGraceText] = useState(String(template?.gracePeriodDays ?? 3));
  const [pausable, setPausable] = useState(template?.pausable ?? false);
  const [cancelAtPeriodEndDefault, setCancelAtPeriodEndDefault] = useState(template?.cancelAtPeriodEndDefault ?? true);
  const [retryDays, setRetryDays] = useState<number[]>(existing?.retryPolicy.retryDays ?? DEFAULT_RETRY_DAYS);
  const [cancelAfterFinalFailure, setCancelAfterFinalFailure] = useState(existing?.retryPolicy.cancelAfterFinalFailure ?? true);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const count = wholeNumber(countText);
  const trialDays = wholeNumber(trialText);
  const graceDays = wholeNumber(graceText);
  const errors = {
    title: title.trim() ? undefined : "A title is required.",
    slug: SLUG_PATTERN.test(slug) ? undefined : "Lowercase letters, digits and single hyphens.",
    count: count === undefined || Number.isNaN(count) || count < 1 || count > 36 ? "Every 1 to 36." : undefined,
    trial: trialDays !== undefined && (Number.isNaN(trialDays) || trialDays > 365) ? "0 to 365 days." : undefined,
    grace: graceDays === undefined || Number.isNaN(graceDays) || graceDays > 90 ? "0 to 90 days." : undefined,
  };
  const valid = Object.values(errors).every((error) => error === undefined);

  async function save() {
    setShowErrors(true);
    if (!valid || count === undefined || graceDays === undefined) return;
    const terms = {
      title: title.trim(),
      slug,
      status,
      billingInterval: cadence,
      billingIntervalCount: count,
      trialDays: trialDays === undefined || Number.isNaN(trialDays) ? 0 : trialDays,
      gracePeriodDays: graceDays,
      pausable,
      cancelAtPeriodEndDefault,
      dunningRetryDays: retryDays,
      cancelAfterFinalFailure,
    };
    setSaving(true);
    try {
      if (template) {
        // A daily template (possible in older data) keeps its cadence unless it is changed here.
        const keepDaily = template.billingInterval === "day" && !intervalTouched;
        const { billingInterval, ...rest } = terms;
        await updateTemplate({ templateId: template._id, ...rest, ...(keepDaily ? {} : { billingInterval }) });
        toast.success("Template saved");
      } else {
        const templateId = await createTemplate(terms);
        toast.success("Template created");
        void navigate({ to: "/commerce/subscriptions/templates/$templateId/edit", params: { templateId } });
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "The template could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!template) return;
    try {
      await archiveTemplate({ templateId: template._id });
      setStatus("archived");
      toast.success("Template archived. Offers on it keep billing; new offers can't use it.");
    } catch (error) {
      toast.error(getErrorMessage(error, "The template could not be archived."));
    }
  }

  return (
    <form
      className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="space-y-6">
        <Section title="Name">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" htmlFor="template-title" required error={showErrors ? errors.title : undefined}>
              <input
                id="template-title"
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  if (!slugEdited) setSlug(slugify(event.target.value));
                }}
                placeholder="Monthly"
                className={inputClass}
              />
            </Field>
            <Field label="Slug" htmlFor="template-slug" required error={showErrors ? errors.slug : undefined}>
              <input
                id="template-slug"
                value={slug}
                onChange={(event) => {
                  setSlugEdited(true);
                  setSlug(event.target.value);
                }}
                className={cn(inputClass, "font-mono")}
              />
            </Field>
          </div>
        </Section>

        <Section
          title="Billing"
          description={liveContracts > 0 ? "Customers already subscribed keep the cadence they signed up on; a change applies to new subscriptions." : "How often offers on this template charge."}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Bill every" htmlFor="template-count" required error={showErrors ? errors.count : undefined} className="sm:col-span-2">
              <div className="flex gap-2">
                <input id="template-count" inputMode="numeric" value={countText} onChange={(event) => setCountText(event.target.value)} className={cn(inputClass, "w-24")} />
                <select
                  value={cadence}
                  aria-label="Interval"
                  onChange={(event) => {
                    if (isInterval(event.target.value)) {
                      setCadence(event.target.value);
                      setIntervalTouched(true);
                    }
                  }}
                  className={inputClass}
                >
                  {INTERVALS.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </div>
            </Field>
            <Field label="Free trial (days)" htmlFor="template-trial" error={showErrors ? errors.trial : undefined} helper="Offers may override it.">
              <input id="template-trial" inputMode="numeric" value={trialText} placeholder="None" onChange={(event) => setTrialText(event.target.value)} className={inputClass} />
            </Field>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <ToggleRow checked={pausable} onChange={setPausable} title="Customers may pause" description="Pausing stops renewals until they resume." />
            <ToggleRow
              checked={cancelAtPeriodEndDefault}
              onChange={setCancelAtPeriodEndDefault}
              title="Cancel at period end"
              description="When a customer cancels, access runs to the end of what they paid for."
            />
          </div>
        </Section>

        <Section title="When a renewal payment fails" description="Cards are retried on this schedule. The customer keeps access during the grace period and can update their card any time.">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Grace period (days)" htmlFor="template-grace" required error={showErrors ? errors.grace : undefined} helper="Access after the first failure.">
              <input id="template-grace" inputMode="numeric" value={graceText} onChange={(event) => setGraceText(event.target.value)} className={inputClass} />
            </Field>
            <div className="sm:col-span-2">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Retry schedule</p>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((preset) => {
                  const active = preset.days.length === retryDays.length && preset.days.every((day, index) => retryDays[index] === day);
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setRetryDays(preset.days)}
                      className={cn(
                        "rounded-lg px-2.5 py-1 text-xs font-medium",
                        active ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted",
                      )}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <ol className="space-y-2">
            {retryDays.map((gap, index) => (
              <li key={index} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-24 text-xs text-muted-foreground">Retry {index + 1}</span>
                <span className="text-xs text-muted-foreground">after</span>
                <input
                  inputMode="numeric"
                  value={String(gap)}
                  aria-label={`Days before retry ${index + 1}`}
                  onChange={(event) => {
                    const next = wholeNumber(event.target.value);
                    if (next === undefined || Number.isNaN(next)) return;
                    setRetryDays(retryDays.map((day, position) => (position === index ? Math.min(30, Math.max(1, next)) : day)));
                  }}
                  className={cn(inputClass, "w-20 py-1.5")}
                />
                <span className="text-xs text-muted-foreground">day{gap === 1 ? "" : "s"}</span>
                <button
                  type="button"
                  aria-label={`Remove retry ${index + 1}`}
                  onClick={() => setRetryDays(retryDays.filter((_, position) => position !== index))}
                  className="rounded-lg border border-border p-1 text-muted-foreground hover:bg-muted"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ol>
          {retryDays.length < 8 ? (
            <button
              type="button"
              onClick={() => setRetryDays([...retryDays, retryDays[retryDays.length - 1] ?? 1])}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-2.5 py-1 text-xs hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" /> Add a retry
            </button>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <ToggleRow
              checked={cancelAfterFinalFailure}
              onChange={setCancelAfterFinalFailure}
              title="Cancel after the last retry"
              description="Off: the subscription stays past due (access still ends with grace) until staff act or the card is updated."
            />
          </div>
        </Section>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <RetryTimeline retryDays={retryDays} graceDays={graceDays !== undefined && !Number.isNaN(graceDays) ? graceDays : 0} cancelAfterFinalFailure={cancelAfterFinalFailure} />

        <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-sm">
            Bills <span className="font-medium">{formatCadence(cadence, count !== undefined && !Number.isNaN(count) ? count : 1)}</span>
            {trialDays ? `, after a ${trialDays}-day trial` : ""}.
          </p>
          <Field label="Status" htmlFor="template-status" helper={status === "active" ? "Offers can use it." : status === "draft" ? "Not offered to new offers yet." : "Kept for existing offers only."}>
            <select
              id="template-status"
              value={status}
              onChange={(event) => setStatus(event.target.value === "draft" ? "draft" : event.target.value === "archived" ? "archived" : "active")}
              className={inputClass}
            >
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              {template ? <option value="archived">Archived</option> : null}
            </select>
          </Field>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            <Save className="h-4 w-4" /> {saving ? "Saving…" : template ? "Save template" : "Create template"}
          </button>
          {template && status !== "archived" ? (
            <button type="button" onClick={() => void archive()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-2 text-sm hover:bg-muted">
              <Archive className="h-4 w-4" /> Archive template
            </button>
          ) : null}
        </div>

        {existing ? (
          <div className="rounded-2xl border border-border bg-card p-5 text-sm shadow-sm">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Offers on this template</p>
            {existing.offers.length === 0 ? (
              <p className="text-xs text-muted-foreground">None yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {existing.offers.map((offer) => (
                  <li key={offer._id} className="flex justify-between gap-2 text-xs">
                    <Link to="/commerce/subscriptions/offers/$offerId/edit" params={{ offerId: offer._id }} className="hover:underline">
                      {offer.title}
                    </Link>
                    <span className="text-muted-foreground">{offer.usage.liveContracts} live</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </aside>
    </form>
  );
}

/** Day by day: what a customer whose renewal keeps failing goes through. */
function RetryTimeline({ retryDays, graceDays, cancelAfterFinalFailure }: { retryDays: number[]; graceDays: number; cancelAfterFinalFailure: boolean }) {
  const steps: Array<{ day: number; order: number; text: string }> = [
    { day: 0, order: 0, text: "Renewal charge fails; the customer can update their card from their account" },
  ];
  let day = 0;
  retryDays.forEach((gap, index) => {
    day += gap;
    steps.push({ day, order: 1, text: `Retry ${index + 1}${index === retryDays.length - 1 ? " (last)" : ""}` });
  });
  const lastDay = day;
  steps.push({
    day: graceDays,
    order: 2,
    text: graceDays < lastDay ? "Access pauses; retries continue and a payment restores it" : "Access ends unless a payment succeeds",
  });
  steps.push({ day: lastDay, order: 3, text: cancelAfterFinalFailure ? "Subscription cancelled" : "Stays past due for staff to resolve" });
  steps.sort((a, b) => a.day - b.day || a.order - b.order);
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">If a card keeps failing</p>
      <ol className="space-y-2 text-xs">
        {steps.map((step) => (
          <li key={`${step.order}-${step.day}-${step.text}`} className="flex gap-3">
            <span className="w-12 shrink-0 font-medium tabular-nums">Day {step.day}</span>
            <span className="text-muted-foreground">{step.text}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11px] text-muted-foreground">A successful payment at any point restores the subscription and access.</p>
    </div>
  );
}
