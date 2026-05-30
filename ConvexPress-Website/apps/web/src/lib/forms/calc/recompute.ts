/**
 * ConvexPress Forms — Calculation & Pricing core: recompute pipeline
 *
 * CANONICAL SOURCE (authored once, mirrored byte-identically). See grammar.ts.
 * MIRRORS:
 *   - Admin FE: apps/web/src/components/forms/calc/recompute.ts
 *   - Website:  ConvexPress-Website/apps/web/src/lib/forms/calc/recompute.ts
 *
 * `recomputeForm(fields, values, repeaters)` walks the topo order from graph.ts,
 * evaluates each computed field, and writes results back into a working value map
 * so dependents cascade in one pass (`subtotal → grand_total`). It returns:
 *   - `computed`: fieldKey -> value (number for `calculation`, line object for
 *     `product`),
 *   - `pricing`: the two-channel {@link PricingResult} (one-time + recurring).
 *
 * `recomputeAuthoritative(fields, valueMap)` is the SERVER entry the submit
 * mutation calls: identical logic but pricing is emitted in INTEGER CENTS so the
 * Commerce Action never re-walks the graph and float drift can't occur. Money
 * fields are the trust boundary — the client recompute is UX only.
 *
 * Runtime cycles NEVER throw here: an offending node resolves to 0 and is flagged
 * in `errors` (PRD §9 "never throw in the public renderer").
 */

import { parse } from "./parse";
import { evalAst, toNumber, type RepeaterRow, type Scope } from "./evaluate";
import {
  buildDependencyGraph,
  isComputedField,
  COMPUTED_TYPES,
  type CalcFieldDef,
} from "./graph";

// ─── Pricing result ─────────────────────────────────────────────────────────

export type Interval = "month" | "year";
export type PriceKind = "none" | "oneTime" | "recurring";

/** A grouped recurring charge (one bucket per interval). */
export interface RecurringLine {
  interval: Interval;
  amount: number;
  label?: string;
}

/** The two-channel total recompute returns (never a single scalar). */
export interface PricingResult {
  /** All one-time lines + the one-time portion of recurring lines. */
  oneTime: number;
  /** Recurring charges grouped by interval. */
  recurring: RecurringLine[];
}

/** The value object stored for a `product` field. */
export interface ProductLine {
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  priceKind: Exclude<PriceKind, "none">;
  interval?: Interval;
  recurringLabel?: string;
  /**
   * The amount due in the FIRST period for a recurring line (e.g. "$99 first
   * year"). Defaults to lineTotal when not separately configured.
   */
  firstPeriodAmount?: number;
}

/** Result of {@link recomputeForm}. */
export interface RecomputeResult {
  /** fieldKey -> computed value: number (calculation) or ProductLine (product). */
  computed: Record<string, number | ProductLine>;
  /** Two-channel pricing summary (in the SAME units as the inputs). */
  pricing: PricingResult;
  /** fieldKeys that hit a runtime cycle / evaluation issue (resolved to 0). */
  errors: string[];
}

// ─── Settings parsing ───────────────────────────────────────────────────────

interface CalcSettings {
  computed?: boolean;
  formula?: string;
  treatBlankAs?: number;
  repeaterKey?: string;
  priceKind?: PriceKind;
  interval?: Interval;
  tables?: Record<string, Record<string, number>>;
  // product-specific
  priceMode?: "fixed" | "userDefined" | "calculated";
  unitPrice?: number;
  unitPriceFormula?: string;
  quantityFieldKey?: string;
  recurringLabel?: string;
  firstPeriodAmount?: number;
}

function parseCalcSettings(settings: string | undefined | null): CalcSettings {
  if (!settings) return {};
  try {
    const parsed = JSON.parse(settings);
    return parsed && typeof parsed === "object" ? (parsed as CalcSettings) : {};
  } catch {
    return {};
  }
}

// ─── Core recompute ─────────────────────────────────────────────────────────

/**
 * Recompute all computed fields against the current values + repeater rows.
 * `values` and `repeaters` are keyed by field `key`. The returned `computed`
 * values are in the SAME units as the inputs (dollars on the client). Use
 * {@link recomputeAuthoritative} for the cents-scaled server figure.
 */
