import { useEffect, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { toast } from "sonner";
import { api } from "@backend/convex/_generated/api";

const OPERATION_LABELS: Record<string, string> = {
  rates: "Rates",
  labels: "Labels",
  tracking: "Tracking",
  manifests: "Manifests",
  returns: "Returns",
  address_validation: "Address Validation",
};

function formatStatusLabel(status: string) {
  return status.replace(/_/g, " ");
}

function getVerificationCopy(mode?: string) {
  if (mode === "live_api") {
    return {
      description:
        "Save provider credentials in encrypted secret storage. Verification performs a manual, read-only live API check for providers that support it.",
      button: "Run Live Verification",
    };
  }

  return {
    description:
      "Save provider credentials in encrypted secret storage. Verification is currently a local readiness check only for direct carriers.",
    button: "Run Readiness Check",
  };
}

export function DirectCarrierIntegrationPage({
  provider,
}: {
  provider: "ups" | "usps" | "fedex" | "dhl";
}) {
  const result = useQuery((api as any).shipping.queries.getProviderConnection, {
    provider,
  }) as
    | {
        descriptor: {
          title: string;
          summary: string;
          modeNotes: string;
          primaryUseCase: string;
          implementationStatus: string;
          operations: Record<string, string>;
          verificationMode: string;
          credentialFields: Array<{
            key: string;
            label: string;
            type: "text" | "password" | "url";
            placeholder?: string;
            required: boolean;
          }>;
        };
        settings: {
          enabled: boolean;
          displayName: string;
          mode: "sandbox" | "production";
          isPrimary: boolean;
          rateShoppingEnabled: boolean;
          rateShoppingPriority: number;
          accountNickname: string;
        };
        connection: { status: string } | null;
        secretStored: boolean;
      }
    | undefined;

  const updateSection = useMutation((api as any).settings.mutations.updateSection);
  const upsertConnectionMetadata = useMutation(
    (api as any).shipping.mutations.upsertConnectionMetadata,
  );
  const saveProviderSecret = useMutation((api as any).shipping.mutations.saveProviderSecret);
  const verifyFoundation = useAction(
    (api as any).shipping.actions.verifyDirectCarrierFoundation,
  );

  const [form, setForm] = useState({
    enabled: false,
    displayName: "",
    mode: "production" as "sandbox" | "production",
    isPrimary: false,
    rateShoppingEnabled: false,
    rateShoppingPriority: 100,
    accountNickname: "",
  });
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [isSavingCredentials, setIsSavingCredentials] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const verificationCopy = getVerificationCopy(result?.descriptor?.verificationMode);

  useEffect(() => {
    if (!result?.settings) return;
    setForm(result.settings);
  }, [result?.settings]);

  useEffect(() => {
    if (!result?.descriptor?.credentialFields) return;
    setCredentials((current) => {
      const next = { ...current };
      for (const field of result.descriptor.credentialFields) {
        if (next[field.key] === undefined) {
          next[field.key] = field.placeholder ?? "";
        }
      }
      return next;
    });
  }, [result?.descriptor?.credentialFields]);

  const save = async () => {
    try {
      await updateSection({
        section: `integrations.shipping.${provider}`,
        values: form,
      });
      await upsertConnectionMetadata({
        provider,
        displayName: form.displayName || result?.descriptor?.title || provider.toUpperCase(),
        enabled: form.enabled,
        mode: form.mode,
        isPrimary: form.isPrimary,
        rateShoppingEnabled: form.rateShoppingEnabled,
        rateShoppingPriority: form.rateShoppingPriority,
      });
      toast.success(`${result?.descriptor?.title || provider.toUpperCase()} settings saved.`);
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to save direct carrier settings",
      );
    }
  };

  const saveCredentials = async () => {
    try {
      setIsSavingCredentials(true);
      await saveProviderSecret({
        provider,
        credentials,
      });
      toast.success(`${result?.descriptor?.title || provider.toUpperCase()} credentials saved securely.`);
      setCredentials((current) => {
        const next = { ...current };
        for (const field of result?.descriptor?.credentialFields ?? []) {
          if (field.type === "password") {
            next[field.key] = "";
          }
        }
        return next;
      });
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to save provider credentials",
      );
    } finally {
      setIsSavingCredentials(false);
    }
  };

  const runVerification = async () => {
    try {
      setIsVerifying(true);
      const response = await verifyFoundation({ provider });
      if (response?.success) {
        toast.success(response.message ?? "Provider readiness verified.");
      } else {
        toast.error(response?.message ?? "Provider readiness check failed.");
      }
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Provider readiness check failed",
      );
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">
          {result?.descriptor?.title || provider.toUpperCase()}
        </h1>
        <p className="text-sm text-muted-foreground">
          {result?.descriptor?.summary}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Implementation
          </div>
          <div className="mt-2 text-sm font-semibold text-foreground">
            {result?.descriptor?.implementationStatus || "foundation"}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Connection
          </div>
          <div className="mt-2 text-sm font-semibold text-foreground">
            {result?.connection?.status ?? "disconnected"}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Secrets
          </div>
          <div className="mt-2 text-sm font-semibold text-foreground">
            {result?.secretStored ? "Stored" : "Not saved"}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Primary Use
          </div>
          <div className="mt-2 text-sm text-foreground">
            {result?.descriptor?.primaryUseCase || "Direct carrier integration"}
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-card p-6 space-y-5">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Foundation Settings</h2>
          <p className="text-sm text-muted-foreground">
            {result?.descriptor?.verificationMode === "live_api"
              ? "This provider has a live adapter path. Store configuration here, then verify it manually before using it at checkout."
              : "This stage reserves the provider boundary in ConvexPress without making live carrier calls."}
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Display Name</span>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.displayName}
              onChange={(event) =>
                setForm((current) => ({ ...current, displayName: event.target.value }))
              }
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Account Nickname</span>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.accountNickname}
              onChange={(event) =>
                setForm((current) => ({ ...current, accountNickname: event.target.value }))
              }
            />
          </label>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Mode</span>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.mode}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  mode: event.target.value as "sandbox" | "production",
                }))
              }
            >
              <option value="production">Production</option>
              <option value="sandbox">Sandbox</option>
            </select>
          </label>

          <div className="space-y-3">
            <label className="flex items-center gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) =>
                  setForm((current) => ({ ...current, enabled: event.target.checked }))
                }
              />
              Enabled
            </label>
            <label className="flex items-center gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.isPrimary}
                onChange={(event) =>
                  setForm((current) => ({ ...current, isPrimary: event.target.checked }))
                }
              />
              Primary provider
            </label>
            <label className="flex items-center gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.rateShoppingEnabled}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    rateShoppingEnabled: event.target.checked,
                  }))
                }
              />
              Include in live rate shopping
            </label>
          </div>
        </div>

        <label className="grid gap-2 md:max-w-xs">
          <span className="text-sm font-medium text-foreground">Rate shopping priority</span>
          <input
            type="number"
            min={1}
            max={999}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={form.rateShoppingPriority}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                rateShoppingPriority: Number(event.target.value) || 100,
              }))
            }
          />
        </label>

        <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
          {result?.descriptor?.modeNotes}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={save}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Save Foundation Settings
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 space-y-5">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Secure Credentials</h2>
          <p className="text-sm text-muted-foreground">
            {verificationCopy.description}
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {(result?.descriptor?.credentialFields ?? []).map((field) => (
            <label key={field.key} className="space-y-2">
              <span className="text-sm font-medium text-foreground">
                {field.label}
                {field.required ? " *" : ""}
              </span>
              <input
                type={field.type === "password" ? "password" : "text"}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={credentials[field.key] ?? ""}
                onChange={(event) =>
                  setCredentials((current) => ({
                    ...current,
                    [field.key]: event.target.value,
                  }))
                }
                placeholder={field.placeholder}
              />
            </label>
          ))}
        </div>

        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            Requires `SHIPPING_PROVIDER_ENCRYPTION_KEY` in the Convex environment.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={saveCredentials}
              disabled={isSavingCredentials}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingCredentials ? "Saving..." : "Save Credentials"}
            </button>
            <button
              type="button"
              onClick={runVerification}
              disabled={isVerifying || !result?.secretStored}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isVerifying ? "Checking..." : verificationCopy.button}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Adapter Contract</h2>
          <p className="text-sm text-muted-foreground">
            These statuses describe what the normalized shipping adapter expects from this provider.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Object.entries(result?.descriptor?.operations ?? {}).map(([operation, status]) => (
            <div
              key={operation}
              className="rounded-xl border border-border px-4 py-3 text-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-foreground">
                  {OPERATION_LABELS[operation] || operation}
                </span>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {formatStatusLabel(status)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
