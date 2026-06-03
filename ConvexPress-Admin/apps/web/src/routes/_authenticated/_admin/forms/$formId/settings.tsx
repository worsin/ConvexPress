import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { ArrowLeft, LoaderIcon, Save } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import type { Capability } from "@backend/convex/types/capabilities";
import { PluginGuard } from "@/components/plugins/PluginGuard";
import { useCan } from "@/hooks/useCan";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const formCap = (cap: string): Capability => cap as Capability;

type FormStatus = "draft" | "published" | "archived";

interface FormSettings {
  disabled?: boolean | null;
  scheduleStart?: number | null;
  scheduleEnd?: number | null;
  entryLimit?: number | null;
  requireLogin?: boolean | null;
  loginRequired?: boolean | null;
  [key: string]: unknown;
}

interface SettingsDraft {
  disabled: boolean;
  requireLogin: boolean;
  orderFormEnabled: boolean;
  showOrderSummary: boolean;
  orderSummaryTitle: string;
  orderPaymentTitle: string;
  orderPaymentDescription: string;
  scheduleStart: string;
  scheduleEnd: string;
  entryLimit: string;
  status: FormStatus;
}

interface NormalizedOrderFormSettings {
  enabled: boolean;
  showSummary: boolean;
  summaryTitle: string;
  paymentTitle: string;
  paymentDescription: string;
}

export const Route = createFileRoute(
  "/_authenticated/_admin/forms/$formId/settings",
)({
  component: FormSettingsRoute,
});

function FormSettingsRoute() {
  const { formId } = Route.useParams();
  return (
    <PluginGuard pluginId="forms">
      <FormSettingsContent formId={formId as Id<"forms">} />
    </PluginGuard>
  );
}

