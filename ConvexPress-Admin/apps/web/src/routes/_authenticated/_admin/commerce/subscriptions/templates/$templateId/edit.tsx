/**
 * Edit Subscription Template.
 *
 * updateTemplate is relatively permissive — it auto-bumps version on
 * status/interval changes. Template fields don't carry the same
 * immutable-if-hot invariant as offers (offers pin a templateVersion
 * snapshot at contract creation time).
 */

import { useEffect, useState } from "react";
import {
  createFileRoute,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { ArrowLeft, Save, Archive } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/subscriptions/templates/$templateId/edit",
)({
  component: EditSubscriptionTemplatePage,
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

function EditSubscriptionTemplatePage() {
  const { templateId } = Route.useParams();
  const navigate = useNavigate();

  const template = useQuery(
    (api as any).commerceSubscriptions.queries.getTemplate,
    { templateId: templateId as Id<"commerce_subscription_templates"> },
  ) as
    | {
        _id: Id<"commerce_subscription_templates">;
        title: string;
        slug: string;
        status: TemplateStatus;
        version: number;
        billingInterval: BillingInterval;
        billingIntervalCount: number;
        trialDays?: number;
        gracePeriodDays?: number;
        pausable: boolean;
        cancelAtPeriodEndDefault: boolean;
        dunningPolicyCode?: string;
        createdAt: number;
        updatedAt: number;
      }
    | null
    | undefined;

  const updateTemplate = useMutation(
    (api as any).commerceSubscriptions.mutations.updateTemplate,
  );
  const archiveTemplate = useMutation(
    (api as any).commerceSubscriptions.templates.archiveTemplate,
  );

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<TemplateStatus>("draft");
  const [billingInterval, setBillingInterval] =
    useState<BillingInterval>("month");
  const [billingIntervalCount, setBillingIntervalCount] = useState("1");
  const [trialDays, setTrialDays] = useState("");
  const [gracePeriodDays, setGracePeriodDays] = useState("");
  const [pausable, setPausable] = useState(true);
  const [cancelAtPeriodEndDefault, setCancelAtPeriodEndDefault] =
    useState(true);
  const [dunningPolicyCode, setDunningPolicyCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  useEffect(() => {
    if (!template) return;
    setTitle(template.title ?? "");
    setSlug(template.slug ?? "");
    setStatus(template.status);
    setBillingInterval(template.billingInterval);
    setBillingIntervalCount(String(template.billingIntervalCount ?? 1));
    setTrialDays(
      template.trialDays !== undefined ? String(template.trialDays) : "",
    );
    setGracePeriodDays(
      template.gracePeriodDays !== undefined
        ? String(template.gracePeriodDays)
        : "",
    );
    setPausable(template.pausable);
    setCancelAtPeriodEndDefault(template.cancelAtPeriodEndDefault);
    setDunningPolicyCode(template.dunningPolicyCode ?? "");
  }, [template]);

  if (template === undefined) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (template === null) {
    return (
      <div className="space-y-4">
        <Link
          to="/commerce/subscriptions/templates"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to templates
        </Link>
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Template not found or plugin disabled.
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
      await updateTemplate({
        templateId: template._id,
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
      toast.success("Template saved");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to save template",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive() {
    setArchiving(true);
    try {
      await archiveTemplate({ templateId: template._id });
      toast.success("Template archived");
      navigate({ to: "/commerce/subscriptions/templates" });
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to archive template",
      );
      setArchiving(false);
      setConfirmArchive(false);
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
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {template.title}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-mono">/{template.slug}</span> · v
              {template.version}
            </p>
          </div>
          <span
            className={cn(
              "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
              template.status === "active"
                ? "bg-primary/15 text-primary"
                : template.status === "archived"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {template.status}
          </span>
        </div>
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
          <Field label="Trial days">
            <input
              type="number"
              min={0}
              value={trialDays}
              onChange={(e) => setTrialDays(e.target.value)}
              placeholder="0"
              className={inputClass}
            />
          </Field>
          <Field label="Grace period (days)">
            <input
              type="number"
              min={0}
              value={gracePeriodDays}
              onChange={(e) => setGracePeriodDays(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Dunning policy code">
            <input
              value={dunningPolicyCode}
              onChange={(e) => setDunningPolicyCode(e.target.value)}
              className={cn(inputClass, "font-mono text-xs")}
            />
          </Field>
          <div className="grid gap-2">
            <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground">
              <input
                type="checkbox"
                checked={pausable}
                onChange={(e) => setPausable(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-ring"
              />
              Allow contracts to be paused
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
            to="/commerce/subscriptions/templates"
            className="inline-flex rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Back
          </Link>

          {template.status !== "archived" && (
            <button
              type="button"
              onClick={() => setConfirmArchive(true)}
              disabled={archiving}
              className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
            >
              <Archive className="h-3.5 w-3.5" />
              Archive template
            </button>
          )}
        </div>

        {confirmArchive && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
            <p className="font-medium text-destructive">
              Archive this template?
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Existing offers and contracts referencing it stay intact; no
              new offers should be created against an archived template.
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
