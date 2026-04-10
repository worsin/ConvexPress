import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import {
  Package,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  Box,
  Ruler,
  Weight,
} from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/settings/shipping/packages",
)({
  component: ShippingPackagesPage,
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const PACKAGE_TYPES = [
  { value: "custom_box", label: "Custom Box" },
  { value: "flat_rate_box", label: "Flat Rate Box" },
  { value: "flat_rate_envelope", label: "Flat Rate Envelope" },
  { value: "poly_mailer", label: "Poly Mailer" },
  { value: "padded_envelope", label: "Padded Envelope" },
  { value: "tube", label: "Tube" },
  { value: "carrier_provided", label: "Carrier Provided" },
] as const;

function formatDimensions(dims: any) {
  if (!dims) return "--";
  return `${dims.length}" x ${dims.width}" x ${dims.height}"`;
}

function formatWeight(weight: number | undefined) {
  if (weight === undefined || weight === null) return "--";
  if (weight >= 16) {
    return `${(weight / 16).toFixed(1)} lb`;
  }
  return `${weight} oz`;
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

function ShippingPackagesPage() {
  const packages = useQuery(
    (api as any).shipping.queries.listPackages,
    {},
  ) as any[] | undefined;

  const createPkg = useMutation((api as any).shipping.mutations.createPackage);
  const updatePkg = useMutation((api as any).shipping.mutations.updatePackage);
  const deletePkg = useMutation((api as any).shipping.mutations.deletePackage);

  // Create form state
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [packageType, setPackageType] = useState("custom_box");
  const [weight, setWeight] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [carrierCode, setCarrierCode] = useState("");
  const [showForm, setShowForm] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editWeight, setEditWeight] = useState("");
  const [editLength, setEditLength] = useState("");
  const [editWidth, setEditWidth] = useState("");
  const [editHeight, setEditHeight] = useState("");

  function resetForm() {
    setCode("");
    setLabel("");
    setPackageType("custom_box");
    setWeight("");
    setLength("");
    setWidth("");
    setHeight("");
    setCarrierCode("");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !label.trim()) {
      toast.error("Package code and label are required.");
      return;
    }

    try {
      const dimensions =
        length && width && height
          ? {
              length: parseFloat(length),
              width: parseFloat(width),
              height: parseFloat(height),
            }
          : undefined;

      await createPkg({
        code: code.trim(),
        label: label.trim(),
        packageType,
        weight: weight ? parseFloat(weight) : undefined,
        dimensions,
        carrierCode: carrierCode.trim() || undefined,
      });
      toast.success("Package created.");
      resetForm();
      setShowForm(false);
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to create package.");
    }
  }

  async function handleDelete(packageId: string) {
    if (!confirm("Delete this package definition?")) return;
    try {
      await deletePkg({ packageId });
      toast.success("Package deleted.");
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to delete package.");
    }
  }

  function startEdit(pkg: any) {
    setEditingId(pkg._id);
    setEditLabel(pkg.label);
    setEditWeight(pkg.weight ? String(pkg.weight) : "");
    setEditLength(pkg.dimensions?.length ? String(pkg.dimensions.length) : "");
    setEditWidth(pkg.dimensions?.width ? String(pkg.dimensions.width) : "");
    setEditHeight(pkg.dimensions?.height ? String(pkg.dimensions.height) : "");
  }

  async function saveEdit(packageId: string) {
    try {
      const dimensions =
        editLength && editWidth && editHeight
          ? {
              length: parseFloat(editLength),
              width: parseFloat(editWidth),
              height: parseFloat(editHeight),
            }
          : undefined;

      await updatePkg({
        packageId,
        label: editLabel.trim(),
        weight: editWeight ? parseFloat(editWeight) : undefined,
        dimensions,
      });
      toast.success("Package updated.");
      setEditingId(null);
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to update package.");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Shipping Packages
            </h1>
            <p className="text-sm text-muted-foreground">
              Define package presets for label generation and rate quotes.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Add Package
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border border-border bg-card p-4 space-y-3"
        >
          <h2 className="text-sm font-semibold text-foreground">
            New Package
          </h2>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. small_box"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Label
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Small Box"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Type
              </label>
              <select
                value={packageType}
                onChange={(e) => setPackageType(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {PACKAGE_TYPES.map((pt) => (
                  <option key={pt.value} value={pt.value}>
                    {pt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Carrier Code (optional)
              </label>
              <input
                type="text"
                value={carrierCode}
                onChange={(e) => setCarrierCode(e.target.value)}
                placeholder="e.g. usps_priority_box"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Weight (oz)
              </label>
              <input
                type="number"
                step="0.1"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="Package weight"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Length (in)
              </label>
              <input
                type="number"
                step="0.1"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                placeholder="Length"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Width (in)
              </label>
              <input
                type="number"
                step="0.1"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                placeholder="Width"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Height (in)
              </label>
              <input
                type="number"
                step="0.1"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                placeholder="Height"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Create Package
            </button>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Package list */}
      {packages === undefined ? (
        <p className="text-sm text-muted-foreground">
          Loading packages...
        </p>
      ) : packages.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <Box className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">
            No package presets defined yet. Add one above.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {packages.map((pkg: any) => {
            const isEditing = editingId === pkg._id;
            return (
              <div
                key={pkg._id}
                className="rounded-lg border border-border bg-card p-4 space-y-3"
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="rounded border border-border bg-background px-2 py-1 text-sm font-medium"
                      />
                    ) : (
                      <h3 className="text-sm font-semibold text-foreground">
                        {pkg.label}
                      </h3>
                    )}
                    <p className="text-xs text-muted-foreground font-mono">
                      {pkg.code}
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {PACKAGE_TYPES.find((pt) => pt.value === pkg.packageType)
                      ?.label ?? pkg.packageType}
                  </span>
                </div>

                {/* Details */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Ruler className="h-3.5 w-3.5" />
                    {isEditing ? (
                      <div className="flex gap-1">
                        <input
                          type="number"
                          step="0.1"
                          value={editLength}
                          onChange={(e) => setEditLength(e.target.value)}
                          placeholder="L"
                          className="w-12 rounded border border-border bg-background px-1 py-0.5 text-xs"
                        />
                        <input
                          type="number"
                          step="0.1"
                          value={editWidth}
                          onChange={(e) => setEditWidth(e.target.value)}
                          placeholder="W"
                          className="w-12 rounded border border-border bg-background px-1 py-0.5 text-xs"
                        />
                        <input
                          type="number"
                          step="0.1"
                          value={editHeight}
                          onChange={(e) => setEditHeight(e.target.value)}
                          placeholder="H"
                          className="w-12 rounded border border-border bg-background px-1 py-0.5 text-xs"
                        />
                      </div>
                    ) : (
                      formatDimensions(pkg.dimensions)
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Weight className="h-3.5 w-3.5" />
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.1"
                        value={editWeight}
                        onChange={(e) => setEditWeight(e.target.value)}
                        placeholder="oz"
                        className="w-16 rounded border border-border bg-background px-1 py-0.5 text-xs"
                      />
                    ) : (
                      formatWeight(pkg.weight)
                    )}
                  </div>
                </div>

                {pkg.carrierCode && (
                  <p className="text-xs text-muted-foreground">
                    Carrier:{" "}
                    <span className="font-mono">{pkg.carrierCode}</span>
                  </p>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-1 pt-1 border-t border-border">
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => saveEdit(pkg._id)}
                        className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50"
                        title="Save"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                        title="Cancel"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => startEdit(pkg)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(pkg._id)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
