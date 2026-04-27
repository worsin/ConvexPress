import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import { PluginGuard } from "@/components/plugins/PluginGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/returns/settings",
)({
  component: CommerceReturnsSettingsPage,
});

function CommerceReturnsSettingsPage() {
  const settings = useQuery(api.settings.queries.getBySection, {
    section: "commerce.general" as any,
  }) as any;
  const updateSection = useMutation(api.settings.mutations.updateSection);
  const runBackfill = useMutation(
    (api as any).commerceReturns.migrations.runBackfill,
  );

  const [returnWindowDays, setReturnWindowDays] = useState(30);
  const [requireDeliveryBeforeReturn, setRequireDeliveryBeforeReturn] =
    useState(true);
  const [initialized, setInitialized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);

  useEffect(() => {
    if (!settings || initialized) return;
    setReturnWindowDays(settings.returnWindowDays ?? 30);
    setRequireDeliveryBeforeReturn(
      settings.requireDeliveryBeforeReturn ?? true,
    );
    setInitialized(true);
  }, [initialized, settings]);

  async function handleSave() {
    if (!settings) return;

    setIsSaving(true);
    try {
      await updateSection({
        section: "commerce.general" as any,
        values: {
          storeName: settings.storeName ?? "",
          storeEmail: settings.storeEmail ?? "",
          currencyCode: settings.currencyCode ?? "USD",
          currencySymbol: settings.currencySymbol ?? "$",
          pricesIncludeTax: settings.pricesIncludeTax ?? false,
          taxRateBasis: settings.taxRateBasis ?? "shipping",
          defaultCountryCode: settings.defaultCountryCode ?? "US",
          defaultState: settings.defaultState ?? "",
          checkoutRequiresPhone: settings.checkoutRequiresPhone ?? false,
          allowGuestCheckout: settings.allowGuestCheckout ?? true,
          shippingEnabled: settings.shippingEnabled ?? true,
          returnWindowDays,
          requireDeliveryBeforeReturn,
          shippingMethods: settings.shippingMethods ?? [],
          paymentMethods: settings.paymentMethods ?? [],
        },
      });
      toast.success("Return policy settings saved.");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          (error instanceof Error ? error.message : "Failed to save return settings"),
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <PluginGuard pluginId="commerceReturns">
      <div className="space-y-6">
        <div className="space-y-2">
          <Link
            to={"/commerce/returns" as any}
            className="text-sm text-primary hover:underline"
          >
            Back to returns
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Return Settings</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Configure the customer eligibility policy used by return requests and
            the order-detail return CTA.
          </p>
        </div>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Eligibility Policy</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            These settings are enforced server-side by the returns eligibility
            helper and reflected in customer-facing return messaging.
          </p>

          <div className="mt-6 grid gap-4 md:max-w-xl">
            <div className="grid gap-2">
              <Label htmlFor="return-window-days">Return window (days)</Label>
              <Input
                id="return-window-days"
                type="number"
                min="0"
                max="365"
                value={String(returnWindowDays)}
                onChange={(event) =>
                  setReturnWindowDays(Number(event.target.value))
                }
              />
              <p className="text-xs text-muted-foreground">
                Set to `0` to disable the time limit.
              </p>
            </div>

            <label className="flex items-center gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={requireDeliveryBeforeReturn}
                onChange={(event) =>
                  setRequireDeliveryBeforeReturn(event.target.checked)
                }
              />
              Require delivery confirmation before customers can request a return
            </label>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Migrations &amp; Backfill</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Seeds the return email templates and populates missing return items
            and history rows for returns created before the new schema. Safe to
            re-run; only inserts rows that are still missing.
          </p>
          <div className="mt-4">
            <Button
              variant="secondary"
              disabled={isBackfilling}
              onClick={async () => {
                setIsBackfilling(true);
                try {
                  const result = (await runBackfill({})) as {
                    totalReturns: number;
                    createdTemplates: number;
                    createdReturnItems: number;
                    createdHistoryEntries: number;
                  };
                  toast.success(
                    `Backfill complete — ${result.createdTemplates} templates, ${result.createdReturnItems} item rows, ${result.createdHistoryEntries} history entries across ${result.totalReturns} returns.`,
                  );
                } catch (error) {
                  toast.error(
                    (error as { data?: { message?: string } })?.data?.message ??
                      (error instanceof Error
                        ? error.message
                        : "Backfill failed"),
                  );
                } finally {
                  setIsBackfilling(false);
                }
              }}
            >
              {isBackfilling ? "Running backfill..." : "Run returns backfill"}
            </Button>
          </div>
        </section>

        <div className="flex gap-3">
          <Button onClick={() => void handleSave()} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Return Settings"}
          </Button>
          <Link
            to={"/commerce/settings" as any}
            className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Open Commerce Settings
          </Link>
        </div>
      </div>
    </PluginGuard>
  );
}
