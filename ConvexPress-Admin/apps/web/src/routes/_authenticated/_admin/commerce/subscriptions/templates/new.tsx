/**
 * New Subscription Template form.
 *
 * Creates a draft template. All billing cadence fields are set here —
 * offers inherit these defaults. Version is auto-assigned server-side.
 */

import { useState } from "react";
import {
  createFileRoute,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/subscriptions/templates/new",
)({
  component: NewSubscriptionTemplatePage,
});

type BillingInterval = "week" | "month" | "year";
type TemplateStatus = "draft" | "active" | "archived";

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

function NewSubscriptionTemplatePage() {
  const navigate = useNavigate();
  const createTemplate = useMutation(
    (api as any).commerceSubscriptions.mutations.createTemplate,
  );

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<TemplateStatus>("draft");
  const [billingInterval, setBillingInterval] =
    useState<BillingInterval>("month");
  const [billingIntervalCount, setBillingIntervalCount] = useState("1");
  const [trialDays, setTrialDays] = useState("");
  const [gracePeriodDays, setGracePeriodDays] = useState("3");
  const [pausable, setPausable] = useState(true);
  const [cancelAtPeriodEndDefault, setCancelAtPeriodEndDefault] =
    useState(true);
  const [dunningPolicyCode, setDunningPolicyCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !slug.trim()) {
      toast.error("Title and slug are required.");
      return;
    }
    setSubmitting(true);
    try {
      const id = await createTemplate({
        title: title.trim(),
        slug: slug.trim(),
        status,
        billingInterval,
        billingIntervalCount: Math.max(1, Number(billingIntervalCount) || 1),
        trialDays: trialDays.trim()
          ? Math.max(0, Number(trialDays) || 0)
          : undefined,
        gracePeriodDays: gracePeriodDays.trim()
          ? Math.max(0, Number(gracePeriodDays) || 0)
          : undefined,
        pausable,
        cancelAtPeriodEndDefault,
        dunningPolicyCode: dunningPolicyCode.trim() || undefined,
      });
      toast.success("Template created");
      navigate({
        to: "/commerce/subscriptions/templates/$templateId/edit",
        params: { templateId: String(id) },
      });
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to create template",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/commerce/subscriptions/templates"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to templates
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          New template
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Templates define the default cadence and policy for offers.
        </p>
      </div>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" required>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Monthly standard"
              className={inputClass}
            />
          </Field>
          <Field label="Slug" required helper="Used for URL references.">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="monthly-standard"
              className={inputClass}
            />
          </Field>

          <Field label="Status">
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as TemplateStatus)
              }
              className={inputClass}
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
          <Field label="Billing interval" required>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={billingIntervalCount}
                onChange={(e) => setBillingIntervalCount(e.target.value)}
                className={cn(inputClass, "w-24")}
              />
              <select
                value={billingInterval}
                onChange={(e) =>
                  setBillingInterval(e.target.value as BillingInterval)
                }
                className={inputClass}
              >
                <option value="week">week(s)</option>
                <option value="month">month(s)</option>
                <option value="year">year(s)</option>
              </select>
            </div>
          </Field>

          <Field label="Trial days" helper="Leave blank for no trial.">
            <input
              type="number"
              min={0}
              value={trialDays}
              onChange={(e) => setTrialDays(e.target.value)}
              placeholder="0"
              className={inputClass}
            />
          </Field>
          <Field
            label="Grace period (days)"
            helper="Entitlements enter 'grace' during past_due/paused for this many days."
          >
            <input
              type="number"
              min={0}
              value={gracePeriodDays}
              onChange={(e) => setGracePeriodDays(e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Dunning policy code" helper="Optional override. Blank uses the default policy.">
            <input
              value={dunningPolicyCode}
              onChange={(e) => setDunningPolicyCode(e.target.value)}
              placeholder="default"
              className={cn(inputClass, "font-mono text-xs")}
            />
          </Field>
          <div className="grid gap-2 sm:col-span-1">
            <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground">
              <input
                type="checkbox"
                checked={pausable}
                onChange={(e) => setPausable(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-ring"
              />
              Allow contracts on this template to be paused
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground">
              <input
                type="checkbox"
                checked={cancelAtPeriodEndDefault}
                onChange={(e) =>
                  setCancelAtPeriodEndDefault(e.target.checked)
                }
                className="h-4 w-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-ring"
              />
              Default cancellations to "end of period"
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-border pt-4">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {submitting ? "Creating…" : "Create template"}
          </button>
          <Link
            to="/commerce/subscriptions/templates"
            className="inline-flex rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
