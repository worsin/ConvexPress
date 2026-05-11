/**
 * PRD B9 Table Rate Shipping.
 * Multi-row conditions via A6 rules engine + cost formulas.
 */

import type { NormalizedShippingQuote } from "../rates/types";
import { evaluateRule } from "../rulesEngine/evaluator";
import type { RuleAST, RuleContext } from "../rulesEngine/types";

export type TableRateRow = {
  priority: number;
  conditionAST: RuleAST;
  costFormula: {
    mode: "flat" | "per_weight" | "per_item" | "per_subtotal";
    baseCost: number;
    perUnitCost?: number;
    unitCap?: number;
  };
  /** PRD B9 §2 — per-row cost clamps. */
  minCost?: number;
  maxCost?: number;
  rowId?: string;
  label?: string;
  enabled: boolean;
};

export type TableRateConfig = {
  _id: string;
  zoneId: string;
  name: string;
  label: string;
  matchMode: "first_match" | "all_matches_sum" | "cheapest_match";
  /** PRD B9 §2 — method-level cost clamps across the final computed total. */
  minCost?: number;
  maxCost?: number;
  rows: TableRateRow[];
  enabled: boolean;
};

/** PRD B9 §2 — per-row matched metric, surfaced in diagnostics. */
export type TableRateRowMetric = {
  rowId?: string;
  priority: number;
  label?: string;
  matched: boolean;
  cost: number;
};

export type TableRateCartContext = {
  currencyCode: string;
  totalWeightOz: number;
  itemCount: number;
  subtotalAmount: number;
  addressKey: string;
  cartKey: string;
  ruleContext: RuleContext;
};

function computeRowCost(row: TableRateRow, cart: TableRateCartContext): number {
  const f = row.costFormula;
  let cost = f.baseCost;
  if (f.perUnitCost !== undefined) {
    let units = 0;
    switch (f.mode) {
      case "flat":
        break;
      case "per_weight":
        units = cart.totalWeightOz;
        break;
      case "per_item":
        units = cart.itemCount;
        break;
      case "per_subtotal":
        units = cart.subtotalAmount;
        break;
    }
    if (f.unitCap !== undefined) units = Math.min(units, f.unitCap);
    cost += units * f.perUnitCost;
  }
  // Per-row min/max clamp (PRD B9 §2).
  if (row.minCost !== undefined) cost = Math.max(cost, row.minCost);
  if (row.maxCost !== undefined) cost = Math.min(cost, row.maxCost);
  return Math.max(0, cost);
}

export function calculateTableRate(
  config: TableRateConfig,
  cart: TableRateCartContext,
  quoteCacheTtlSeconds = 300,
): NormalizedShippingQuote[] {
  if (!config.enabled) return [];

  const enabledRows = config.rows
    .filter((r) => r.enabled)
    .sort((a, b) => a.priority - b.priority);

  const matches = enabledRows.filter((r) =>
    evaluateRule(r.conditionAST, cart.ruleContext),
  );

  if (matches.length === 0) return [];

  let cost = 0;
  let chosenLabel: string | undefined;

  if (config.matchMode === "first_match") {
    cost = computeRowCost(matches[0]!, cart);
    chosenLabel = matches[0]!.label;
  } else if (config.matchMode === "all_matches_sum") {
    cost = matches.reduce((sum, r) => sum + computeRowCost(r, cart), 0);
    chosenLabel = matches.map((r) => r.label).filter(Boolean).join(" + ");
  } else {
    // cheapest_match
    const costed = matches.map((r) => ({
      row: r,
      cost: computeRowCost(r, cart),
    }));
    costed.sort((a, b) => a.cost - b.cost);
    cost = costed[0]!.cost;
    chosenLabel = costed[0]!.row.label;
  }

  // Method-level min/max clamp on the final total (PRD B9 §2).
  if (config.minCost !== undefined) cost = Math.max(cost, config.minCost);
  if (config.maxCost !== undefined) cost = Math.min(cost, config.maxCost);
  cost = Math.max(0, cost);

  return [
    {
      quoteKey: `table_rate:${config._id}`,
      provider: "manual",
      carrierCode: "table_rate",
      carrierName: chosenLabel ?? config.label,
      serviceCode: config.name,
      serviceName: chosenLabel ?? config.label,
      amount: Math.round(cost * 100),
      currency: cart.currencyCode,
      isCheapest: false,
      isFastest: false,
      isBestValue: false,
      addressKey: cart.addressKey,
      cartKey: cart.cartKey,
      expiresAt: Date.now() + quoteCacheTtlSeconds * 1000,
    },
  ];
}
