import { useState } from "react";
import {
  Outlet,
  createFileRoute,
  Link,
  useLocation,
} from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, ToggleLeft, ToggleRight, Pencil } from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/settings/shipping/zones_/$zoneId",
)({
  component: ZoneMethodsPage,
});

const METHOD_TYPES = [
  { value: "flat_rate", label: "Flat Rate", desc: "Fixed cost per order, item, or class" },
  { value: "weight_based", label: "Weight-Based", desc: "Tiered cost by total cart weight" },
  { value: "dimensional", label: "Dimensional (DIM)", desc: "Billable weight = max(actual, DIM)" },
  { value: "price_based", label: "Price-Based", desc: "Tiered cost by cart subtotal" },
  { value: "quantity_based", label: "Quantity-Based", desc: "Tiered cost by item count" },
  { value: "free", label: "Free Shipping", desc: "Conditional zero-cost shipping" },
  { value: "local_pickup", label: "Local Pickup", desc: "In-store pickup, no shipping" },
  { value: "local_delivery", label: "Local Delivery", desc: "Same-day / next-day local routes" },
  { value: "table_rate", label: "Table Rate", desc: "Multi-condition rule table (advanced)" },
] as const;

function ZoneMethodsPage() {
  const location = useLocation();
  const { zoneId } = Route.useParams();
  const zone = useQuery((api as any).shipping.zones.queries.getZone, {
    zoneId,
  }) as any | undefined;
  const methods = useQuery((api as any).shipping.methods.queries.listMethodsForZone, {
    zoneId,
  }) as Array<{ methodType: string; config: any }> | undefined;

  const createMethod = useMutation((api as any).shipping.methods.mutations.createMethod);
  const deleteMethod = useMutation((api as any).shipping.methods.mutations.deleteMethod);
  const toggleEnabled = useMutation(
    (api as any).shipping.methods.mutations.toggleMethodEnabled,
  );

  const [showPicker, setShowPicker] = useState(false);

  if (location.pathname.includes("/methods/")) {
    return <Outlet />;
  }

  async function handleAdd(methodType: string) {
    const baseConfig: Record<string, any> = {
      zoneId,
      name: "New " + methodType.replace(/_/g, " "),
      label: METHOD_TYPES.find((m) => m.value === methodType)?.label ?? "Method",
      enabled: true,
      sortOrder: 100,
    };
    // Method-type-specific defaults so the schema validator passes.
    switch (methodType) {
      case "flat_rate":
        baseConfig.baseCost = 0;
        baseConfig.costMode = "per_order";
        break;
      case "weight_based":
        baseConfig.weightUnit = "oz";
        baseConfig.tiers = [{ minWeight: 0, cost: 5 }];
        break;
      case "dimensional":
        baseConfig.divisor = 139;
        baseConfig.weightUnit = "lb";
        baseConfig.tiers = [{ minWeight: 0, cost: 5 }];
        break;
      case "price_based":
        baseConfig.currencyCode = "USD";
        baseConfig.tiers = [{ minSubtotal: 0, cost: 5 }];
        break;
      case "quantity_based":
        baseConfig.countMode = "total_items";
        baseConfig.tiers = [{ minCount: 0, cost: 5 }];
        break;
      case "free":
        baseConfig.conditionType = "always";
        break;
      case "local_pickup":
        baseConfig.allowedPickupLocationIds = [];
        break;
      case "local_delivery":
        baseConfig.shipFromLocationId = undefined;
        baseConfig.restrictionMode = "postcode_allowlist";
        baseConfig.allowedPostcodes = [];
        baseConfig.pricingMode = "flat";
        baseConfig.flatCost = 5;
        break;
      case "table_rate":
        baseConfig.matchMode = "first_match";
        baseConfig.rows = [];
        break;
    }
    try {
      await createMethod({ methodType, config: baseConfig });
      toast.success(`${baseConfig.label} added.`);
      setShowPicker(false);
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to add method.");
    }
  }

  async function handleDelete(methodType: string, methodId: string) {
    if (!confirm("Delete this method?")) return;
    try {
      await deleteMethod({ methodType, methodId });
      toast.success("Method deleted.");
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to delete method.");
    }
  }

  async function handleToggle(methodType: string, methodId: string, current: boolean) {
    try {
      await toggleEnabled({ methodType, methodId, enabled: !current });
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Toggle failed.");
    }
  }

  return (
    <div className="w-full space-y-6 p-6">
      <Link
        to="/commerce/settings/shipping/zones"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to zones
      </Link>

      <header>
        <h1 className="text-xl font-semibold text-foreground">
          {zone?.name ?? "Zone"} — Shipping Methods
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Methods are evaluated in sort order. Disabled methods are skipped at
          checkout but retained.
        </p>
      </header>

      <div>
        <button
          type="button"
          onClick={() => setShowPicker((s) => !s)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Add Method
        </button>
      </div>

      {showPicker && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            Pick a method type
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
            {METHOD_TYPES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => handleAdd(m.value)}
                className="rounded-md border border-border bg-background p-3 text-left hover:bg-muted"
              >
                <div className="text-sm font-medium text-foreground">{m.label}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{m.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {methods === undefined ? (
        <p className="text-sm text-muted-foreground">Loading methods...</p>
      ) : methods.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No shipping methods yet. Click "Add Method" to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {methods.map(({ methodType, config }) => {
            const meta = METHOD_TYPES.find((m) => m.value === methodType);
            return (
              <div
                key={String(config._id)}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">
                        {config.label || config.name}
                      </h3>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {meta?.label ?? methodType}
                      </span>
                      {!config.enabled && (
                        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-600">
                          Disabled
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {summarizeMethod(methodType, config)}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Link
                      to="/commerce/settings/shipping/zones_/$zoneId/methods_/$methodType/$methodId"
                      params={{
                        zoneId,
                        methodType,
                        methodId: String(config._id),
                      }}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleToggle(methodType, config._id, config.enabled)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title={config.enabled ? "Disable" : "Enable"}
                    >
                      {config.enabled ? (
                        <ToggleRight className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <ToggleLeft className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(methodType, config._id)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function summarizeMethod(methodType: string, config: any): string {
  switch (methodType) {
    case "flat_rate":
      return `$${config.baseCost} ${config.costMode?.replace(/_/g, " ") ?? ""}`;
    case "weight_based":
      return `${config.tiers?.length ?? 0} weight tier(s) in ${config.weightUnit}`;
    case "dimensional":
      return `DIM divisor ${config.divisor}, ${config.tiers?.length ?? 0} tier(s)`;
    case "price_based":
      return `${config.tiers?.length ?? 0} subtotal tier(s) in ${config.currencyCode}`;
    case "quantity_based":
      return `${config.countMode?.replace(/_/g, " ")} — ${config.tiers?.length ?? 0} tier(s)`;
    case "free":
      return `Condition: ${config.conditionType?.replace(/_/g, " ")}`;
    case "local_pickup":
      return `${config.allowedPickupLocationIds?.length ?? 0} pickup location(s)`;
    case "local_delivery":
      return `${config.restrictionMode}, ${config.pricingMode} pricing`;
    case "table_rate":
      return `${config.rows?.length ?? 0} rule row(s), match: ${config.matchMode}`;
    default:
      return "";
  }
}
