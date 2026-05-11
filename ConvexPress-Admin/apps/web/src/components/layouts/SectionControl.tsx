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
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionControlProps {
  label: string;
  hint?: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  canDisable?: boolean;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

export function SectionControl({
  label,
  hint,
  enabled,
  onToggle,
  canDisable = true,
  defaultExpanded = false,
  children,
}: SectionControlProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div
      className={cn(
        "rounded-xl border overflow-hidden transition-colors",
        enabled ? "border-border" : "border-border/50 opacity-60"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 bg-card px-3 py-2.5">
        {/* Toggle switch */}
        {canDisable && (
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => onToggle(!enabled)}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
              enabled ? "bg-primary" : "bg-muted"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                enabled ? "translate-x-4" : "translate-x-0"
              )}
            />
          </button>
        )}

        {/* Section label + expand/collapse toggle */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-foreground">{label}</span>
            {hint && (
              <p className="text-xs text-muted-foreground truncate">{hint}</p>
            )}
          </div>
          {expanded ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Expandable body */}
      {expanded && (
        <div className="bg-muted/50 px-3 py-3 space-y-3 border-t border-border/50">
          {children}
        </div>
      )}
    </div>
  );
}
