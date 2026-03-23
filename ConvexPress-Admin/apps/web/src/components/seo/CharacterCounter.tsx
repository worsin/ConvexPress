/**
 * CharacterCounter - Current/recommended character count display.
 *
 * Green (optimal), orange (acceptable), red (too short/long).
 */

import { cn } from "@/lib/utils";

interface CharacterCounterProps {
  current: number;
  recommendedMin: number;
  recommendedMax: number;
  max?: number;
}

export function CharacterCounter({
  current,
  recommendedMin,
  recommendedMax,
  max,
}: CharacterCounterProps) {
  const isOptimal = current >= recommendedMin && current <= recommendedMax;
  const isAcceptable =
    (current > 0 && current < recommendedMin) ||
    (current > recommendedMax && (!max || current <= max));
  const isBad = current === 0 || (max != null && current > max);

  const colorClass = isOptimal
    ? "text-seo-good"
    : isAcceptable
      ? "text-seo-ok"
      : isBad
        ? "text-seo-poor"
        : "text-muted-foreground";

  return (
    <span className={cn("text-xs tabular-nums", colorClass)}>
      {current}/{recommendedMax}
      {max && current > recommendedMax && ` (max: ${max})`}
    </span>
  );
}
