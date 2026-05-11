/**
 * Quote ranking for the PRD A7 pipeline.
 * isCheapest = lowest amount
 * isFastest  = earliest estimatedDaysMax (falls back to estimatedDaysMin)
 * isBestValue = weighted score: 0.6*costRank + 0.4*speedRank (smallest wins)
 */

import type { NormalizedShippingQuote } from "./types";

type Unranked = Omit<
  NormalizedShippingQuote,
  "isCheapest" | "isFastest" | "isBestValue"
>;

function speedMetric(q: Unranked): number {
  return (
    q.estimatedDaysMax ??
    q.estimatedDaysMin ??
    (q.deliveryDateEstimated ? Math.max(1, q.deliveryDateEstimated) : Number.MAX_SAFE_INTEGER)
  );
}

export function rankQuotes(quotes: Unranked[]): NormalizedShippingQuote[] {
  if (quotes.length === 0) return [];

  const byCost = [...quotes].sort((a, b) => a.amount - b.amount);
  const bySpeed = [...quotes].sort((a, b) => speedMetric(a) - speedMetric(b));

  const cheapestAmount = byCost[0]!.amount;
  const fastestValue = speedMetric(bySpeed[0]!);

  const scored = quotes.map((q) => {
    const costRank = byCost.findIndex((x) => x.quoteKey === q.quoteKey) + 1;
    const speedRank = bySpeed.findIndex((x) => x.quoteKey === q.quoteKey) + 1;
    return {
      ...q,
      isCheapest: q.amount === cheapestAmount,
      isFastest: speedMetric(q) === fastestValue,
      isBestValue: false,
      _score: costRank * 0.6 + speedRank * 0.4,
    };
  });

  scored.sort((a, b) => a._score - b._score || a.amount - b.amount);
  if (scored[0]) scored[0].isBestValue = true;

  return scored.map(({ _score, ...rest }) => rest);
}
