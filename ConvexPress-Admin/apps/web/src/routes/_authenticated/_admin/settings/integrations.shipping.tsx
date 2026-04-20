import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";

import { ShippingIntegrationOverview } from "@/components/integrations/shipping/ShippingIntegrationOverview";

export const Route = createFileRoute(
  "/_authenticated/_admin/settings/integrations/shipping",
)({
  component: ShippingIntegrationsPage,
});

function ShippingIntegrationsPage() {
  const overview = useQuery((api as any).shipping.queries.getOverview, {}) as
    | {
        integrationSettings: {
          preferredProvider: string;
          liveRatesEnabled: boolean;
          fallbackToManualRates: boolean;
          quoteCacheTtlSeconds: number;
        };
        providers: Array<{
          provider: string;
          accountCount: number;
          connection: { status: string } | null;
          settings: {
            rateShoppingEnabled: boolean;
            rateShoppingPriority: number;
          };
          descriptor: {
            title: string;
            summary: string;
            implementationStatus: string;
          };
        }>;
      }
    | undefined;

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">Shipping Integrations</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Manage multi-carrier shipping connections for the commerce runtime.
          ShipStation is the first aggregator path. Direct UPS, USPS, FedEx,
          and DHL adapters hang off the same contract.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Preferred</div>
          <div className="mt-2 text-sm font-semibold text-foreground">
            {overview?.integrationSettings.preferredProvider || "None"}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Live Rates</div>
          <div className="mt-2 text-sm font-semibold text-foreground">
            {overview?.integrationSettings.liveRatesEnabled ? "Enabled" : "Disabled"}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Fallback</div>
          <div className="mt-2 text-sm font-semibold text-foreground">
            {overview?.integrationSettings.fallbackToManualRates ? "Manual rates on failure" : "No fallback"}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Quote Cache</div>
          <div className="mt-2 text-sm font-semibold text-foreground">
            {overview?.integrationSettings.quoteCacheTtlSeconds ?? 300}s
          </div>
        </div>
      </div>

      <ShippingIntegrationOverview providers={overview?.providers} />

      <div className="rounded-xl border border-dashed border-border bg-card/60 p-5">
        <p className="text-sm text-muted-foreground">
          ShipStation is fully active. UPS, USPS, FedEx, and DHL all support
          direct live rating. UPS and FedEx also support label purchase and
          tracking. USPS supports tracking. DHL is rates-only.
        </p>
        <div className="mt-3">
          <Link
            to="/settings/integrations"
            className="text-sm font-medium text-primary hover:underline"
          >
            Back to integrations overview
          </Link>
        </div>
      </div>
    </div>
  );
}
