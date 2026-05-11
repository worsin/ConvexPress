/**
 * @deprecated 2026-05-11 — Legacy in-admin Theme/Template Builder.
 *
 * STATUS:  Frozen. Hidden from active nav. Do NOT extend or fix issues here.
 * REASON:  A pre-built section enum + preset theme picker limits what each
 *          site can look like. Replaced by AI-generated React components,
 *          one per route, generated per site by the design:* skill kit.
 * REPLACEMENT:  See ConvexPress-Website/design-kit/README.md
 * REMOVAL:  Safe to delete once at least one site is fully shipped via the
 *           skill kit and nothing else references this file.
 */
import { cn } from "@/lib/utils";

interface VariantPickerProps {
  variants: { id: string; label: string }[];
  selected: string;
  onChange: (id: string) => void;
  columns?: 2 | 3;
}

export function VariantPicker({
  variants,
  selected,
  onChange,
  columns = 2,
}: VariantPickerProps) {
  return (
    <div
      className={cn(
        "grid gap-1.5",
        columns === 3 ? "grid-cols-3" : "grid-cols-2"
      )}
    >
      {variants.map((variant) => (
        <button
          key={variant.id}
          type="button"
          onClick={() => onChange(variant.id)}
          className={cn(
            "rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors text-center",
            selected === variant.id
              ? "bg-primary text-primary-foreground"
              : "bg-card text-muted-foreground hover:bg-card/80 hover:text-foreground border border-border/50"
          )}
        >
          {variant.label}
        </button>
      ))}
    </div>
  );
}
