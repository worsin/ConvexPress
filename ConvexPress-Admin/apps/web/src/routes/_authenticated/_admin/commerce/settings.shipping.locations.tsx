import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import { Warehouse, Plus, Trash2, Star } from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/settings/shipping/locations",
)({
  component: ShipFromLocationsPage,
});

const LOCATION_TYPES = [
  { value: "warehouse", label: "Warehouse" },
  { value: "retail_store", label: "Retail Store" },
  { value: "fulfillment_center", label: "Fulfillment Center" },
  { value: "dropshipper", label: "Dropshipper" },
  { value: "other", label: "Other" },
] as const;

function ShipFromLocationsPage() {
  const locations = useQuery(
    (api as any).shipping.shipFromLocations.queries.list,
    { includeArchived: false, includeInactive: true },
  ) as any[] | undefined;

  const createLocation = useMutation(
    (api as any).shipping.shipFromLocations.mutations.create,
  );
  const archiveLocation = useMutation(
    (api as any).shipping.shipFromLocations.mutations.archive,
  );
  const setDefault = useMutation(
    (api as any).shipping.shipFromLocations.mutations.setDefault,
  );

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    code: "",
    locationType: "warehouse" as (typeof LOCATION_TYPES)[number]["value"],
    contactName: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
    countryCode: "US",
    timezone: "America/New_York",
    isPickupEnabled: false,
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (
      !form.name.trim() ||
      !form.code.trim() ||
      !form.line1.trim() ||
      !form.city.trim() ||
      !form.state.trim() ||
      !form.postalCode.trim() ||
      !form.contactName.trim()
    ) {
      toast.error("Name, code, contact name, and full address are required.");
      return;
    }
    try {
      await createLocation({
        name: form.name.trim(),
        code: form.code.trim(),
        locationType: form.locationType,
        address: {
          contactName: form.contactName.trim(),
          line1: form.line1.trim(),
          line2: form.line2.trim() || undefined,
          city: form.city.trim(),
          state: form.state.trim(),
          postalCode: form.postalCode.trim(),
          countryCode: form.countryCode.trim().toUpperCase(),
        },
        timezone: form.timezone.trim(),
        isPickupEnabled: form.isPickupEnabled,
      });
      toast.success("Location created.");
      setShowForm(false);
      setForm({
        name: "",
        code: "",
        locationType: "warehouse",
        contactName: "",
        line1: "",
        line2: "",
        city: "",
        state: "",
        postalCode: "",
        countryCode: "US",
        timezone: "America/New_York",
        isPickupEnabled: false,
      });
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to create location.");
    }
  }

  async function handleArchive(locationId: string) {
    if (!confirm("Archive this location? It will no longer be available for fulfillment.")) {
      return;
    }
    try {
      await archiveLocation({ locationId });
      toast.success("Location archived.");
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to archive location.");
    }
  }

  async function handleSetDefault(locationId: string) {
    try {
      await setDefault({ locationId });
      toast.success("Default location updated.");
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to set default.");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Warehouse className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold text-foreground">Ship-From Locations</h1>
            <p className="text-sm text-muted-foreground">
              Warehouses, stores, and fulfillment centers your orders ship from.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Add Location
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border border-border bg-card p-4 space-y-3"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Name *" value={form.name} onChange={(v) => set("name", v)} placeholder="Main Warehouse" />
            <Field label="Code *" value={form.code} onChange={(v) => set("code", v)} placeholder="WH-OH-01" />
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Type
              </label>
              <select
                value={form.locationType}
                onChange={(e) => set("locationType", e.target.value as any)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {LOCATION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <Field label="Contact Name *" value={form.contactName} onChange={(v) => set("contactName", v)} placeholder="Warehouse Manager" />
            <Field label="Address Line 1 *" value={form.line1} onChange={(v) => set("line1", v)} placeholder="123 Industrial Way" />
            <Field label="Address Line 2" value={form.line2} onChange={(v) => set("line2", v)} placeholder="Suite 100" />
            <Field label="City *" value={form.city} onChange={(v) => set("city", v)} placeholder="Columbus" />
            <Field label="State *" value={form.state} onChange={(v) => set("state", v)} placeholder="OH" />
            <Field label="Postal Code *" value={form.postalCode} onChange={(v) => set("postalCode", v)} placeholder="43215" />
            <Field label="Country" value={form.countryCode} onChange={(v) => set("countryCode", v)} placeholder="US" />
            <Field label="Timezone" value={form.timezone} onChange={(v) => set("timezone", v)} placeholder="America/New_York" />
            <label className="flex items-center gap-2 self-end pb-2">
              <input
                type="checkbox"
                checked={form.isPickupEnabled}
                onChange={(e) => set("isPickupEnabled", e.target.checked)}
                className="rounded border-border"
              />
              <span className="text-sm text-foreground">Allow customer pickup at this location</span>
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Create
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted">
              Cancel
            </button>
          </div>
        </form>
      )}

      {locations === undefined ? (
        <p className="text-sm text-muted-foreground">Loading locations...</p>
      ) : locations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <Warehouse className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">No ship-from locations yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {locations.map((loc: any) => (
            <div key={loc._id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground">{loc.name}</h3>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {loc.code}
                    </span>
                    {loc.isDefault && (
                      <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                        <Star className="h-3 w-3" />
                        Default
                      </span>
                    )}
                    {loc.isPickupEnabled && (
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-600">
                        Pickup enabled
                      </span>
                    )}
                    {!loc.isActive && (
                      <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-600">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {loc.address.line1}
                    {loc.address.line2 ? `, ${loc.address.line2}` : ""}, {loc.address.city}, {loc.address.state} {loc.address.postalCode} ({loc.address.countryCode})
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {loc.locationType.replace("_", " ")} · {loc.timezone}
                  </div>
                </div>
                <div className="flex gap-1">
                  {!loc.isDefault && (
                    <button
                      type="button"
                      onClick={() => handleSetDefault(loc._id)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Set as default"
                    >
                      <Star className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleArchive(loc._id)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                    title="Archive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );
}