export function recomputeForm(
  fields: CalcFieldDef[],
  values: Record<string, unknown>,
  repeaters: Record<string, RepeaterRow[]> = {},
): RecomputeResult {
  const { order } = buildDependencyGraph(fields);
  const byKey = new Map(fields.map((f) => [f.key, f]));

  // Working value map: starts from raw inputs, then computed results are written
  // back so dependents read the freshly-computed upstream value.
  const working: Record<string, unknown> = { ...values };
  const computed: Record<string, number | ProductLine> = {};
  const errors: string[] = [];

  // Fields not in `order` only when they hit a cycle; resolve them last at 0.
  const computedFields = fields.filter(isComputedField);
  const orderedSet = new Set(order);
  const cyclic = computedFields
    .filter((f) => !orderedSet.has(f.key))
    .map((f) => f.key);

  for (const key of order) {
    const def = byKey.get(key);
    if (!def) continue;
    evalOneField(def, working, repeaters, computed);
  }

  // Cyclic nodes: resolve to 0 / empty line, flag as error, never throw.
  for (const key of cyclic) {
    const def = byKey.get(key);
    if (!def) continue;
    errors.push(key);
    if (def.type === "product") {
      const settings = parseCalcSettings(def.settings);
      computed[key] = {
        unitPrice: 0,
        quantity: 0,
        lineTotal: 0,
        priceKind: settings.priceKind === "recurring" ? "recurring" : "oneTime",
        interval: settings.interval,
      };
    } else {
      computed[key] = 0;
      working[key] = 0;
    }
  }

  const pricing = buildPricing(fields, computed);
  return { computed, pricing, errors };
}

/** Evaluate a single computed field; writes its result into `computed` + `working`. */
function evalOneField(
  def: CalcFieldDef,
  working: Record<string, unknown>,
  repeaters: Record<string, RepeaterRow[]>,
  computed: Record<string, number | ProductLine>,
): void {
  const settings = parseCalcSettings(def.settings);
  const treatBlankAs =
    typeof settings.treatBlankAs === "number" ? settings.treatBlankAs : 0;

  const scope: Scope = {
    values: working,
    repeaters,
    repeaterKey: settings.repeaterKey,
    tables: settings.tables,
    treatBlankAs,
  };

  if (def.type === "product") {
    const line = evalProduct(def, settings, scope);
    computed[def.key] = line;
    // A product's numeric contribution (its line total) is what dependents read.
    working[def.key] = line.lineTotal;
    return;
  }

  // calculation (or settings.computed === true): a single formula → number.
  const value = settings.formula
    ? safeEval(settings.formula, scope)
    : treatBlankAs;
  computed[def.key] = value;
  working[def.key] = value;
}

/** Evaluate a product field into a ProductLine. */
function evalProduct(
  def: CalcFieldDef,
  settings: CalcSettings,
  scope: Scope,
): ProductLine {
  // Unit price by mode.
  let unitPrice: number;
  if (settings.priceMode === "calculated" && settings.unitPriceFormula) {
    unitPrice = safeEval(settings.unitPriceFormula, scope);
  } else if (settings.priceMode === "userDefined") {
    // The respondent's entered unit price lives in the value map under the key.
    unitPrice = toNumber(scope.values[def.key], scope.treatBlankAs);
  } else {
    // fixed (or unset): the configured unitPrice.
    unitPrice =
      typeof settings.unitPrice === "number" ? settings.unitPrice : 0;
  }

  // Quantity: driven by another field, else default 1.
  let quantity = 1;
  if (settings.quantityFieldKey) {
    quantity = toNumber(scope.values[settings.quantityFieldKey], 1);
    if (quantity < 0) quantity = 0;
  }

  const lineTotal = roundMoney(unitPrice * quantity);
  const priceKind: Exclude<PriceKind, "none"> =
    settings.priceKind === "recurring" ? "recurring" : "oneTime";

  const line: ProductLine = {
    unitPrice: roundMoney(unitPrice),
    quantity,
    lineTotal,
    priceKind,
  };
  if (priceKind === "recurring") {
    line.interval = settings.interval ?? "month";
    if (settings.recurringLabel) line.recurringLabel = settings.recurringLabel;
    line.firstPeriodAmount =
      typeof settings.firstPeriodAmount === "number"
        ? roundMoney(settings.firstPeriodAmount)
        : lineTotal;
  }
  return line;
}

/** Parse + walk a formula, never throwing (runtime safety). 0 on parse failure. */
function safeEval(formula: string, scope: Scope): number {
  try {
    const ast = parse(formula);
    return evalAst(ast, scope);
  } catch {
    return scope.treatBlankAs;
  }
}

/** Round a money amount to 2 decimals (dollar-space). Cents scaling is separate. */
function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

// ─── Pricing aggregation ────────────────────────────────────────────────────

/**
 * Build the two-channel PricingResult from the computed values. Contributors:
 *   - every `product` line (one-time → oneTime; recurring → a recurring bucket,
 *     with its first-period amount added to oneTime),
 *   - every `calculation` field whose `settings.priceKind` is "oneTime" or
 *     "recurring" (its numeric value is the amount).
 * Recurring lines are grouped by interval into separate buckets.
 */
