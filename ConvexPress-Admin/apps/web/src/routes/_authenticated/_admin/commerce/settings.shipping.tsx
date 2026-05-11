import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/settings/shipping",
)({
  component: CommerceShippingSettingsPage,
});

function CommerceShippingSettingsPage() {
  const settings = useQuery(api.settings.queries.getBySection, {
    section: "integrations.shipping" as any,
  }) as any;
  const updateSection = useMutation(api.settings.mutations.updateSection);

  const [preferredProvider, setPreferredProvider] = useState("shipstation");
  const [liveRatesEnabled, setLiveRatesEnabled] = useState(true);
  const [fallbackToManualRates, setFallbackToManualRates] = useState(false);
  const [cheapestBadgeLabel, setCheapestBadgeLabel] = useState("Cheapest");
  const [fastestBadgeLabel, setFastestBadgeLabel] = useState("Fastest");
  const [bestOptionBadgeLabel, setBestOptionBadgeLabel] = useState("Best Option");
  const [quoteCacheTtlSeconds, setQuoteCacheTtlSeconds] = useState(300);
  const [defaultPackageWeightOz, setDefaultPackageWeightOz] = useState(16);
  const [shipFromName, setShipFromName] = useState("");
  const [shipFromCompany, setShipFromCompany] = useState("");
  const [shipFromLine1, setShipFromLine1] = useState("");
  const [shipFromLine2, setShipFromLine2] = useState("");
  const [shipFromCity, setShipFromCity] = useState("");
  const [shipFromState, setShipFromState] = useState("");
  const [shipFromPostalCode, setShipFromPostalCode] = useState("");
  const [shipFromCountryCode, setShipFromCountryCode] = useState("US");
  const [initialized, setInitialized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!settings || initialized) return;
    setPreferredProvider(settings.preferredProvider ?? "shipstation");
    setLiveRatesEnabled(settings.liveRatesEnabled ?? true);
    setFallbackToManualRates(settings.fallbackToManualRates ?? false);
    setCheapestBadgeLabel(settings.cheapestBadgeLabel ?? "Cheapest");
    setFastestBadgeLabel(settings.fastestBadgeLabel ?? "Fastest");
    setBestOptionBadgeLabel(settings.bestOptionBadgeLabel ?? "Best Option");
    setQuoteCacheTtlSeconds(settings.quoteCacheTtlSeconds ?? 300);
    setDefaultPackageWeightOz(settings.defaultPackageWeightOz ?? 16);
    setShipFromName(settings.shipFromName ?? "");
    setShipFromCompany(settings.shipFromCompany ?? "");
    setShipFromLine1(settings.shipFromLine1 ?? "");
    setShipFromLine2(settings.shipFromLine2 ?? "");
    setShipFromCity(settings.shipFromCity ?? "");
    setShipFromState(settings.shipFromState ?? "");
    setShipFromPostalCode(settings.shipFromPostalCode ?? "");
    setShipFromCountryCode(settings.shipFromCountryCode ?? "US");
    setInitialized(true);
  }, [initialized, settings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSection({
        section: "integrations.shipping" as any,
        values: {
          preferredProvider,
          liveRatesEnabled,
          fallbackToManualRates,
          recommendationStrategy: "best_value_weighted",
          cheapestBadgeLabel,
          fastestBadgeLabel,
          bestOptionBadgeLabel,
          quoteCacheTtlSeconds,
          defaultPackageWeightOz,
          shipFromName,
          shipFromCompany,
          shipFromLine1,
          shipFromLine2,
          shipFromCity,
          shipFromState,
          shipFromPostalCode,
          shipFromCountryCode,
        },
      });
      toast.success("Shipping presentation settings saved.");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          (error instanceof Error ? error.message : "Failed to save shipping settings"),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Shipping Settings</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Control quote ranking, provider preference, badge copy, and checkout
            fallback behavior. Credentials stay in Settings → Integrations.
          </p>
        </div>
        <Link
          to="/settings/integrations/shipping"
          className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/60"
        >
          Open Integrations
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Runtime</h2>
          <div className="mt-4 grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-foreground">Preferred provider</span>
              <select
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={preferredProvider}
                onChange={(event) => setPreferredProvider(event.target.value)}
              >
                <option value="shipstation">ShipStation</option>
                <option value="ups">UPS</option>
                <option value="usps">USPS</option>
                <option value="fedex">FedEx</option>
                <option value="dhl">DHL</option>
              </select>
            </label>

            <label className="flex items-center gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={liveRatesEnabled}
                onChange={(event) => setLiveRatesEnabled(event.target.checked)}
              />
              Enable live rates
            </label>

            <label className="flex items-center gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={fallbackToManualRates}
                onChange={(event) => setFallbackToManualRates(event.target.checked)}
              />
              Fall back to manual methods when providers fail
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-foreground">Quote cache TTL (seconds)</span>
              <input
                type="number"
                min={30}
                max={3600}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={quoteCacheTtlSeconds}
                onChange={(event) => setQuoteCacheTtlSeconds(Number(event.target.value))}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-foreground">Default package weight (oz)</span>
              <input
                type="number"
                min={1}
                max={640}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={defaultPackageWeightOz}
                onChange={(event) => setDefaultPackageWeightOz(Number(event.target.value))}
              />
            </label>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Badge Copy</h2>
          <div className="mt-4 grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-foreground">Best option badge</span>
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={bestOptionBadgeLabel}
                onChange={(event) => setBestOptionBadgeLabel(event.target.value)}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-foreground">Cheapest badge</span>
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={cheapestBadgeLabel}
                onChange={(event) => setCheapestBadgeLabel(event.target.value)}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-foreground">Fastest badge</span>
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={fastestBadgeLabel}
                onChange={(event) => setFastestBadgeLabel(event.target.value)}
              />
            </label>
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Ship From Address</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Live carrier rates need a valid origin address.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-foreground">Name</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={shipFromName}
              onChange={(event) => setShipFromName(event.target.value)}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-foreground">Company</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={shipFromCompany}
              onChange={(event) => setShipFromCompany(event.target.value)}
            />
          </label>
          <label className="grid gap-2 md:col-span-2">
            <span className="text-sm font-medium text-foreground">Address line 1</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={shipFromLine1}
              onChange={(event) => setShipFromLine1(event.target.value)}
            />
          </label>
          <label className="grid gap-2 md:col-span-2">
            <span className="text-sm font-medium text-foreground">Address line 2</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={shipFromLine2}
              onChange={(event) => setShipFromLine2(event.target.value)}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-foreground">City</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={shipFromCity}
              onChange={(event) => setShipFromCity(event.target.value)}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-foreground">State</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={shipFromState}
              onChange={(event) => setShipFromState(event.target.value)}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-foreground">Postal code</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={shipFromPostalCode}
              onChange={(event) => setShipFromPostalCode(event.target.value)}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-foreground">Country code</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={shipFromCountryCode}
              onChange={(event) => setShipFromCountryCode(event.target.value.toUpperCase())}
            />
          </label>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <Link
          to="/commerce/settings/shipping/zones"
          className="rounded-xl border border-border bg-card p-5 hover:bg-muted/40"
        >
          <div className="text-sm font-semibold text-foreground">Zones</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Geographic regions where you offer shipping. Methods attach to zones.
          </p>
        </Link>
        <Link
          to="/commerce/settings/shipping/classes"
          className="rounded-xl border border-border bg-card p-5 hover:bg-muted/40"
        >
          <div className="text-sm font-semibold text-foreground">Classes</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Per-product shipping categories (Fragile, Heavy, Hazmat).
          </p>
        </Link>
        <Link
          to="/commerce/settings/shipping/packages"
          className="rounded-xl border border-border bg-card p-5 hover:bg-muted/40"
        >
          <div className="text-sm font-semibold text-foreground">Packages</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Box templates, dimensions, and DIM weight defaults.
          </p>
        </Link>
        <Link
          to="/commerce/settings/shipping/locations"
          className="rounded-xl border border-border bg-card p-5 hover:bg-muted/40"
        >
          <div className="text-sm font-semibold text-foreground">Ship-From Locations</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Warehouses, retail stores, and fulfillment centers.
          </p>
        </Link>
        <Link
          to="/commerce/settings/shipping/rules"
          className="rounded-xl border border-border bg-card p-5 hover:bg-muted/40"
        >
          <div className="text-sm font-semibold text-foreground">Rules</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Rate display rules and conditional shipping logic.
          </p>
        </Link>
        <Link
          to="/commerce/settings/shipping/test-rates"
          className="rounded-xl border border-border bg-card p-5 hover:bg-muted/40"
        >
          <div className="text-sm font-semibold text-foreground">Test Rates</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Run the rate pipeline against a test address and see the diagnostic trace.
          </p>
        </Link>
        <Link
          to="/commerce/shipping/manifests"
          className="rounded-xl border border-border bg-card p-5 hover:bg-muted/40"
        >
          <div className="text-sm font-semibold text-foreground">Manifests</div>
          <p className="mt-1 text-xs text-muted-foreground">
            End-of-day carrier manifests for SCAN forms and pickup. Auto-closes per cutoff.
          </p>
        </Link>
        <Link
          to="/commerce/shipping/tracking"
          className="rounded-xl border border-border bg-card p-5 hover:bg-muted/40"
        >
          <div className="text-sm font-semibold text-foreground">Tracking Health</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Webhook + cron-driven tracking sync overview.
          </p>
        </Link>
      </div>

      <div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "Saving..." : "Save Shipping Settings"}
        </button>
      </div>
    </div>
  );
}
