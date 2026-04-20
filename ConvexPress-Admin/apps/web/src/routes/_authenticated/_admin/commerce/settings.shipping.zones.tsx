import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import {
  Globe,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Package,
} from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/settings/shipping/zones",
)({
  component: ShippingZonesPage,
});

function ShippingZonesPage() {
  // PRD A1 v2 backend wiring. The legacy listZonesWithMethods query
  // remains in convex/shipping for backward compatibility while v2 owns
  // the zone CRUD surface.
  const zones = useQuery(
    (api as any).shipping.zones.queries.listZones,
    {},
  ) as any[] | undefined;
  const createZone = useMutation(
    (api as any).shipping.zones.mutations.createZone,
  );
  const deleteZone = useMutation(
    (api as any).shipping.zones.mutations.deleteZone,
  );

  const [name, setName] = useState("");
  const [countries, setCountries] = useState("");
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());

  async function handleCreateZone(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !countries.trim()) {
      toast.error("Zone name and at least one country code are required.");
      return;
    }
    try {
      await createZone({
        name: name.trim(),
        countries: countries
          .split(",")
          .map((c: string) => c.trim().toUpperCase())
          .filter(Boolean),
      });
      toast.success("Shipping zone created.");
      setName("");
      setCountries("");
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to create zone.");
    }
  }

  async function handleDeleteZone(zoneId: string) {
    if (!confirm("Delete this zone and all its methods?")) return;
    try {
      await deleteZone({ zoneId });
      toast.success("Zone deleted.");
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to delete zone.");
    }
  }

  function toggleZone(zoneId: string) {
    setExpandedZones((prev) => {
      const next = new Set(prev);
      if (next.has(zoneId)) next.delete(zoneId);
      else next.add(zoneId);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Globe className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-xl font-semibold text-foreground">
          Shipping Zones
        </h1>
      </div>

      <p className="text-sm text-muted-foreground">
        Define geographic zones and assign shipping methods to each. Zones are
        matched top-to-bottom by sort order; the first matching zone wins.
      </p>

      {/* Add zone form */}
      <form
        onSubmit={handleCreateZone}
        className="rounded-lg border border-border bg-card p-4 space-y-3"
      >
        <h2 className="text-sm font-semibold text-foreground">Add Zone</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Zone Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Domestic US"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Country Codes (comma-separated)
            </label>
            <input
              type="text"
              value={countries}
              onChange={(e) => setCountries(e.target.value)}
              placeholder="e.g. US, CA"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Add Zone
        </button>
      </form>

      {/* Zone list */}
      {zones === undefined ? (
        <p className="text-sm text-muted-foreground">Loading zones...</p>
      ) : zones.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <Globe className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">
            No shipping zones configured yet.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {zones.map((zone: any) => {
            const expanded = expandedZones.has(zone._id);
            return (
              <div
                key={zone._id}
                className="rounded-lg border border-border bg-card"
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleZone(zone._id)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {expanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground">
                      {zone.name}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {zone.countries.join(", ")}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    <Package className="h-3 w-3" />
                    {zone.methods?.length ?? 0} method
                    {(zone.methods?.length ?? 0) !== 1 ? "s" : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteZone(zone._id)}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {expanded && (
                  <div className="border-t border-border px-4 py-3">
                    {zone.states?.length > 0 && (
                      <p className="mb-1 text-xs text-muted-foreground">
                        <span className="font-medium">States:</span>{" "}
                        {zone.states.join(", ")}
                      </p>
                    )}
                    {zone.postalCodeRules?.length > 0 && (
                      <p className="mb-1 text-xs text-muted-foreground">
                        <span className="font-medium">Postal rules:</span>{" "}
                        {zone.postalCodeRules.join(", ")}
                      </p>
                    )}

                    <h3 className="mt-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Methods
                    </h3>
                    {zone.methods?.length > 0 ? (
                      <div className="space-y-1">
                        {zone.methods.map((m: any) => (
                          <div
                            key={m._id}
                            className="flex items-center gap-2 rounded bg-muted/50 px-3 py-1.5 text-xs"
                          >
                            <span
                              className={`inline-block h-2 w-2 rounded-full ${m.enabled ? "bg-success" : "bg-muted-foreground"}`}
                            />
                            <span className="font-medium text-foreground">
                              {m.label}
                            </span>
                            <span className="text-muted-foreground">
                              ({m.methodType}
                              {m.provider ? ` / ${m.provider}` : ""})
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No methods assigned. Add methods on the Rules page.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
