import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";

export const Route = createFileRoute(
  "/_authenticated/_admin/settings/integrations/shipping/shipstation",
)({
  component: ShipStationIntegrationPage,
});

function ShipStationIntegrationPage() {
  const result = useQuery((api as any).shipping.queries.getProviderConnection, {
    provider: "shipstation",
  }) as
    | {
        descriptor: {
          implementationStatus: string;
          modeNotes: string;
          primaryUseCase: string;
          operations: Record<string, string>;
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
        accounts: Array<{ _id: string; carrierName: string; status: string }>;
        services: Array<{ _id: string }>;
      }
    | undefined;

  const updateSection = useMutation((api as any).settings.mutations.updateSection);
  const upsertConnectionMetadata = useMutation(
    (api as any).shipping.mutations.upsertConnectionMetadata,
  );
  const saveProviderSecret = useMutation((api as any).shipping.mutations.saveProviderSecret);
  const verifyConnection = useAction((api as any).shipping.actions.verifyShipStationConnection);

  const [form, setForm] = useState({
    enabled: false,
    displayName: "ShipStation",
    mode: "production" as "sandbox" | "production",
    isPrimary: true,
    rateShoppingEnabled: true,
    rateShoppingPriority: 10,
    accountNickname: "",
  });
  const [apiKey, setApiKey] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("https://api.shipengine.com");
  const [isSavingCredentials, setIsSavingCredentials] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    if (!result?.settings) return;
    setForm(result.settings);
  }, [result?.settings]);

  const save = async () => {
    await updateSection({
      section: "integrations.shipping.shipstation",
      values: form,
    });
    await upsertConnectionMetadata({
      provider: "shipstation",
      displayName: form.displayName,
      enabled: form.enabled,
      mode: form.mode,
      isPrimary: form.isPrimary,
      rateShoppingEnabled: form.rateShoppingEnabled,
      rateShoppingPriority: form.rateShoppingPriority,
    });
    toast.success("ShipStation foundation settings saved.");
  };

  const saveCredentials = async () => {
    setIsSavingCredentials(true);
    try {
      await saveProviderSecret({
        provider: "shipstation",
        credentials: {
          apiKey,
          apiBaseUrl,
        },
      });
      toast.success("ShipStation credentials saved securely.");
      setApiKey("");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          (error instanceof Error ? error.message : "Failed to save credentials"),
      );
    } finally {
      setIsSavingCredentials(false);
    }
  };

  const runVerification = async () => {
    setIsVerifying(true);
    try {
      const result = await verifyConnection({});
      if (result?.success) {
        toast.success(
          `ShipStation verified with ${result.accountCount ?? 0} visible carrier records.`,
        );
      } else {
        toast.error(result?.error ?? "ShipStation verification failed.");
      }
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          (error instanceof Error ? error.message : "ShipStation verification failed"),
      );
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">ShipStation</h1>
        <p className="text-sm text-muted-foreground">
          Aggregator path for connected carriers, rate shopping, labels,
          tracking, and manifests.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Implementation</div>
          <div className="mt-2 text-sm font-semibold text-foreground">
            {result?.descriptor?.implementationStatus ?? "active"}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Connection</div>
          <div className="mt-2 text-sm font-semibold text-foreground">
            {result?.connection?.status ?? "disconnected"}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Accounts</div>
          <div className="mt-2 text-sm font-semibold text-foreground">
            {result?.accounts.length ?? 0}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Services</div>
          <div className="mt-2 text-sm font-semibold text-foreground">
            {result?.services.length ?? 0}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Secrets</div>
          <div className="mt-2 text-sm font-semibold text-foreground">
            {result?.secretStored ? "Stored" : "Not saved"}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
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
                rateShoppingPriority: Number(event.target.value) || 10,
              }))
            }
          />
        </label>

        <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
          {result?.descriptor?.modeNotes ||
            "This page stores credentials in encrypted secret storage, not in the settings table. Verification is manual and read-only."}
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
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Secure Credentials</h2>
          <p className="text-sm text-muted-foreground">
            Save the ShipStation API key in encrypted storage. This does not
            make any external API calls by itself.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">API Base URL</span>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={apiBaseUrl}
              onChange={(event) => setApiBaseUrl(event.target.value)}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">API Key</span>
            <input
              type="password"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={result?.secretStored ? "Stored securely; enter to replace" : "Paste ShipStation API key"}
            />
          </label>
        </div>

        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            Requires `SHIPPING_PROVIDER_ENCRYPTION_KEY` in the Convex environment.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={saveCredentials}
              disabled={isSavingCredentials || !apiKey.trim()}
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
              {isVerifying ? "Verifying..." : "Verify Read-Only Connection"}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Carrier Accounts</h2>
              <p className="text-sm text-muted-foreground">
                Visible carrier connections synced from ShipStation.
              </p>
            </div>
            <button
              type="button"
              onClick={runVerification}
              disabled={isVerifying || !result?.secretStored}
              className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isVerifying ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          <div className="space-y-3">
            {result?.accounts?.length ? (
              result.accounts.map((account: any) => (
                <div
                  key={account._id}
                  className="rounded-xl border border-border px-4 py-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{account.carrierName}</p>
                      <p className="text-xs text-muted-foreground">
                        {account.nickname || account.carrierCode}
                      </p>
                    </div>
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {account.status}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {[
                      account.supportsRates ? "Rates" : null,
                      account.supportsLabels ? "Labels" : null,
                      account.supportsTracking ? "Tracking" : null,
                      account.supportsManifests ? "Manifests" : null,
                    ]
                      .filter(Boolean)
                      .join(" • ") || "No capabilities reported"}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No carrier accounts have been synced yet.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Services</h2>
            <p className="text-sm text-muted-foreground">
              Active service definitions discovered from connected carriers.
            </p>
          </div>
          <div className="space-y-3">
            {result?.services?.length ? (
              result.services.slice(0, 24).map((service: any) => (
                <div
                  key={service._id}
                  className="rounded-xl border border-border px-4 py-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{service.serviceName}</p>
                      <p className="text-xs text-muted-foreground">
                        {service.carrierCode} • {service.serviceCode}
                      </p>
                    </div>
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {service.isActive ? "active" : "inactive"}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No services have been synced yet.
              </p>
            )}
            {(result?.services?.length ?? 0) > 24 ? (
              <p className="text-xs text-muted-foreground">
                Showing the first 24 services. Refresh the connection after account changes in ShipStation.
              </p>
            ) : null}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Adapter Contract</h2>
          <p className="text-sm text-muted-foreground">
            This is the current normalized shipping status for the ShipStation adapter.
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
                  {operation.replace(/_/g, " ")}
                </span>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {status}
                </span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          {result?.descriptor?.primaryUseCase}
        </p>
      </section>
    </div>
  );
}
