import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  Package,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Pencil,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { api } from "@backend/convex/_generated/api";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type BundleStatus = "draft" | "active" | "archived";
type BundleType = "fixed" | "mix_and_match" | "bogo";
type PricingType = "fixed" | "percent_off" | "amount_off" | "component_sum";

interface BundleComponentData {
  _id: string;
  productId: string;
  quantity: number;
  isRequired: boolean;
  label?: string;
  sortOrder: number;
  priceOverride?: number;
  discountPercent?: number;
  variantId?: string;
  allowVariantChange?: boolean;
  product?: {
    _id: string;
    title: string;
    status?: string;
    basePrice?: number | { amount: number };
    productType?: string;
  };
  variant?: {
    _id: string;
    name?: string;
  } | null;
}

interface BundleData {
  _id: string;
  name: string;
  slug: string;
  status: BundleStatus;
  bundleType: BundleType;
  pricingType: PricingType;
  regularPrice?: number;
  bundlePrice?: number;
  fixedPrice?: number;
  discountPercent?: number;
  discountAmount?: number;
  componentCount: number;
  trackInventory?: boolean;
  stockCount?: number;
  images?: string[];
  createdAt: number;
}

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/bundles",
)({
  component: CommerceBundlesPage,
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function centsToDisplay(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount / 100);
}

function displayToCents(value: string) {
  return Math.round(Number.parseFloat(value || "0") * 100);
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const statusTone: Record<string, string> = {
  draft: "bg-amber-100 text-amber-900",
  active: "bg-emerald-100 text-emerald-800",
  archived: "bg-rose-100 text-rose-800",
};

const pricingLabel: Record<string, string> = {
  fixed: "Fixed Price",
  percent_off: "% Discount",
  amount_off: "$ Discount",
  component_sum: "Sum of Components",
};

const bundleTypeLabel: Record<string, string> = {
  fixed: "Fixed",
  mix_and_match: "Mix & Match",
  bogo: "BOGO",
};

/* ------------------------------------------------------------------ */
/*  Create Bundle Form                                                 */
/* ------------------------------------------------------------------ */

function CreateBundleForm({ onCreated }: { onCreated?: () => void }) {
  const createBundle = useMutation(
    (api as any).commerceBundles.mutations.create,
  );

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [bundleType, setBundleType] = useState<BundleType>("fixed");
  const [pricingType, setPricingType] = useState<PricingType>("component_sum");
  const [fixedPrice, setFixedPrice] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [description, setDescription] = useState("");
  const [trackInventory, setTrackInventory] = useState(false);
  const [stockCount, setStockCount] = useState("");
  const [imagesText, setImagesText] = useState("");
  const [creating, setCreating] = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    setSlug(slugify(value));
  }

  const parsedImages = imagesText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  async function handleCreate() {
    if (!name.trim() || !slug.trim()) {
      toast.error("Name and slug are required");
      return;
    }

    setCreating(true);
    try {
      await createBundle({
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim() || undefined,
        bundleType,
        pricingType,
        fixedPrice:
          pricingType === "fixed" && fixedPrice
            ? displayToCents(fixedPrice)
            : undefined,
        discountPercent:
          pricingType === "percent_off" && discountPercent
            ? Number(discountPercent)
            : undefined,
        discountAmount:
          pricingType === "amount_off" && discountAmount
            ? displayToCents(discountAmount)
            : undefined,
        trackInventory: trackInventory || undefined,
        stockCount: trackInventory && stockCount ? Number(stockCount) : undefined,
        images: parsedImages.length > 0 ? parsedImages : undefined,
      });

      setName("");
      setSlug("");
      setDescription("");
      setFixedPrice("");
      setDiscountPercent("");
      setDiscountAmount("");
      setBundleType("fixed");
      setPricingType("component_sum");
      setTrackInventory(false);
      setStockCount("");
      setImagesText("");
      toast.success("Bundle created");
      onCreated?.();
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to create bundle",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold">New Bundle</h2>
      <div className="mt-4 grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Summer Essentials Pack"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Slug
            </label>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="summer-essentials-pack"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional bundle description..."
            rows={2}
            className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Bundle Type
            </label>
            <select
              value={bundleType}
              onChange={(e) => setBundleType(e.target.value as BundleType)}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
            >
              <option value="fixed">Fixed (pre-set components)</option>
              <option value="mix_and_match">Mix &amp; Match</option>
              <option value="bogo">BOGO</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Pricing Strategy
            </label>
            <select
              value={pricingType}
              onChange={(e) => setPricingType(e.target.value as PricingType)}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
            >
              <option value="component_sum">Sum of Components</option>
              <option value="fixed">Fixed Price</option>
              <option value="percent_off">Percentage Discount</option>
              <option value="amount_off">Amount Discount</option>
            </select>
          </div>
        </div>

        {pricingType === "fixed" && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Fixed Price ($)
            </label>
            <input
              value={fixedPrice}
              onChange={(e) => setFixedPrice(e.target.value)}
              placeholder="29.99"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
            />
          </div>
        )}

        {pricingType === "percent_off" && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Discount Percent (%)
            </label>
            <input
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
              placeholder="15"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
            />
          </div>
        )}

        {pricingType === "amount_off" && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Discount Amount ($)
            </label>
            <input
              value={discountAmount}
              onChange={(e) => setDiscountAmount(e.target.value)}
              placeholder="5.00"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
            />
          </div>
        )}

        {/* Inventory tracking */}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={trackInventory}
              onChange={(e) => setTrackInventory(e.target.checked)}
              className="rounded"
            />
            Track inventory
          </label>
          {trackInventory && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Stock Count
              </label>
              <input
                value={stockCount}
                onChange={(e) => setStockCount(e.target.value)}
                placeholder="100"
                type="number"
                min="0"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
              />
            </div>
          )}
        </div>

        {/* Images */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Images (one URL per line)
          </label>
          <textarea
            value={imagesText}
            onChange={(e) => setImagesText(e.target.value)}
            placeholder="https://example.com/image1.jpg&#10;https://example.com/image2.jpg"
            rows={2}
            className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm"
          />
          {parsedImages.length > 0 && (
            <div className="mt-2 flex gap-2">
              {parsedImages.filter(Boolean).slice(0, 4).map((url, i) => (
                <img key={i} src={url} alt="" className="h-16 w-16 rounded border border-border object-cover" />
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={creating || !name.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Create Bundle
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Add Component Form                                                 */
/* ------------------------------------------------------------------ */

function AddComponentForm({ bundleId }: { bundleId: string }) {
  const products = useQuery(
    (api as any).commerce.products.list,
    {},
  ) as Array<{ _id: string; title: string }> | undefined;

  const addComponent = useMutation(
    (api as any).commerceBundles.mutations.addComponent,
  );

  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [isRequired, setIsRequired] = useState(true);
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    if (!productId) {
      toast.error("Select a product");
      return;
    }

    setAdding(true);
    try {
      await addComponent({
        bundleId,
        productId,
        quantity: Number(quantity) || 1,
        isRequired,
        label: label.trim() || undefined,
      });
      setProductId("");
      setQuantity("1");
      setIsRequired(true);
      setLabel("");
      toast.success("Component added");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to add component",
      );
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/30 p-4">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Add Component
      </h4>
      <div className="grid gap-3 sm:grid-cols-[1fr_80px_100px_1fr_auto]">
        <select
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">Select product...</option>
          {products?.map((p) => (
            <option key={p._id} value={p._id}>
              {p.title}
            </option>
          ))}
        </select>
        <input
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="Qty"
          type="number"
          min="1"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={isRequired}
            onChange={(e) => setIsRequired(e.target.checked)}
            className="rounded"
          />
          Required
        </label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (optional)"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={adding || !productId}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component List                                                     */
/* ------------------------------------------------------------------ */

function ComponentList({ bundleId }: { bundleId: string }) {
  const components = useQuery(
    (api as any).commerceBundles.queries.getComponents,
    { bundleId },
  ) as BundleComponentData[] | undefined;

  const removeComponent = useMutation(
    (api as any).commerceBundles.mutations.removeComponent,
  );
  const reorderComponents = useMutation(
    (api as any).commerceBundles.mutations.reorderComponents,
  );

  async function handleRemove(componentId: string) {
    try {
      await removeComponent({ componentId });
      toast.success("Component removed");
    } catch (error) {
      toast.error("Failed to remove component");
    }
  }

  async function handleMoveUp(index: number) {
    if (!components || index <= 0) return;
    const ids = components.map((c) => c._id);
    [ids[index - 1]!, ids[index]!] = [ids[index]!, ids[index - 1]!];
    try {
      await reorderComponents({ bundleId, componentIds: ids });
    } catch {
      toast.error("Failed to reorder");
    }
  }

  async function handleMoveDown(index: number) {
    if (!components || index >= components.length - 1) return;
    const ids = components.map((c) => c._id);
    [ids[index]!, ids[index + 1]!] = [ids[index + 1]!, ids[index]!];
    try {
      await reorderComponents({ bundleId, componentIds: ids });
    } catch {
      toast.error("Failed to reorder");
    }
  }

  if (components === undefined) {
    return (
      <div className="mt-3 space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (components.length === 0) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        No components added yet.
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {components.map((comp, index) => {
        const productPrice = comp.product?.basePrice;
        const price =
          typeof productPrice === "object"
            ? productPrice?.amount
            : productPrice;

        return (
          <div
            key={comp._id}
            className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3"
          >
            <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/50" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-foreground">
                  {comp.product?.title ?? "Unknown Product"}
                </span>
                {comp.label && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    {comp.label}
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>Qty: {comp.quantity}</span>
                <span>{comp.isRequired ? "Required" : "Optional"}</span>
                {typeof price === "number" && (
                  <span>Unit: {centsToDisplay(price)}</span>
                )}
                {comp.priceOverride != null && (
                  <span>Override: {centsToDisplay(comp.priceOverride)}</span>
                )}
                {comp.discountPercent != null && (
                  <span>-{comp.discountPercent}%</span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => void handleMoveUp(index)}
                disabled={index === 0}
                className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                title="Move up"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void handleMoveDown(index)}
                disabled={index === components.length - 1}
                className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                title="Move down"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void handleRemove(comp._id)}
                className="rounded p-1 text-rose-500 hover:bg-rose-50"
                title="Remove component"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Bundle Row (expandable)                                            */
/* ------------------------------------------------------------------ */

function BundleRow({ bundle }: { bundle: BundleData }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(bundle.name);
  const [editStatus, setEditStatus] = useState<BundleStatus>(bundle.status);
  const [editPricingType, setEditPricingType] = useState<PricingType>(bundle.pricingType);
  const [editFixedPrice, setEditFixedPrice] = useState(
    bundle.fixedPrice ? (bundle.fixedPrice / 100).toFixed(2) : "",
  );
  const [editDiscountPercent, setEditDiscountPercent] = useState(
    bundle.discountPercent?.toString() ?? "",
  );
  const [editDiscountAmount, setEditDiscountAmount] = useState(
    bundle.discountAmount ? (bundle.discountAmount / 100).toFixed(2) : "",
  );
  const [editTrackInventory, setEditTrackInventory] = useState(bundle.trackInventory ?? false);
  const [editStockCount, setEditStockCount] = useState(
    bundle.stockCount?.toString() ?? "",
  );
  const [editImagesText, setEditImagesText] = useState(
    (bundle.images ?? []).join("\n"),
  );

  const [publishErrors, setPublishErrors] = useState<string[]>([]);

  const editParsedImages = editImagesText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  // Fetch components when editing so we can validate before publish
  const bundleComponents = useQuery(
    (api as any).commerceBundles.queries.getComponents,
    editing ? { bundleId: bundle._id } : "skip",
  ) as BundleComponentData[] | undefined;

  const updateBundle = useMutation(
    (api as any).commerceBundles.mutations.update,
  );
  const removeBundle = useMutation(
    (api as any).commerceBundles.mutations.remove,
  );

  /**
   * Validate that a bundle is ready to publish. Returns an array of
   * human-readable error strings (empty = valid).
   */
  function validateForPublish(): string[] {
    const errors: string[] = [];

    if (!bundleComponents) {
      errors.push("Component data is still loading. Please wait.");
      return errors;
    }

    if (bundleComponents.length === 0) {
      errors.push("Bundle must have at least 1 component product.");
    }

    for (const comp of bundleComponents) {
      if (!comp.product) {
        errors.push(
          `Component "${comp.label || comp._id}" references a missing product.`,
        );
        continue;
      }
      if (comp.product.status && comp.product.status !== "publish" && comp.product.status !== "active") {
        errors.push(
          `Component product "${comp.product.title}" is not published (status: ${comp.product.status}).`,
        );
      }
      // Variable products should have a variant selected
      if (
        comp.product.productType === "variable" &&
        !comp.variantId &&
        !comp.allowVariantChange
      ) {
        errors.push(
          `Component "${comp.product.title}" is a variable product but has no variant selected.`,
        );
      }
    }

    return errors;
  }

  async function handleSave() {
    // Run pre-publish validation when transitioning to active
    if (editStatus === "active" && bundle.status !== "active") {
      const errors = validateForPublish();
      if (errors.length > 0) {
        setPublishErrors(errors);
        return;
      }
    }
    setPublishErrors([]);

    try {
      await updateBundle({
        id: bundle._id,
        name: editName.trim() || undefined,
        status: editStatus,
        pricingType: editPricingType,
        fixedPrice:
          editPricingType === "fixed" && editFixedPrice
            ? displayToCents(editFixedPrice)
            : undefined,
        discountPercent:
          editPricingType === "percent_off" && editDiscountPercent
            ? Number(editDiscountPercent)
            : undefined,
        discountAmount:
          editPricingType === "amount_off" && editDiscountAmount
            ? displayToCents(editDiscountAmount)
            : undefined,
        trackInventory: editTrackInventory,
        stockCount: editTrackInventory && editStockCount ? Number(editStockCount) : undefined,
        images: editParsedImages.length > 0 ? editParsedImages : undefined,
      });
      setEditing(false);
      toast.success("Bundle updated");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to update bundle",
      );
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete bundle "${bundle.name}"? This cannot be undone.`)) {
      return;
    }
    try {
      await removeBundle({ id: bundle._id });
      toast.success("Bundle deleted");
    } catch (error) {
      toast.error("Failed to delete bundle");
    }
  }

  const displayPrice =
    typeof bundle.bundlePrice === "number"
      ? centsToDisplay(bundle.bundlePrice)
      : typeof bundle.regularPrice === "number"
        ? centsToDisplay(bundle.regularPrice)
        : "\u2014";

  return (
    <div className="border-b border-border last:border-b-0">
      {/* Summary row */}
      <div className="grid grid-cols-[minmax(0,2fr)_100px_140px_100px_100px_120px] items-center gap-4 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {bundle.name}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              /{bundle.slug}
            </p>
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          {bundle.componentCount ?? 0} items
        </div>

        <div className="text-xs text-muted-foreground">
          {pricingLabel[bundle.pricingType] ?? bundle.pricingType}
        </div>

        <div>
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusTone[bundle.status] ?? "bg-muted text-foreground"}`}
          >
            {bundle.status}
          </span>
        </div>

        <div className="text-sm font-medium text-foreground">{displayPrice}</div>

        <div className="flex items-center justify-end gap-2">
          {bundle.status === "active" && (
            <a
              href={`/bundles/${bundle.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded p-1.5 text-muted-foreground hover:bg-muted"
              title="View on storefront"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={() => {
              setExpanded(true);
              setEditing(!editing);
            }}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            className="rounded p-1.5 text-rose-500 hover:bg-rose-50"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-dashed border-border bg-muted/20 px-5 py-5">
          {editing && (
            <div className="mb-5 rounded-xl border border-border bg-card p-4">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Edit Bundle
              </h4>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Name
                  </label>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Status
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => {
                      setEditStatus(e.target.value as BundleStatus);
                      setPublishErrors([]);
                    }}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Pricing
                  </label>
                  <select
                    value={editPricingType}
                    onChange={(e) => setEditPricingType(e.target.value as PricingType)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="component_sum">Sum of Components</option>
                    <option value="fixed">Fixed Price</option>
                    <option value="percent_off">% Discount</option>
                    <option value="amount_off">$ Discount</option>
                  </select>
                </div>
                {editPricingType === "fixed" && (
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      Fixed Price ($)
                    </label>
                    <input
                      value={editFixedPrice}
                      onChange={(e) => setEditFixedPrice(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                  </div>
                )}
                {editPricingType === "percent_off" && (
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      Discount %
                    </label>
                    <input
                      value={editDiscountPercent}
                      onChange={(e) => setEditDiscountPercent(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                  </div>
                )}
                {editPricingType === "amount_off" && (
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      Discount ($)
                    </label>
                    <input
                      value={editDiscountAmount}
                      onChange={(e) => setEditDiscountAmount(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>
              {/* Inventory management */}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={editTrackInventory}
                    onChange={(e) => setEditTrackInventory(e.target.checked)}
                    className="rounded"
                  />
                  Track inventory
                </label>
                {editTrackInventory && (
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      Stock Count
                    </label>
                    <input
                      value={editStockCount}
                      onChange={(e) => setEditStockCount(e.target.value)}
                      type="number"
                      min="0"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>
              {/* Images */}
              <div className="mt-3">
                <label className="mb-1 block text-xs text-muted-foreground">
                  Images (one URL per line)
                </label>
                <textarea
                  value={editImagesText}
                  onChange={(e) => setEditImagesText(e.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
                {editParsedImages.length > 0 && (
                  <div className="mt-2 flex gap-2">
                    {editParsedImages.filter(Boolean).slice(0, 4).map((url, i) => (
                      <img key={i} src={url} alt="" className="h-16 w-16 rounded border border-border object-cover" />
                    ))}
                  </div>
                )}
              </div>
              {/* Pre-publish validation errors */}
              {publishErrors.length > 0 && (
                <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
                    <AlertTriangle className="h-4 w-4" />
                    Cannot publish bundle
                  </div>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-amber-800">
                    {publishErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/60"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Components
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {bundleTypeLabel[bundle.bundleType] ?? bundle.bundleType} bundle
              {bundle.regularPrice != null &&
                bundle.bundlePrice != null &&
                bundle.regularPrice !== bundle.bundlePrice && (
                  <span className="ml-2">
                    Regular: {centsToDisplay(bundle.regularPrice)} | Bundle:{" "}
                    {centsToDisplay(bundle.bundlePrice)} (save{" "}
                    {centsToDisplay(bundle.regularPrice - bundle.bundlePrice)})
                  </span>
                )}
            </p>
            <ComponentList bundleId={bundle._id} />
            <AddComponentForm bundleId={bundle._id} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

function CommerceBundlesPage() {
  const bundles = useQuery(
    (api as any).commerceBundles.queries.list,
    {},
  ) as BundleData[] | undefined;

  const stats = useQuery(
    (api as any).commerceBundles.queries.getStats,
    {},
  ) as { total: number; active: number; draft: number; archived: number; unlinked: number; draftsBlocked: number } | undefined;

  const lowStockBundles = useQuery(
    (api as any).commerceBundles.queries.getLowStock,
    {},
  ) as Array<{ _id: string; name: string; slug: string; stockCount: number }> | undefined;

  const backfill = useMutation(
    (api as any).commerceBundles.mutations.backfillOwningProducts,
  );

  const [backfilling, setBackfilling] = useState(false);

  async function handleBackfill() {
    setBackfilling(true);
    try {
      await backfill({});
      toast.success("Backfill complete");
    } catch (error) {
      toast.error("Backfill failed");
    } finally {
      setBackfilling(false);
    }
  }

  const activeCount =
    bundles?.filter((b) => b.status === "active").length ?? 0;

  return (
    <div className="space-y-8">
      {/* Backfill banner */}
      {stats && stats.unlinked > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-medium text-amber-800">
            {stats.unlinked} bundle{stats.unlinked === 1 ? "" : "s"} need product linking
          </p>
          <p className="mt-1 text-amber-700">
            These bundles were created before the product linkage system. Run backfill to create associated product entries.
          </p>
          <button
            type="button"
            onClick={() => void handleBackfill()}
            disabled={backfilling}
            className="mt-2 text-amber-700 underline disabled:opacity-50"
          >
            {backfilling ? "Running..." : "Run backfill now"}
          </button>
        </div>
      )}

      {/* Low stock alerts */}
      {lowStockBundles && lowStockBundles.length > 0 && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm">
          <p className="font-medium text-rose-800">
            {lowStockBundles.length} bundle{lowStockBundles.length === 1 ? "" : "s"} with low stock
          </p>
          <ul className="mt-2 space-y-1">
            {lowStockBundles.slice(0, 5).map((b) => (
              <li key={b._id} className="text-rose-700">
                {b.name} — {b.stockCount} remaining
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Product Bundles
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Create and manage product bundles with flexible pricing strategies.
            {bundles && (
              <span className="ml-1">
                {bundles.length} bundle{bundles.length === 1 ? "" : "s"},{" "}
                {activeCount} active.
              </span>
            )}
          </p>
        </div>
        <Link
          to="/commerce/products"
          className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/60"
        >
          Products
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <CreateBundleForm />

        <section className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-lg font-semibold">All Bundles</h2>
          </div>

          <div className="grid grid-cols-[minmax(0,2fr)_100px_140px_100px_100px_120px] gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <div>Bundle</div>
            <div>Products</div>
            <div>Pricing</div>
            <div>Status</div>
            <div>Price</div>
            <div className="text-right">Actions</div>
          </div>

          {bundles === undefined ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-xl bg-muted"
                />
              ))}
            </div>
          ) : bundles.length === 0 ? (
            <div className="p-10 text-center">
              <Package className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                No bundles created yet. Use the form to create your first
                bundle.
              </p>
            </div>
          ) : (
            <div>
              {bundles.map((bundle) => (
                <BundleRow key={bundle._id} bundle={bundle} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
