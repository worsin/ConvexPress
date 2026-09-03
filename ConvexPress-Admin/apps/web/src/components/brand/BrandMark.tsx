/**
 * ConvexPress brand mark — "The Lens".
 *
 * A rounded tile carrying a convex lens profile with a single copper focal
 * point. Tones follow the theme tokens so the same component works on the
 * sidebar, login page, and window chrome in both modes.
 */

import { cn } from "@/lib/utils";

interface BrandMarkProps {
  /** Rendered size in px (square). */
  size?: number;
  /**
   * ink     — ink tile, page-coloured lens, copper dot (default chrome)
   * copper  — copper tile, bone lens, ink dot (accent / marketing)
   * outline — no tile, ink lens, copper dot (monochrome / favicon)
   */
  tone?: "ink" | "copper" | "outline";
  className?: string;
}

export function BrandMark({ size = 28, tone = "ink", className }: BrandMarkProps) {
  const radius = Math.max(6, Math.round(size * 0.28));
  const tile =
    tone === "copper"
      ? "var(--primary)"
      : tone === "ink"
        ? "var(--foreground)"
        : "transparent";
  const lens =
    tone === "copper"
      ? "var(--primary-foreground)"
      : tone === "ink"
        ? "var(--background)"
        : "var(--foreground)";
  const dot = tone === "copper" ? "var(--foreground)" : "var(--primary)";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0", className)}
    >
      <rect width="32" height="32" rx={radius} fill={tile} />
      <path d="M13 6.5c7 5 7 14 0 19-7-5-7-14 0-19z" fill={lens} />
      <circle cx="24" cy="16" r="2.6" fill={dot} />
    </svg>
  );
}
