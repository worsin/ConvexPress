/**
 * FieldCalculation — read-only display of a computed `calculation` field.
 *
 * Form Calculation & Pricing System. A `calculation` field's value is DERIVED
 * from a formula (recomputed live for UX by the metabox/form renderer, and
 * authoritatively on the server at submit). It is NEVER user-editable — there is
 * no `onChange` from the user. This component renders the current numeric value
 * formatted per `settings.numberFormat`.
 */

import { useMemo } from "react";
import type { FieldRendererProps } from "./index";
import { FieldWrapper } from "./FieldWrapper";
import { formatNumber, type NumberFormat } from "@/components/forms/calc";

export function FieldCalculation({
  field,
  value,
  labelPlacement,
  instructionPlacement,
}: FieldRendererProps) {
  const settings = useMemo(() => {
    try {
      return JSON.parse(field.settings) as { numberFormat?: NumberFormat };
    } catch {
      return {} as { numberFormat?: NumberFormat };
    }
  }, [field.settings]);

  // The renderer feeds this field its recomputed numeric value as a string. An
  // empty/blank value displays as the formatted zero (never a crash).
  const numeric = Number(value);
  const display = formatNumber(
    Number.isFinite(numeric) ? numeric : 0,
    settings.numberFormat,
  );

  return (
    <FieldWrapper
      label={field.label}
      instructions={field.instructions}
      required={field.required}
      labelPlacement={labelPlacement}
      instructionPlacement={instructionPlacement}
    >
      <output
        data-slot="calculation-value"
        className="inline-flex h-8 min-w-24 items-center rounded-none border border-border bg-muted/40 px-2 text-xs font-medium tabular-nums text-foreground"
      >
        {display}
      </output>
    </FieldWrapper>
  );
}
