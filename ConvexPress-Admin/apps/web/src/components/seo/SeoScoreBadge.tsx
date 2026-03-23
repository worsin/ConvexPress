/**
 * SeoScoreBadge - Color-coded SEO/readability score indicator.
 *
 * Green (70-100), orange (40-69), red (0-39), gray (N/A).
 */

import { cn } from "@/lib/utils";
import { getScoreRange, getScoreColor, getScoreBgColor, getScoreLabel } from "@/lib/seo/utils";

interface SeoScoreBadgeProps {
  score: number | null | undefined;
  label?: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export function SeoScoreBadge({
  score,
  label,
  size = "md",
  showLabel = true,
}: SeoScoreBadgeProps) {
  const range = getScoreRange(score);
  const colorClass = getScoreColor(score);
  const bgClass = getScoreBgColor(score);
  const displayLabel = label ?? getScoreLabel(score);

  const sizeClasses = {
    sm: "size-6 text-[10px]",
    md: "size-8 text-xs",
    lg: "size-10 text-sm",
  };

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "inline-flex items-center justify-center rounded-full font-semibold",
          sizeClasses[size],
          bgClass,
          colorClass,
        )}
        title={displayLabel}
      >
        {score != null ? score : "-"}
      </div>
      {showLabel && (
        <span className={cn("text-xs", colorClass)}>{displayLabel}</span>
      )}
    </div>
  );
}