function buildPricing(
  fields: CalcFieldDef[],
  computed: Record<string, number | ProductLine>,
): PricingResult {
  let oneTime = 0;
  // interval -> { amount, label? }
  const recurringByInterval = new Map<Interval, { amount: number; label?: string }>();

  function addRecurring(interval: Interval, amount: number, label?: string): void {
    const existing = recurringByInterval.get(interval);
    if (existing) {
      existing.amount += amount;
      if (!existing.label && label) existing.label = label;
    } else {
      recurringByInterval.set(interval, { amount, label });
    }
  }

  for (const def of fields) {
    const value = computed[def.key];
    if (value === undefined) continue;

    if (def.type === "product" && typeof value === "object") {
      const line = value;
      if (line.priceKind === "recurring") {
        const interval = line.interval ?? "month";
        // First-period amount is due today (lands in oneTime); the ongoing
        // lineTotal is the recurring charge.
        oneTime += line.firstPeriodAmount ?? line.lineTotal;
        addRecurring(interval, line.lineTotal, line.recurringLabel);
      } else {
        oneTime += line.lineTotal;
      }
      continue;
    }

    if (def.type === "calculation" && typeof value === "number") {
      const settings = parseCalcSettings(def.settings);
      if (settings.priceKind === "oneTime") {
        oneTime += value;
      } else if (settings.priceKind === "recurring") {
        addRecurring(settings.interval ?? "month", value);
      }
      // priceKind "none"/absent ⇒ a plain derived number, not a money line.
    }
  }

  const recurring: RecurringLine[] = [];
  for (const [interval, bucket] of recurringByInterval) {
    const amount = roundMoney(bucket.amount);
    // A zero-amount recurring bucket means every line feeding it dropped out
    // (e.g. all recurring add-ons unchecked) — omit it (PRD §9 "removed line
    // drops out"). The Commerce Action never builds a $0 subscription item.
    if (amount === 0) continue;
    recurring.push({
      interval,
      amount,
      ...(bucket.label ? { label: bucket.label } : {}),
    });
  }

  return { oneTime: roundMoney(oneTime), recurring };
}

// ─── Server authoritative (integer cents) ───────────────────────────────────

/** A computed value scaled for storage: number→cents; ProductLine→cents fields. */
export type AuthoritativeValue = number | ProductLine;

/** Result of {@link recomputeAuthoritative}. All money in integer minor units. */
export interface AuthoritativeResult {
  /** fieldKey -> computed value (calculation numbers + product lines, in cents). */
  computed: Record<string, AuthoritativeValue>;
  /** The pricing summary in INTEGER CENTS (commerce/confirmation read this). */
  pricing: PricingResult;
  errors: string[];
}

/**
 * SERVER entry. Recomputes every computed field over the trusted value map and
 * returns the result scaled to INTEGER MINOR UNITS (cents) for money. The submit
 * mutation overwrites the persisted computed values with these and stores
 * `pricing` in `form_submissions.meta`. `minorUnitScale` defaults to 100 (2-dp
 * currencies); pass a different scale for zero/3-decimal currencies later.
 */
export function recomputeAuthoritative(
  fields: CalcFieldDef[],
  valueMap: Record<string, unknown>,
  repeaters: Record<string, RepeaterRow[]> = {},
  minorUnitScale = 100,
): AuthoritativeResult {
  const base = recomputeForm(fields, valueMap, repeaters);

  const toCents = (n: number): number => Math.round(n * minorUnitScale);

  // Scale computed values. A calculation flagged as money is scaled to cents; a
  // plain derived number is left as-is (it isn't currency). Product lines scale
  // their money fields.
  const computed: Record<string, AuthoritativeValue> = {};
  for (const def of fields) {
    const value = base.computed[def.key];
    if (value === undefined) continue;

    if (def.type === "product" && typeof value === "object") {
      computed[def.key] = scaleProductLine(value, toCents);
      continue;
    }

    if (def.type === "calculation" && typeof value === "number") {
      const settings = parseCalcSettings(def.settings);
      const isMoney =
        settings.priceKind === "oneTime" || settings.priceKind === "recurring";
      computed[def.key] = isMoney ? toCents(value) : value;
      continue;
    }

    computed[def.key] = value;
  }

  const pricing: PricingResult = {
    oneTime: toCents(base.pricing.oneTime),
    recurring: base.pricing.recurring.map((r) => ({
      interval: r.interval,
      amount: toCents(r.amount),
      ...(r.label ? { label: r.label } : {}),
    })),
  };

  return { computed, pricing, errors: base.errors };
}

function scaleProductLine(
  line: ProductLine,
  toCents: (n: number) => number,
): ProductLine {
  const scaled: ProductLine = {
    unitPrice: toCents(line.unitPrice),
    quantity: line.quantity,
    lineTotal: toCents(line.lineTotal),
    priceKind: line.priceKind,
  };
  if (line.interval) scaled.interval = line.interval;
  if (line.recurringLabel) scaled.recurringLabel = line.recurringLabel;
  if (typeof line.firstPeriodAmount === "number") {
    scaled.firstPeriodAmount = toCents(line.firstPeriodAmount);
  }
  return scaled;
}

/** Re-export so the renderer/editor can branch on computed types without re-import. */
export { COMPUTED_TYPES };