function FormSettingsContent({ formId }: { formId: Id<"forms"> }) {
  const canUpdate = useCan(formCap("form.update"));
  const form = useQuery(api.extensions.forms.queries.getForm, { id: formId });
  const updateForm = useMutation(api.extensions.forms.mutations.update);
  const [baseSettings, setBaseSettings] = useState<FormSettings>({});
  const [draft, setDraft] = useState<SettingsDraft>({
    disabled: false,
    requireLogin: false,
    orderFormEnabled: false,
    showOrderSummary: true,
    orderSummaryTitle: "Order summary",
    orderPaymentTitle: "Complete payment",
    orderPaymentDescription:
      "Your order has been saved. Complete payment to finish.",
    scheduleStart: "",
    scheduleEnd: "",
    entryLimit: "",
    status: "draft",
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!form) return;
    const parsed = parseSettings(form.settings);
    const orderForm = readOrderFormSettings(parsed);
    setBaseSettings(parsed);
    setDraft({
      disabled: parsed.disabled === true,
      requireLogin: parsed.requireLogin === true || parsed.loginRequired === true,
      orderFormEnabled: orderForm.enabled,
      showOrderSummary: orderForm.showSummary,
      orderSummaryTitle: orderForm.summaryTitle,
      orderPaymentTitle: orderForm.paymentTitle,
      orderPaymentDescription: orderForm.paymentDescription,
      scheduleStart: toDateTimeLocal(
        parsed.scheduleStart ?? readNestedSchedule(parsed, "startsAt"),
      ),
      scheduleEnd: toDateTimeLocal(
        parsed.scheduleEnd ?? readNestedSchedule(parsed, "endsAt"),
      ),
      entryLimit:
        typeof parsed.entryLimit === "number" && Number.isInteger(parsed.entryLimit)
          ? String(parsed.entryLimit)
          : "",
      status: form.status as FormStatus,
    });
  }, [form]);

  if (form === undefined) return <SettingsSkeleton />;
  if (form === null) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <section className="rounded-lg border border-border bg-card p-8">
          <h1 className="text-xl font-semibold text-foreground">Form not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The requested form could not be loaded.
          </p>
          <Link to="/forms" className="mt-4 inline-block">
            <Button variant="outline">
              <ArrowLeft className="size-4" data-icon="inline-start" />
              Back to Forms
            </Button>
          </Link>
        </section>
      </div>
    );
  }

  async function handleSave() {
    const nextSettings = buildSettings(baseSettings, draft);
    const error = validateDraft(draft);
    if (error) {
      toast.error(error);
      return;
    }

    setIsSaving(true);
    try {
      await updateForm({
        id: formId,
        status: draft.status,
        settings: JSON.stringify(nextSettings),
      });
      setBaseSettings(nextSettings);
      toast.success("Form settings saved.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save form settings.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {form.title} Settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Control form availability, access, and response limits.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/forms/$formId/edit" params={{ formId }}>
            <Button variant="outline">
              <ArrowLeft className="size-4" data-icon="inline-start" />
              Builder
            </Button>
          </Link>
          <Button
            onClick={() => void handleSave()}
            disabled={!canUpdate || isSaving}
          >
            {isSaving ? (
              <LoaderIcon
                className="size-4 animate-spin"
                data-icon="inline-start"
              />
            ) : (
              <Save className="size-4" data-icon="inline-start" />
            )}
            Save
          </Button>
        </div>
      </div>

      {!canUpdate ? (
        <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          You can view these settings, but your role cannot update forms.
        </div>
      ) : null}

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="form-status">Status</Label>
            <Select
              value={draft.status}
              onValueChange={(value) =>
                setDraft((prev) => ({ ...prev, status: value as FormStatus }))
              }
              disabled={!canUpdate || isSaving}
            >
              <SelectTrigger id="form-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-start gap-3 rounded-lg border border-border p-4">
              <Checkbox
                checked={draft.disabled}
                onCheckedChange={(checked) =>
                  setDraft((prev) => ({ ...prev, disabled: checked === true }))
                }
                disabled={!canUpdate || isSaving}
              />
              <span className="grid gap-1">
                <span className="text-sm font-medium text-foreground">
                  Stop accepting responses
                </span>
                <span className="text-xs text-muted-foreground">
                  Public form pages show a closed notice and submit is rejected.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-lg border border-border p-4">
              <Checkbox
                checked={draft.requireLogin}
                onCheckedChange={(checked) =>
                  setDraft((prev) => ({
                    ...prev,
                    requireLogin: checked === true,
                  }))
                }
                disabled={!canUpdate || isSaving}
              />
              <span className="grid gap-1">
                <span className="text-sm font-medium text-foreground">
                  Require login
                </span>
                <span className="text-xs text-muted-foreground">
                  Guests are prompted to sign in before submitting.
                </span>
              </span>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="schedule-start">Open at</Label>
              <Input
                id="schedule-start"
                type="datetime-local"
                value={draft.scheduleStart}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    scheduleStart: event.target.value,
                  }))
                }
                disabled={!canUpdate || isSaving}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="schedule-end">Close at</Label>
              <Input
                id="schedule-end"
                type="datetime-local"
                value={draft.scheduleEnd}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    scheduleEnd: event.target.value,
                  }))
                }
                disabled={!canUpdate || isSaving}
              />
            </div>
          </div>

          <div className="grid gap-2 md:max-w-xs">
            <Label htmlFor="entry-limit">Entry limit</Label>
            <Input
              id="entry-limit"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={draft.entryLimit}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  entryLimit: event.target.value,
                }))
              }
              placeholder="Unlimited"
              disabled={!canUpdate || isSaving}
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="grid gap-5">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Order form
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Add a live order summary and Stripe payment step for priced fields.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-start gap-3 rounded-lg border border-border p-4">
              <Checkbox
                checked={draft.orderFormEnabled}
                onCheckedChange={(checked) =>
                  setDraft((prev) => ({
                    ...prev,
                    orderFormEnabled: checked === true,
                  }))
                }
                disabled={!canUpdate || isSaving}
              />
              <span className="grid gap-1">
                <span className="text-sm font-medium text-foreground">
                  Enable order form mode
                </span>
                <span className="text-xs text-muted-foreground">
                  Positive totals route the submitter into payment instead of a
                  thank-you state.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-lg border border-border p-4">
              <Checkbox
                checked={draft.showOrderSummary}
                onCheckedChange={(checked) =>
                  setDraft((prev) => ({
                    ...prev,
                    showOrderSummary: checked === true,
                  }))
                }
                disabled={!canUpdate || isSaving || !draft.orderFormEnabled}
              />
              <span className="grid gap-1">
                <span className="text-sm font-medium text-foreground">
                  Show order summary
                </span>
                <span className="text-xs text-muted-foreground">
                  Display selected priced options and the amount due today.
                </span>
              </span>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="order-summary-title">Summary title</Label>
              <Input
                id="order-summary-title"
                value={draft.orderSummaryTitle}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    orderSummaryTitle: event.target.value,
                  }))
                }
                disabled={!canUpdate || isSaving || !draft.orderFormEnabled}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="order-payment-title">Payment title</Label>
              <Input
                id="order-payment-title"
                value={draft.orderPaymentTitle}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    orderPaymentTitle: event.target.value,
                  }))
                }
                disabled={!canUpdate || isSaving || !draft.orderFormEnabled}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="order-payment-description">Payment description</Label>
            <Input
              id="order-payment-description"
              value={draft.orderPaymentDescription}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  orderPaymentDescription: event.target.value,
                }))
              }
              disabled={!canUpdate || isSaving || !draft.orderFormEnabled}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function parseSettings(settings: string): FormSettings {
  try {
    const parsed = JSON.parse(settings);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as FormSettings;
  } catch {
    return {};
  }
}

