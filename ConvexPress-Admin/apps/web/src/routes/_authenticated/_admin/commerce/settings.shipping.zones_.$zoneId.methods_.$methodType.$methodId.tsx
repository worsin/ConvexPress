import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

type MethodType =
  | "flat_rate"
  | "weight_based"
  | "dimensional"
  | "price_based"
  | "quantity_based"
  | "free"
  | "local_pickup"
  | "local_delivery"
  | "table_rate";

const VALID_TYPES: MethodType[] = [
  "flat_rate",
  "weight_based",
  "dimensional",
  "price_based",
  "quantity_based",
  "free",
  "local_pickup",
  "local_delivery",
  "table_rate",
];

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/settings/shipping/zones_/$zoneId/methods_/$methodType/$methodId",
)({
  component: MethodEditorPage,
});

function MethodEditorPage() {
  const { zoneId, methodType, methodId } = Route.useParams();
  const navigate = useNavigate();
  const isValidType = VALID_TYPES.includes(methodType as MethodType);

  const existing = useQuery(
    (api as any).shipping.methods.queries.getMethod,
    isValidType ? { methodType, methodId } : "skip",
  ) as any | null | undefined;

  const updateMethod = useMutation(
    (api as any).shipping.methods.mutations.updateMethod,
  );

  const [draft, setDraft] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing && !draft) setDraft(structuredClone(existing));
  }, [existing, draft]);

  if (!isValidType) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-destructive">
          Unknown method type: <code>{methodType}</code>
        </p>
      </div>
    );
  }

  async function handleSave() {
    if (!draft) return;
    const { _id, _creationTime, createdAt, updatedAt, ...patch } = draft;
    setSaving(true);
    try {
      await updateMethod({
        methodType: methodType as MethodType,
        methodId,
        patch,
      });
      toast.success("Method saved.");
      navigate({
        to: "/commerce/settings/shipping/zones_/$zoneId",
        params: { zoneId },
      });
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to save method.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <Link
        to="/commerce/settings/shipping/zones_/$zoneId"
        params={{ zoneId }}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to zone methods
      </Link>

      <header>
        <h1 className="text-xl font-semibold text-foreground">
          Edit {methodType.replace(/_/g, " ")} method
        </h1>
      </header>

      {existing === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : existing === null ? (
        <p className="text-sm text-destructive">Method not found.</p>
      ) : !draft ? (
        <p className="text-sm text-muted-foreground">Preparing editor…</p>
      ) : (
        <div className="space-y-6">
          <CommonFields draft={draft} setDraft={setDraft} />
          {methodType === "flat_rate" && (
            <>
              <FlatRateFields draft={draft} setDraft={setDraft} />
              <FlatRateClassOverrides draft={draft} setDraft={setDraft} />
            </>
          )}
          {methodType === "weight_based" && (
            <>
              <WeightTierFields draft={draft} setDraft={setDraft} />
              <WeightClassOverrides draft={draft} setDraft={setDraft} />
            </>
          )}
          {methodType === "dimensional" && (
            <DimensionalFields draft={draft} setDraft={setDraft} />
          )}
          {methodType === "price_based" && (
            <PriceTierFields draft={draft} setDraft={setDraft} />
          )}
          {methodType === "quantity_based" && (
            <QuantityTierFields draft={draft} setDraft={setDraft} />
          )}
          {methodType === "free" && (
            <>
              <FreeFields draft={draft} setDraft={setDraft} />
              <FreeClassExclusions draft={draft} setDraft={setDraft} />
            </>
          )}
          {methodType === "local_pickup" && (
            <LocalPickupFields draft={draft} setDraft={setDraft} />
          )}
          {methodType === "local_delivery" && (
            <LocalDeliveryFields draft={draft} setDraft={setDraft} />
          )}
          {methodType === "table_rate" && (
            <TableRateFields draft={draft} setDraft={setDraft} />
          )}

          <div className="flex justify-end gap-2">
            <Link
              to="/commerce/settings/shipping/zones_/$zoneId"
              params={{ zoneId }}
              className="rounded-md border border-border bg-background px-4 py-2 text-sm text-foreground hover:bg-muted"
            >
              Cancel
            </Link>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Method"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ Shared field helpers ═══════════════════════════════════════════════════

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

function CommonFields({
  draft,
  setDraft,
}: {
  draft: any;
  setDraft: (d: any) => void;
}) {
  return (
    <Section title="General">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Internal Name" hint="Used in admin only">
          <input
            className={inputCls}
            value={draft.name ?? ""}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </Field>
        <Field label="Customer-Facing Label" hint="Shown at checkout">
          <input
            className={inputCls}
            value={draft.label ?? ""}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
        </Field>
        <Field label="Sort Order">
          <input
            type="number"
            className={inputCls}
            value={draft.sortOrder ?? 100}
            onChange={(e) =>
              setDraft({ ...draft, sortOrder: Number(e.target.value) })
            }
          />
        </Field>
        <Field label="Status">
          <label className="inline-flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={!!draft.enabled}
              onChange={(e) =>
                setDraft({ ...draft, enabled: e.target.checked })
              }
            />
            Enabled
          </label>
        </Field>
      </div>
    </Section>
  );
}

// ═══ Flat Rate ═══════════════════════════════════════════════════════════════

function FlatRateFields({ draft, setDraft }: { draft: any; setDraft: (d: any) => void }) {
  return (
    <Section title="Flat Rate Configuration">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Field label="Base Cost">
          <input
            type="number"
            step="0.01"
            className={inputCls}
            value={draft.baseCost ?? 0}
            onChange={(e) =>
              setDraft({ ...draft, baseCost: Number(e.target.value) })
            }
          />
        </Field>
        <Field label="Cost Mode">
          <select
            className={inputCls}
            value={draft.costMode ?? "per_order"}
            onChange={(e) => setDraft({ ...draft, costMode: e.target.value })}
          >
            <option value="per_order">Per order</option>
            <option value="per_item">Per item</option>
            <option value="per_shipping_class">Per shipping class</option>
          </select>
        </Field>
        <Field label="Taxable">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!draft.taxable}
              onChange={(e) => setDraft({ ...draft, taxable: e.target.checked })}
            />
            Charge tax on shipping
          </label>
        </Field>
        <Field label="Minimum Cost" hint="Optional floor">
          <input
            type="number"
            step="0.01"
            className={inputCls}
            value={draft.minCost ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                minCost: e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
          />
        </Field>
        <Field label="Maximum Cost" hint="Optional ceiling">
          <input
            type="number"
            step="0.01"
            className={inputCls}
            value={draft.maxCost ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                maxCost: e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
          />
        </Field>
      </div>
    </Section>
  );
}

// ═══ Tier-based methods (weight / price / quantity / dimensional) ═══════════

function TierTable({
  tiers,
  columns,
  onChange,
}: {
  tiers: any[];
  columns: Array<{ key: string; label: string; step?: string }>;
  onChange: (next: any[]) => void;
}) {
  function addTier() {
    const empty: Record<string, number | undefined> = {};
    for (const c of columns) empty[c.key] = 0;
    onChange([...tiers, empty]);
  }
  function updateTier(idx: number, key: string, value: string) {
    const next = [...tiers];
    next[idx] = {
      ...next[idx],
      [key]: value === "" ? undefined : Number(value),
    };
    onChange(next);
  }
  function removeTier(idx: number) {
    onChange(tiers.filter((_, i) => i !== idx));
  }
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              {columns.map((c) => (
                <th key={c.key} className="px-2 py-1.5 font-medium">
                  {c.label}
                </th>
              ))}
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {tiers.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-2 py-3 text-center text-xs text-muted-foreground"
                >
                  No tiers defined yet.
                </td>
              </tr>
            )}
            {tiers.map((tier, idx) => (
              <tr key={idx} className="border-b border-border/50">
                {columns.map((c) => (
                  <td key={c.key} className="px-2 py-1.5">
                    <input
                      type="number"
                      step={c.step ?? "0.01"}
                      className={inputCls + " py-1"}
                      value={tier[c.key] ?? ""}
                      onChange={(e) => updateTier(idx, c.key, e.target.value)}
                    />
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => removeTier(idx)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                    title="Remove tier"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={addTier}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Tier
      </button>
    </div>
  );
}

function WeightTierFields({
  draft,
  setDraft,
}: {
  draft: any;
  setDraft: (d: any) => void;
}) {
  return (
    <Section title="Weight-Based Tiers">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Weight Unit">
          <select
            className={inputCls}
            value={draft.weightUnit ?? "oz"}
            onChange={(e) => setDraft({ ...draft, weightUnit: e.target.value })}
          >
            <option value="oz">Ounces (oz)</option>
            <option value="lb">Pounds (lb)</option>
            <option value="g">Grams (g)</option>
            <option value="kg">Kilograms (kg)</option>
          </select>
        </Field>
        <Field label="Include Tare Weight">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!draft.includeTareWeight}
              onChange={(e) =>
                setDraft({ ...draft, includeTareWeight: e.target.checked })
              }
            />
            Add package tare weight to cart weight
          </label>
        </Field>
      </div>
      <TierTable
        tiers={draft.tiers ?? []}
        columns={[
          { key: "minWeight", label: "Min Weight", step: "0.01" },
          { key: "maxWeight", label: "Max Weight (optional)", step: "0.01" },
          { key: "cost", label: "Cost", step: "0.01" },
          { key: "incrementalCost", label: "Incremental Cost (optional)", step: "0.01" },
          { key: "incrementalWeight", label: "Incremental Weight (optional)", step: "0.01" },
        ]}
        onChange={(tiers) => setDraft({ ...draft, tiers })}
      />
    </Section>
  );
}

function DimensionalFields({
  draft,
  setDraft,
}: {
  draft: any;
  setDraft: (d: any) => void;
}) {
  return (
    <Section title="Dimensional (DIM Weight) Tiers">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="DIM Divisor" hint="139 for US domestic, 166 international">
          <input
            type="number"
            className={inputCls}
            value={draft.divisor ?? 139}
            onChange={(e) => setDraft({ ...draft, divisor: Number(e.target.value) })}
          />
        </Field>
        <Field label="Weight Unit">
          <select
            className={inputCls}
            value={draft.weightUnit ?? "lb"}
            onChange={(e) => setDraft({ ...draft, weightUnit: e.target.value })}
          >
            <option value="oz">oz</option>
            <option value="lb">lb</option>
            <option value="g">g</option>
            <option value="kg">kg</option>
          </select>
        </Field>
      </div>
      <TierTable
        tiers={draft.tiers ?? []}
        columns={[
          { key: "minWeight", label: "Min Billable Weight", step: "0.01" },
          { key: "maxWeight", label: "Max Billable Weight (optional)", step: "0.01" },
          { key: "cost", label: "Cost", step: "0.01" },
          { key: "incrementalCost", label: "Inc. Cost (optional)", step: "0.01" },
          { key: "incrementalWeight", label: "Inc. Weight (optional)", step: "0.01" },
        ]}
        onChange={(tiers) => setDraft({ ...draft, tiers })}
      />
    </Section>
  );
}

function PriceTierFields({
  draft,
  setDraft,
}: {
  draft: any;
  setDraft: (d: any) => void;
}) {
  return (
    <Section title="Price-Based Tiers">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Currency Code">
          <input
            className={inputCls}
            value={draft.currencyCode ?? "USD"}
            onChange={(e) =>
              setDraft({ ...draft, currencyCode: e.target.value.toUpperCase() })
            }
          />
        </Field>
        <Field label="Use Discounted Subtotal">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!draft.useDiscountedSubtotal}
              onChange={(e) =>
                setDraft({ ...draft, useDiscountedSubtotal: e.target.checked })
              }
            />
            Apply tiers after cart discounts
          </label>
        </Field>
      </div>
      <TierTable
        tiers={draft.tiers ?? []}
        columns={[
          { key: "minSubtotal", label: "Min Subtotal", step: "0.01" },
          { key: "maxSubtotal", label: "Max Subtotal (optional)", step: "0.01" },
          { key: "cost", label: "Cost", step: "0.01" },
          { key: "incrementalCost", label: "Inc. Cost (optional)", step: "0.01" },
          { key: "incrementalSubtotal", label: "Inc. Subtotal (optional)", step: "0.01" },
        ]}
        onChange={(tiers) => setDraft({ ...draft, tiers })}
      />
    </Section>
  );
}

function QuantityTierFields({
  draft,
  setDraft,
}: {
  draft: any;
  setDraft: (d: any) => void;
}) {
  return (
    <Section title="Quantity-Based Tiers">
      <Field label="Count Mode">
        <select
          className={inputCls}
          value={draft.countMode ?? "total_items"}
          onChange={(e) => setDraft({ ...draft, countMode: e.target.value })}
        >
          <option value="total_items">Total items (sum of quantities)</option>
          <option value="total_line_items">Total line items (distinct rows)</option>
          <option value="per_shipping_class">Per shipping class</option>
        </select>
      </Field>
      <TierTable
        tiers={draft.tiers ?? []}
        columns={[
          { key: "minCount", label: "Min Count", step: "1" },
          { key: "maxCount", label: "Max Count (optional)", step: "1" },
          { key: "cost", label: "Cost", step: "0.01" },
          { key: "incrementalCost", label: "Inc. Cost (optional)", step: "0.01" },
          { key: "incrementalCount", label: "Inc. Count (optional)", step: "1" },
        ]}
        onChange={(tiers) => setDraft({ ...draft, tiers })}
      />
    </Section>
  );
}

// ═══ Free Shipping ═══════════════════════════════════════════════════════════

function FreeFields({ draft, setDraft }: { draft: any; setDraft: (d: any) => void }) {
  const needsAmount = ["min_amount", "min_amount_or_coupon", "min_amount_and_coupon"].includes(
    draft.conditionType,
  );
  const needsCoupon = ["coupon", "min_amount_or_coupon", "min_amount_and_coupon"].includes(
    draft.conditionType,
  );
  return (
    <Section title="Free Shipping Conditions">
      <Field label="Condition">
        <select
          className={inputCls}
          value={draft.conditionType ?? "always"}
          onChange={(e) => setDraft({ ...draft, conditionType: e.target.value })}
        >
          <option value="always">Always free</option>
          <option value="min_amount">Minimum order amount</option>
          <option value="coupon">Coupon code</option>
          <option value="min_amount_or_coupon">Min amount OR coupon</option>
          <option value="min_amount_and_coupon">Min amount AND coupon</option>
          <option value="rule">Shipping rule (advanced)</option>
        </select>
      </Field>
      {needsAmount && (
        <Field label="Minimum Order Amount">
          <input
            type="number"
            step="0.01"
            className={inputCls}
            value={draft.minAmount ?? 0}
            onChange={(e) => setDraft({ ...draft, minAmount: Number(e.target.value) })}
          />
        </Field>
      )}
      {needsCoupon && (
        <Field label="Coupon Code">
          <input
            className={inputCls}
            value={draft.couponCode ?? ""}
            onChange={(e) => setDraft({ ...draft, couponCode: e.target.value })}
          />
        </Field>
      )}
      <Field
        label="Required Customer Tags"
        hint="Comma-separated. Cart only qualifies when the customer has at least one listed tag."
      >
        <input
          className={inputCls}
          value={(draft.requireCustomerTags ?? []).join(", ")}
          onChange={(e) =>
            setDraft({
              ...draft,
              requireCustomerTags: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
      </Field>
    </Section>
  );
}

// ═══ Local Pickup ════════════════════════════════════════════════════════════

function LocalPickupFields({
  draft,
  setDraft,
}: {
  draft: any;
  setDraft: (d: any) => void;
}) {
  const locations = useQuery(
    (api as any).shipping.shipFromLocations.queries.list,
    {},
  ) as Array<{ _id: string; name: string }> | undefined;

  function toggleLocation(id: string) {
    const cur: string[] = draft.allowedPickupLocationIds ?? [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    setDraft({ ...draft, allowedPickupLocationIds: next });
  }

  return (
    <Section title="Local Pickup">
      <Field label="Handling Fee" hint="Optional fee added to the pickup">
        <input
          type="number"
          step="0.01"
          className={inputCls}
          value={draft.handlingFee ?? 0}
          onChange={(e) => setDraft({ ...draft, handlingFee: Number(e.target.value) })}
        />
      </Field>
      <Field label="Pickup Instructions">
        <textarea
          className={inputCls + " min-h-[80px]"}
          value={draft.pickupInstructions ?? ""}
          onChange={(e) => setDraft({ ...draft, pickupInstructions: e.target.value })}
        />
      </Field>
      <Field label="Require Customer to Pick a Location">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!draft.requirePickupLocationSelection}
            onChange={(e) =>
              setDraft({
                ...draft,
                requirePickupLocationSelection: e.target.checked,
              })
            }
          />
          Customer must choose a specific location at checkout
        </label>
      </Field>
      <Field label="Allowed Pickup Locations">
        {locations === undefined ? (
          <p className="text-xs text-muted-foreground">Loading locations…</p>
        ) : locations.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No ship-from locations yet. Create one in Locations settings first.
          </p>
        ) : (
          <div className="space-y-1">
            {locations.map((loc) => {
              const checked = (draft.allowedPickupLocationIds ?? []).includes(loc._id);
              return (
                <label
                  key={loc._id}
                  className="flex items-center gap-2 text-sm text-foreground"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleLocation(loc._id)}
                  />
                  {loc.name}
                </label>
              );
            })}
          </div>
        )}
      </Field>
    </Section>
  );
}

// ═══ Local Delivery ══════════════════════════════════════════════════════════

function LocalDeliveryFields({
  draft,
  setDraft,
}: {
  draft: any;
  setDraft: (d: any) => void;
}) {
  const locations = useQuery(
    (api as any).shipping.shipFromLocations.queries.list,
    {},
  ) as Array<{ _id: string; name: string }> | undefined;

  return (
    <Section title="Local Delivery">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Ship-From Location">
          <select
            className={inputCls}
            value={draft.shipFromLocationId ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, shipFromLocationId: e.target.value })
            }
          >
            <option value="">Select a location…</option>
            {(locations ?? []).map((loc) => (
              <option key={loc._id} value={loc._id}>
                {loc.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Restriction Mode">
          <select
            className={inputCls}
            value={draft.restrictionMode ?? "postcode_allowlist"}
            onChange={(e) => setDraft({ ...draft, restrictionMode: e.target.value })}
          >
            <option value="postcode_allowlist">Postcode allowlist</option>
            <option value="radius">Radius (km)</option>
          </select>
        </Field>
      </div>

      {draft.restrictionMode === "postcode_allowlist" ? (
        <Field label="Allowed Postcodes" hint="Comma-separated, supports * wildcards (e.g. 900*, 10001)">
          <textarea
            className={inputCls + " min-h-[60px]"}
            value={(draft.allowedPostcodes ?? []).join(", ")}
            onChange={(e) =>
              setDraft({
                ...draft,
                allowedPostcodes: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </Field>
      ) : (
        <Field label="Radius (km)">
          <input
            type="number"
            step="0.1"
            className={inputCls}
            value={draft.radiusKm ?? 10}
            onChange={(e) => setDraft({ ...draft, radiusKm: Number(e.target.value) })}
          />
        </Field>
      )}

      <Field label="Pricing Mode">
        <select
          className={inputCls}
          value={draft.pricingMode ?? "flat"}
          onChange={(e) => setDraft({ ...draft, pricingMode: e.target.value })}
        >
          <option value="flat">Flat cost</option>
          <option value="distance">Distance-based</option>
        </select>
      </Field>

      {draft.pricingMode === "flat" ? (
        <Field label="Flat Cost">
          <input
            type="number"
            step="0.01"
            className={inputCls}
            value={draft.flatCost ?? 0}
            onChange={(e) => setDraft({ ...draft, flatCost: Number(e.target.value) })}
          />
        </Field>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Field label="Base Cost">
            <input
              type="number"
              step="0.01"
              className={inputCls}
              value={draft.distancePricing?.baseCost ?? 0}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  distancePricing: {
                    ...(draft.distancePricing ?? { baseCost: 0, perKmCost: 0 }),
                    baseCost: Number(e.target.value),
                  },
                })
              }
            />
          </Field>
          <Field label="Per km">
            <input
              type="number"
              step="0.01"
              className={inputCls}
              value={draft.distancePricing?.perKmCost ?? 0}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  distancePricing: {
                    ...(draft.distancePricing ?? { baseCost: 0, perKmCost: 0 }),
                    perKmCost: Number(e.target.value),
                  },
                })
              }
            />
          </Field>
          <Field label="Min Cost">
            <input
              type="number"
              step="0.01"
              className={inputCls}
              value={draft.distancePricing?.minCost ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  distancePricing: {
                    ...(draft.distancePricing ?? { baseCost: 0, perKmCost: 0 }),
                    minCost: e.target.value === "" ? undefined : Number(e.target.value),
                  },
                })
              }
            />
          </Field>
          <Field label="Max Cost">
            <input
              type="number"
              step="0.01"
              className={inputCls}
              value={draft.distancePricing?.maxCost ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  distancePricing: {
                    ...(draft.distancePricing ?? { baseCost: 0, perKmCost: 0 }),
                    maxCost: e.target.value === "" ? undefined : Number(e.target.value),
                  },
                })
              }
            />
          </Field>
        </div>
      )}

      <Field label="Minimum Order Amount" hint="Optional cart floor to qualify">
        <input
          type="number"
          step="0.01"
          className={inputCls}
          value={draft.minOrderAmount ?? ""}
          onChange={(e) =>
            setDraft({
              ...draft,
              minOrderAmount:
                e.target.value === "" ? undefined : Number(e.target.value),
            })
          }
        />
      </Field>
    </Section>
  );
}

// ═══ Table Rate ══════════════════════════════════════════════════════════════

function TableRateFields({
  draft,
  setDraft,
}: {
  draft: any;
  setDraft: (d: any) => void;
}) {
  const rows: any[] = draft.rows ?? [];

  function updateRow(idx: number, patch: any) {
    const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    setDraft({ ...draft, rows: next });
  }
  function addRow() {
    setDraft({
      ...draft,
      rows: [
        ...rows,
        {
          priority: (rows[rows.length - 1]?.priority ?? 0) + 10,
          conditionAST: {},
          costFormula: { mode: "flat", baseCost: 0 },
          label: "",
          enabled: true,
        },
      ],
    });
  }
  function removeRow(idx: number) {
    setDraft({ ...draft, rows: rows.filter((_, i) => i !== idx) });
  }

  return (
    <Section title="Table Rate Rows">
      <Field label="Match Mode">
        <select
          className={inputCls}
          value={draft.matchMode ?? "first_match"}
          onChange={(e) => setDraft({ ...draft, matchMode: e.target.value })}
        >
          <option value="first_match">First match wins</option>
          <option value="all_matches_sum">Sum all matches</option>
          <option value="cheapest_match">Cheapest match wins</option>
        </select>
      </Field>

      <div className="space-y-2">
        {rows.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No rows yet. Add a row below to start building the table.
          </p>
        )}
        {rows.map((row, idx) => (
          <div
            key={idx}
            className="rounded-md border border-border bg-background p-3"
          >
            <div className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-4">
              <Field label="Priority">
                <input
                  type="number"
                  className={inputCls}
                  value={row.priority ?? 0}
                  onChange={(e) =>
                    updateRow(idx, { priority: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="Label">
                <input
                  className={inputCls}
                  value={row.label ?? ""}
                  onChange={(e) => updateRow(idx, { label: e.target.value })}
                />
              </Field>
              <Field label="Formula Mode">
                <select
                  className={inputCls}
                  value={row.costFormula?.mode ?? "flat"}
                  onChange={(e) =>
                    updateRow(idx, {
                      costFormula: { ...row.costFormula, mode: e.target.value },
                    })
                  }
                >
                  <option value="flat">Flat</option>
                  <option value="per_weight">Per weight</option>
                  <option value="per_item">Per item</option>
                  <option value="per_subtotal">Per subtotal</option>
                </select>
              </Field>
              <Field label="Enabled">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!row.enabled}
                    onChange={(e) => updateRow(idx, { enabled: e.target.checked })}
                  />
                  Active
                </label>
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <Field label="Base Cost">
                <input
                  type="number"
                  step="0.01"
                  className={inputCls}
                  value={row.costFormula?.baseCost ?? 0}
                  onChange={(e) =>
                    updateRow(idx, {
                      costFormula: {
                        ...row.costFormula,
                        baseCost: Number(e.target.value),
                      },
                    })
                  }
                />
              </Field>
              <Field label="Per-Unit Cost">
                <input
                  type="number"
                  step="0.01"
                  className={inputCls}
                  value={row.costFormula?.perUnitCost ?? ""}
                  onChange={(e) =>
                    updateRow(idx, {
                      costFormula: {
                        ...row.costFormula,
                        perUnitCost:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      },
                    })
                  }
                />
              </Field>
              <Field label="Unit Cap">
                <input
                  type="number"
                  step="0.01"
                  className={inputCls}
                  value={row.costFormula?.unitCap ?? ""}
                  onChange={(e) =>
                    updateRow(idx, {
                      costFormula: {
                        ...row.costFormula,
                        unitCap:
                          e.target.value === "" ? undefined : Number(e.target.value),
                      },
                    })
                  }
                />
              </Field>
            </div>
            <Field
              label="Condition AST (JSON)"
              hint="Advanced. Uses the shipping rules engine AST. Leave as {} to always match."
            >
              <textarea
                className={inputCls + " font-mono text-xs min-h-[80px]"}
                value={JSON.stringify(row.conditionAST ?? {}, null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value || "{}");
                    updateRow(idx, { conditionAST: parsed });
                  } catch {
                    // Ignore parse errors while typing; last valid JSON wins on save.
                  }
                }}
              />
            </Field>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => removeRow(idx)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                title="Remove row"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addRow}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Row
      </button>
    </Section>
  );
}

// ═══ Class Overrides (shared helpers) ═══════════════════════════════════════

function useShippingClasses() {
  return useQuery(
    (api as any).shipping.classes.queries.list,
    {},
  ) as Array<{ _id: string; name: string; slug: string }> | undefined;
}

function FlatRateClassOverrides({
  draft,
  setDraft,
}: {
  draft: any;
  setDraft: (d: any) => void;
}) {
  const classes = useShippingClasses();
  const overrides: Array<{ classId: string; cost: number }> =
    draft.classOverrides ?? [];

  const unused = (classes ?? []).filter(
    (c) => !overrides.some((o) => o.classId === c._id),
  );

  function addOverride(classId: string) {
    setDraft({
      ...draft,
      classOverrides: [...overrides, { classId, cost: 0 }],
    });
  }
  function updateCost(idx: number, cost: number) {
    setDraft({
      ...draft,
      classOverrides: overrides.map((o, i) => (i === idx ? { ...o, cost } : o)),
    });
  }
  function removeOverride(idx: number) {
    setDraft({
      ...draft,
      classOverrides: overrides.filter((_, i) => i !== idx),
    });
  }

  return (
    <Section title="Per-Class Cost Overrides">
      <p className="text-xs text-muted-foreground">
        When the cart contains products assigned to a shipping class below, the
        override cost replaces the base cost for that slice.
      </p>
      {overrides.length === 0 ? (
        <p className="text-xs text-muted-foreground">No overrides set.</p>
      ) : (
        <div className="space-y-2">
          {overrides.map((o, idx) => {
            const cls = classes?.find((c) => c._id === o.classId);
            return (
              <div
                key={idx}
                className="flex items-center gap-2 rounded-md border border-border bg-background p-2"
              >
                <span className="flex-1 text-sm text-foreground">
                  {cls?.name ?? "(deleted class)"}
                </span>
                <input
                  type="number"
                  step="0.01"
                  className={inputCls + " max-w-[140px]"}
                  value={o.cost}
                  onChange={(e) => updateCost(idx, Number(e.target.value))}
                />
                <button
                  type="button"
                  onClick={() => removeOverride(idx)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {classes && unused.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            className={inputCls + " max-w-xs"}
            value=""
            onChange={(e) => {
              if (e.target.value) addOverride(e.target.value);
            }}
          >
            <option value="">Add override for class…</option>
            {unused.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </Section>
  );
}

function WeightClassOverrides({
  draft,
  setDraft,
}: {
  draft: any;
  setDraft: (d: any) => void;
}) {
  const classes = useShippingClasses();
  const overrides: Array<{ classId: string; tiers: any[] }> =
    draft.classOverrides ?? [];

  const unused = (classes ?? []).filter(
    (c) => !overrides.some((o) => o.classId === c._id),
  );

  function addOverride(classId: string) {
    setDraft({
      ...draft,
      classOverrides: [
        ...overrides,
        { classId, tiers: [{ minWeight: 0, cost: 0 }] },
      ],
    });
  }
  function updateTiers(idx: number, tiers: any[]) {
    setDraft({
      ...draft,
      classOverrides: overrides.map((o, i) => (i === idx ? { ...o, tiers } : o)),
    });
  }
  function removeOverride(idx: number) {
    setDraft({
      ...draft,
      classOverrides: overrides.filter((_, i) => i !== idx),
    });
  }

  return (
    <Section title="Per-Class Tier Overrides">
      <p className="text-xs text-muted-foreground">
        Define a separate weight-tier table for each shipping class. Classes not
        listed here fall back to the default tiers above.
      </p>
      {overrides.map((o, idx) => {
        const cls = classes?.find((c) => c._id === o.classId);
        return (
          <div
            key={idx}
            className="rounded-md border border-border bg-background p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                {cls?.name ?? "(deleted class)"}
              </span>
              <button
                type="button"
                onClick={() => removeOverride(idx)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <TierTable
              tiers={o.tiers ?? []}
              columns={[
                { key: "minWeight", label: "Min Weight", step: "0.01" },
                { key: "maxWeight", label: "Max Weight (optional)", step: "0.01" },
                { key: "cost", label: "Cost", step: "0.01" },
                { key: "incrementalCost", label: "Inc. Cost", step: "0.01" },
                { key: "incrementalWeight", label: "Inc. Weight", step: "0.01" },
              ]}
              onChange={(tiers) => updateTiers(idx, tiers)}
            />
          </div>
        );
      })}
      {classes && unused.length > 0 && (
        <select
          className={inputCls + " max-w-xs"}
          value=""
          onChange={(e) => {
            if (e.target.value) addOverride(e.target.value);
          }}
        >
          <option value="">Add override for class…</option>
          {unused.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      {overrides.length === 0 && (!classes || unused.length === 0) && (
        <p className="text-xs text-muted-foreground">
          {classes && classes.length === 0
            ? "No shipping classes defined yet."
            : "All classes already have an override."}
        </p>
      )}
    </Section>
  );
}

function FreeClassExclusions({
  draft,
  setDraft,
}: {
  draft: any;
  setDraft: (d: any) => void;
}) {
  const classes = useShippingClasses();
  const excluded: string[] = draft.excludeShippingClassIds ?? [];

  function toggle(id: string) {
    setDraft({
      ...draft,
      excludeShippingClassIds: excluded.includes(id)
        ? excluded.filter((x) => x !== id)
        : [...excluded, id],
    });
  }

  return (
    <Section title="Excluded Shipping Classes">
      <p className="text-xs text-muted-foreground">
        Carts containing any product in the checked classes will not qualify for
        free shipping.
      </p>
      {classes === undefined ? (
        <p className="text-xs text-muted-foreground">Loading classes…</p>
      ) : classes.length === 0 ? (
        <p className="text-xs text-muted-foreground">No shipping classes defined.</p>
      ) : (
        <div className="space-y-1">
          {classes.map((c) => (
            <label
              key={c._id}
              className="flex items-center gap-2 text-sm text-foreground"
            >
              <input
                type="checkbox"
                checked={excluded.includes(c._id)}
                onChange={() => toggle(c._id)}
              />
              {c.name}
            </label>
          ))}
        </div>
      )}
    </Section>
  );
}
