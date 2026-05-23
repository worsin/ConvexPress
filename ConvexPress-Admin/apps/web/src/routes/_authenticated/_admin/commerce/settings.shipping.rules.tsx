import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import {
  Layers,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/settings/shipping/rules",
)({
  component: ShippingRulesPage,
});

const METHOD_TYPES = [
  { value: "live_rate", label: "Live Rate" },
  { value: "flat_rate", label: "Flat Rate" },
  { value: "free_shipping", label: "Free Shipping" },
  { value: "local_pickup", label: "Local Pickup" },
] as const;

const PROVIDERS = [
  { value: "shipstation", label: "ShipStation" },
  { value: "ups", label: "UPS" },
  { value: "usps", label: "USPS" },
  { value: "fedex", label: "FedEx" },
  { value: "dhl", label: "DHL" },
] as const;

type MethodType = (typeof METHOD_TYPES)[number]["value"];

function ShippingRulesPage() {
  const zones = useQuery(
    (api as any).shipping.queries.listZonesWithMethods,
    {},
  ) as any[] | undefined;
  const createMethod = useMutation(
    (api as any).shipping.mutations.createZoneMethod,
  );
  const updateMethod = useMutation(
    (api as any).shipping.mutations.updateZoneMethod,
  );
  const deleteMethod = useMutation(
    (api as any).shipping.mutations.deleteZoneMethod,
  );

  // Add method form state
  const [selectedZoneId, setSelectedZoneId] = useState("");
  const [methodLabel, setMethodLabel] = useState("");
  const [methodCode, setMethodCode] = useState("");
  const [methodType, setMethodType] = useState<MethodType>("live_rate");
  const [provider, setProvider] = useState("");
  const [flatRateAmount, setFlatRateAmount] = useState("");
  const [freeShippingMinimum, setFreeShippingMinimum] = useState("");

  function resetForm() {
    setMethodLabel("");
    setMethodCode("");
    setMethodType("live_rate");
    setProvider("");
    setFlatRateAmount("");
    setFreeShippingMinimum("");
  }

  async function handleCreateMethod(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedZoneId || !methodLabel.trim() || !methodCode.trim()) {
      toast.error("Zone, label, and method code are required.");
      return;
    }

    try {
      const pricingRules: Record<string, any> = {};
      if (methodType === "flat_rate" && flatRateAmount) {
        pricingRules.flatRateAmount = Number(flatRateAmount);
      }
      if (methodType === "free_shipping" && freeShippingMinimum) {
        pricingRules.freeShippingMinimum = Number(freeShippingMinimum);
      }

      await createMethod({
        zoneId: selectedZoneId,
        methodCode: methodCode.trim(),
        label: methodLabel.trim(),
        methodType,
        provider:
          methodType === "live_rate" && provider ? provider : undefined,
        pricingRules:
          Object.keys(pricingRules).length > 0 ? pricingRules : undefined,
      });
      toast.success("Method added.");
      resetForm();
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to create method.");
    }
  }

  async function handleToggleEnabled(methodId: string, currentEnabled: boolean) {
    try {
      await updateMethod({ methodId, enabled: !currentEnabled });
      toast.success(currentEnabled ? "Method disabled." : "Method enabled.");
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to update method.");
    }
  }

  async function handleDeleteMethod(methodId: string) {
    if (!confirm("Delete this shipping method?")) return;
    try {
      await deleteMethod({ methodId });
      toast.success("Method deleted.");
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to delete method.");
    }
  }

  return (
    <div className="w-full space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Layers className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-xl font-semibold text-foreground">
          Shipping Rules
        </h1>
      </div>

      <p className="text-sm text-muted-foreground">
        Assign shipping methods to zones. Methods control which rates appear at
        checkout for customers in that zone.
      </p>

      {/* Add method form */}
      <form
        onSubmit={handleCreateMethod}
        className="rounded-lg border border-border bg-card p-4 space-y-3"
      >
        <h2 className="text-sm font-semibold text-foreground">
          Add Zone Method
        </h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Zone selector */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Zone
            </label>
            <select
              value={selectedZoneId}
              onChange={(e) => setSelectedZoneId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Select zone...</option>
              {(zones ?? []).map((z: any) => (
                <option key={z._id} value={z._id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>

          {/* Label */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Label
            </label>
            <input
              type="text"
              value={methodLabel}
              onChange={(e) => setMethodLabel(e.target.value)}
              placeholder="e.g. Standard Shipping"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Method Code */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Method Code
            </label>
            <input
              type="text"
              value={methodCode}
              onChange={(e) => setMethodCode(e.target.value)}
              placeholder="e.g. flat_standard"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Method Type */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Method Type
            </label>
            <select
              value={methodType}
              onChange={(e) => setMethodType(e.target.value as MethodType)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {METHOD_TYPES.map((mt) => (
                <option key={mt.value} value={mt.value}>
                  {mt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Provider (live_rate) */}
          {methodType === "live_rate" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Provider
              </label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Any provider</option>
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Flat Rate Amount */}
          {methodType === "flat_rate" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Flat Rate Amount (cents)
              </label>
              <input
                type="number"
                value={flatRateAmount}
                onChange={(e) => setFlatRateAmount(e.target.value)}
                placeholder="e.g. 599"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          )}

          {/* Free Shipping Minimum */}
          {methodType === "free_shipping" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Minimum Order (cents, optional)
              </label>
              <input
                type="number"
                value={freeShippingMinimum}
                onChange={(e) => setFreeShippingMinimum(e.target.value)}
                placeholder="e.g. 5000"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          )}
        </div>

        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Add Method
        </button>
      </form>

      {/* Methods grouped by zone */}
      {zones === undefined ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : zones.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <Layers className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">
            Create shipping zones first, then add methods here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {zones.map((zone: any) => (
            <div
              key={zone._id}
              className="rounded-lg border border-border bg-card"
            >
              <div className="border-b border-border bg-muted/30 px-4 py-2.5">
                <h3 className="text-sm font-semibold text-foreground">
                  {zone.name}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {zone.countries.join(", ")}
                  </span>
                </h3>
              </div>

              <div className="p-4">
                {zone.methods?.length > 0 ? (
                  <div className="space-y-2">
                    {zone.methods.map((m: any) => (
                      <div
                        key={m._id}
                        className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2"
                      >
                        {/* Toggle */}
                        <button
                          type="button"
                          onClick={() =>
                            handleToggleEnabled(m._id, m.enabled !== false)
                          }
                          className="text-muted-foreground hover:text-foreground"
                          title={m.enabled !== false ? "Disable" : "Enable"}
                        >
                          {m.enabled !== false ? (
                            <ToggleRight className="h-5 w-5 text-success" />
                          ) : (
                            <ToggleLeft className="h-5 w-5" />
                          )}
                        </button>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-foreground">
                            {m.label}
                          </span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {m.methodCode}
                          </span>
                        </div>

                        {/* Type badge */}
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {m.methodType}
                        </span>

                        {/* Provider */}
                        {m.provider && (
                          <span className="text-xs text-muted-foreground">
                            {m.provider}
                          </span>
                        )}

                        {/* Pricing info */}
                        {m.methodType === "flat_rate" &&
                          m.pricingRules?.flatRateAmount != null && (
                            <span className="text-xs font-medium text-foreground">
                              {(m.pricingRules.flatRateAmount / 100).toFixed(2)}
                            </span>
                          )}

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => handleDeleteMethod(m._id)}
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No methods in this zone yet.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