function buildSettings(base: FormSettings, draft: SettingsDraft): FormSettings {
  const next: FormSettings = { ...base };
  delete next.loginRequired;
  delete next.schedule;
  next.requireLogin = draft.requireLogin;

  if (draft.disabled) next.disabled = true;
  else delete next.disabled;

  const start = fromDateTimeLocal(draft.scheduleStart);
  const end = fromDateTimeLocal(draft.scheduleEnd);
  if (start === undefined) delete next.scheduleStart;
  else next.scheduleStart = start;
  if (end === undefined) delete next.scheduleEnd;
  else next.scheduleEnd = end;

  const limit = draft.entryLimit.trim()
    ? Number.parseInt(draft.entryLimit, 10)
    : undefined;
  if (limit === undefined) delete next.entryLimit;
  else next.entryLimit = limit;

  if (draft.orderFormEnabled) {
    next.orderForm = {
      enabled: true,
      showSummary: draft.showOrderSummary,
      summaryTitle: draft.orderSummaryTitle.trim() || "Order summary",
      paymentTitle: draft.orderPaymentTitle.trim() || "Complete payment",
      paymentDescription:
        draft.orderPaymentDescription.trim() ||
        "Your order has been saved. Complete payment to finish.",
    };
  } else {
    delete next.orderForm;
  }

  return next;
}

function validateDraft(draft: SettingsDraft): string | null {
  const start = fromDateTimeLocal(draft.scheduleStart);
  const end = fromDateTimeLocal(draft.scheduleEnd);
  if (start !== undefined && end !== undefined && end < start) {
    return "Close time must be after open time.";
  }
  if (draft.entryLimit.trim()) {
    const limit = Number(draft.entryLimit);
    if (!Number.isInteger(limit) || limit <= 0) {
      return "Entry limit must be a positive whole number.";
    }
  }
  return null;
}

function toDateTimeLocal(ms: unknown): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "";
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function readNestedSchedule(
  settings: FormSettings,
  key: "startsAt" | "endsAt",
): unknown {
  const schedule = settings.schedule;
  if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) {
    return undefined;
  }
  return (schedule as { startsAt?: unknown; endsAt?: unknown })[key];
}

function readOrderFormSettings(
  settings: FormSettings,
): NormalizedOrderFormSettings {
  const raw = settings.orderForm;
  const orderForm =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    enabled: orderForm.enabled === true,
    showSummary: orderForm.showSummary !== false,
    summaryTitle:
      typeof orderForm.summaryTitle === "string" && orderForm.summaryTitle.trim()
        ? orderForm.summaryTitle.trim()
        : "Order summary",
    paymentTitle:
      typeof orderForm.paymentTitle === "string" && orderForm.paymentTitle.trim()
        ? orderForm.paymentTitle.trim()
        : "Complete payment",
    paymentDescription:
      typeof orderForm.paymentDescription === "string" &&
      orderForm.paymentDescription.trim()
        ? orderForm.paymentDescription.trim()
        : "Your order has been saved. Complete payment to finish.",
  };
}

function fromDateTimeLocal(value: string): number | undefined {
  if (!value) return undefined;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : undefined;
}

function SettingsSkeleton() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-32" />
      </div>
      <Skeleton className="h-[360px] w-full" />
    </div>
  );
}
