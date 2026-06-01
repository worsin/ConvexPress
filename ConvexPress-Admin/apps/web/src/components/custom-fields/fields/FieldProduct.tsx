/**
 * FieldProduct — a priced line item (`product` field).
 *
 * Form Calculation & Pricing System. The user edits ONLY the quantity (when the
 * field is configured with a user-driven quantity); the unit price + line total
 * are DERIVED (recomputed live for UX, authoritatively on the server at submit).
 * The computed `lineTotal` is never user-editable.
 *
 * Stored value is a JSON line object. For the client we emit a compact
 * `{ "quantity": N }` on edit — the server re-derives unitPrice/lineTotal from
 * the field's settings + formulas, so the client can never tamper with the price.
 */

import { useMemo } from "react";
import type { FieldRendererProps } from "./index";
import { FieldWrapper } from "./FieldWrapper";
import { formatNumber, type NumberFormat } from "@/components/forms/calc";

interface ProductSettings {
  priceMode?: "fixed" | "userDefined" | "calculated";
  unitPrice?: number;
  quantityFieldKey?: string;
  priceKind?: "oneTime" | "recurring";
  interval?: "month" | "year";
  recurringLabel?: string;
  numberFormat?: NumberFormat;
}

interface ProductLineValue {
  unitPrice?: number;
  quantity?: number;
  lineTotal?: number;
  priceKind?: string;
  interval?: string;
}

export function FieldProduct({
  field,
  value,
  onChange,
  labelPlacement,
  instructionPlacement,
}: FieldRendererProps) {
  const settings = useMemo<ProductSettings>(() => {
    try {
      return JSON.parse(field.settings) as ProductSettings;
    } catch {
      return {};
    }
  }, [field.settings]);

  // The renderer feeds the recomputed line object back as a JSON string.
  const line = useMemo<ProductLineValue>(() => {
    try {
      const parsed = JSON.parse(value || "{}");
      return parsed && typeof parsed === "object" ? (parsed as ProductLineValue) : {};
    } catch {
      // A bare number value means just a quantity was set.
      const q = Number(value);
      return Number.isFinite(q) ? { quantity: q } : {};
    }
  }, [value]);

  const quantity = typeof line.quantity === "number" ? line.quantity : 1;
  const unitPrice = typeof line.unitPrice === "number" ? line.unitPrice : settings.unitPrice ?? 0;
  const lineTotal = typeof line.lineTotal === "number" ? line.lineTotal : unitPrice * quantity;
  const userEditableQty = !settings.quantityFieldKey; // qty editable only if not field-driven

  function setQuantity(next: number) {
    const safe = Number.isFinite(next) && next >= 0 ? next : 0;
    onChange(JSON.stringify({ quantity: safe }));
  }

  const recurringSuffix =
    settings.priceKind === "recurring"
      ? settings.recurringLabel ?? `/${settings.interval ?? "month"}`
      : "";

  return (
    <FieldWrapper
      label={field.label}
      instructions={field.instructions}
      required={field.required}
      labelPlacement={labelPlacement}
      instructionPlacement={instructionPlacement}
    >
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">
          {formatNumber(unitPrice, settings.numberFormat)}
        </span>
        <span className="text-muted-foreground" aria-hidden="true">
          ×
        </span>
        {userEditableQty ? (
          <input
            type="number"
            min={0}
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            aria-label={`${field.label} quantity`}
            className="h-8 w-16 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
          />
        ) : (
          <span className="tabular-nums text-foreground">{quantity}</span>
        )}
        <span className="text-muted-foreground" aria-hidden="true">
          =
        </span>
        <output
          data-slot="product-line-total"
          className="inline-flex h-8 items-center rounded-none border border-border bg-muted/40 px-2 font-medium tabular-nums text-foreground"
        >
          {formatNumber(lineTotal, settings.numberFormat)}
          {recurringSuffix ? (
            <span className="ml-1 text-[10px] font-normal text-muted-foreground">
              {recurringSuffix}
            </span>
          ) : null}
        </output>
      </div>
    </FieldWrapper>
  );
}
