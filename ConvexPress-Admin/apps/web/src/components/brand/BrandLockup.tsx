/**
 * Brand lockup — the lens mark beside the "ConvexPress" wordmark.
 * `collapsed` renders the mark alone (icon-only sidebar).
 */

import { cn } from "@/lib/utils";
import { BrandMark } from "./BrandMark";

interface BrandLockupProps {
  collapsed?: boolean;
  /** Mark size in px. Wordmark scales with it. */
  size?: number;
  tone?: "ink" | "copper" | "outline";
  className?: string;
}

export function Wordmark({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={cn("font-sans tracking-[-0.02em] text-foreground", className)}
      style={style}
    >
      <span className="font-medium">Convex</span>
      <span className="font-semibold">Press</span>
    </span>
  );
}

export function BrandLockup({
  collapsed = false,
  size = 28,
  tone = "ink",
  className,
}: BrandLockupProps) {
  return (
    <span
      className={cn("inline-flex items-center gap-2.5 select-none", className)}
    >
      <BrandMark size={size} tone={tone} />
      {!collapsed && (
        <Wordmark
          className="leading-none whitespace-nowrap"
          style={{ fontSize: Math.round(size * 0.59) }}
        />
      )}
    </span>
  );
}
