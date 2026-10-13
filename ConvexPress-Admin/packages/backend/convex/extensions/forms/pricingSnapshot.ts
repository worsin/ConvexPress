/**
 * Forms — typed readers for the pricing snapshot stored in
 * `form_submissions.meta` (JSON). The snapshot is written by
 * `calc/recompute.recomputeAuthoritative`; these readers check every field at
 * runtime and project each entry onto its declared shape, so stored data never
 * leaves a query untyped. Malformed entries are dropped, never repaired.
 */
import type { PricingLineItem } from "./calc/recompute";

export type PricingRecurringSnapshot = {
  interval: string;
  amount: number;
  label?: string;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function optionalNumber(record: JsonRecord, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function toRecurringSnapshot(raw: unknown): PricingRecurringSnapshot | null {
  if (!isRecord(raw)) return null;
  const interval = optionalString(raw, "interval");
  const amount = optionalNumber(raw, "amount");
  if (interval === undefined || amount === undefined) return null;
  const label = optionalString(raw, "label");
  return label === undefined ? { interval, amount } : { interval, amount, label };
}

export function toPricingLineItem(raw: unknown): PricingLineItem | null {
  if (!isRecord(raw)) return null;
  const source = raw.source;
  const priceKind = raw.priceKind;
  const fieldKey = optionalString(raw, "fieldKey");
  const fieldLabel = optionalString(raw, "fieldLabel");
  const label = optionalString(raw, "label");
  const amount = optionalNumber(raw, "amount");
  if (
    (source !== "choice" && source !== "product" && source !== "calculation") ||
    (priceKind !== "oneTime" && priceKind !== "recurring") ||
    fieldKey === undefined ||
    fieldLabel === undefined ||
    label === undefined ||
    amount === undefined
  ) {
    return null;
  }
  const line: PricingLineItem = { source, fieldKey, fieldLabel, label, amount, priceKind };
  const choiceValue = optionalString(raw, "choiceValue");
  if (choiceValue !== undefined) line.choiceValue = choiceValue;
  const quantity = optionalNumber(raw, "quantity");
  if (quantity !== undefined) line.quantity = quantity;
  const interval = raw.interval;
  if (interval === "month" || interval === "year") line.interval = interval;
  const recurringLabel = optionalString(raw, "recurringLabel");
  if (recurringLabel !== undefined) line.recurringLabel = recurringLabel;
  const firstPeriodAmount = optionalNumber(raw, "firstPeriodAmount");
  if (firstPeriodAmount !== undefined) line.firstPeriodAmount = firstPeriodAmount;
  return line;
}

export function parsePricingLineItems(value: unknown): PricingLineItem[] {
  if (!Array.isArray(value)) return [];
  const lines: PricingLineItem[] = [];
  for (const raw of value) {
    const line = toPricingLineItem(raw);
    if (line) lines.push(line);
  }
  return lines;
}

export function parseRecurringSnapshots(value: unknown): PricingRecurringSnapshot[] {
  if (!Array.isArray(value)) return [];
  const lines: PricingRecurringSnapshot[] = [];
  for (const raw of value) {
    const line = toRecurringSnapshot(raw);
    if (line) lines.push(line);
  }
  return lines;
}
