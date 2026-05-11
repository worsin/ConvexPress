import { Check, Copy, Trash2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Theme } from "./types";

// ─── Gradient Presets ───────────────────────────────────────────────────────

const SLUG_GRADIENTS: Record<string, string> = {
  default: "from-blue-500/80 to-blue-600/60",
  "saas-product": "from-indigo-500/80 to-blue-500/60",
  corporate: "from-black/30 to-black/15",
  "creative-blog": "from-orange-400/70 to-pink-500/60",
  portfolio: "from-black/60 to-black/40",
};

const FALLBACK_GRADIENT = "from-primary/40 to-primary/20";

function getGradientClass(theme: Theme): string {
  return SLUG_GRADIENTS[theme.slug] ?? FALLBACK_GRADIENT;
}

// ─── Component ──────────────────────────────────────────────────────────────

interface ThemeCardProps {
  theme: Theme;
  onActivate: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ThemeCard({
  theme,
  onActivate,
  onDuplicate,
  onDelete,
}: ThemeCardProps) {
  const isActive = theme.isActive === true;
  const isPreset = theme.type === "preset";
  const canDelete = !isActive && !isPreset;

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-lg border bg-card transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5",
        isActive ? "border-green-500/50 ring-1 ring-green-500/20" : "border-border",
      )}
    >
      {/* Preview area */}
      <div
        className={cn(
          "relative flex h-40 items-end bg-gradient-to-br p-4",
          getGradientClass(theme),
        )}
      >
        <h3 className="text-lg font-semibold text-[#ccc] drop-shadow-md">
          {theme.name}
        </h3>

        {/* Active badge */}
        {isActive && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-green-500/90 px-2.5 py-0.5 text-xs font-medium text-[#ccc] shadow-sm">
            <Check className="size-3" />
            Active
          </span>
        )}
      </div>

      {/* Info section */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {theme.name}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                isPreset
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {isPreset && <Sparkles className="size-2.5" />}
              {theme.type}
            </span>
          </div>
          {theme.description && (
            <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {theme.description}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 border-t border-border pt-3">
          {isActive ? (
            <span className="text-xs font-medium text-green-500">
              Currently Active
            </span>
          ) : (
            <Button
              size="sm"
              onClick={() => onActivate(theme._id)}
            >
              Activate
            </Button>
          )}

          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onDuplicate(theme._id)}
              title="Duplicate theme"
            >
              <Copy className="size-3.5" />
            </Button>

            {canDelete && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onDelete(theme._id)}
                title="Delete theme"
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
