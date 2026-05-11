/**
 * FeaturesRepeater — inline editor for an offer's `features[]` array.
 *
 * Each feature row has:
 *   - text (string, required)
 *   - highlighted (bool — toggles a star indicator on the pricing card)
 *   - icon (string — a Lucide icon name; free-form, validated loosely)
 *
 * Users can reorder via up/down buttons, highlight via a switch, and
 * remove rows. "Add Feature" appends a fresh blank row.
 */

import { ArrowDown, ArrowUp, Plus, Star, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";

export interface FeatureItem {
  text: string;
  highlighted?: boolean;
  icon?: string;
}

interface FeaturesRepeaterProps {
  value: FeatureItem[];
  onChange: (items: FeatureItem[]) => void;
  disabled?: boolean;
  className?: string;
}

export function FeaturesRepeater({
  value,
  onChange,
  disabled,
  className,
}: FeaturesRepeaterProps) {
  function updateItem(index: number, patch: Partial<FeatureItem>) {
    const next = value.map((item, i) =>
      i === index ? { ...item, ...patch } : item,
    );
    onChange(next);
  }

  function removeItem(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function moveItem(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= value.length) return;
    const copy = [...value];
    const [item] = copy.splice(index, 1);
    copy.splice(next, 0, item);
    onChange(copy);
  }

  function addItem() {
    onChange([
      ...value,
      { text: "", highlighted: false, icon: "check" },
    ]);
  }

  return (
    <div className={cn("space-y-3", className)}>
      {value.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">No features yet.</p>
          <button
            type="button"
            onClick={addItem}
            disabled={disabled}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add the first feature
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {value.map((feature, i) => (
            <li
              key={i}
              className="rounded-xl border border-border bg-background p-3"
            >
              <div className="flex items-start gap-2">
                <div className="flex flex-col gap-1 pt-1">
                  <button
                    type="button"
                    onClick={() => moveItem(i, -1)}
                    disabled={disabled || i === 0}
                    aria-label="Move feature up"
                    className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveItem(i, 1)}
                    disabled={disabled || i === value.length - 1}
                    aria-label="Move feature down"
                    className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid flex-1 gap-2 sm:grid-cols-[1fr_120px_auto]">
                  <input
                    value={feature.text}
                    onChange={(e) =>
                      updateItem(i, { text: e.target.value })
                    }
                    disabled={disabled}
                    placeholder="Feature text (e.g. '10 seats included')"
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <input
                    value={feature.icon ?? ""}
                    onChange={(e) =>
                      updateItem(i, { icon: e.target.value })
                    }
                    disabled={disabled}
                    placeholder="Icon"
                    className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      updateItem(i, { highlighted: !feature.highlighted })
                    }
                    disabled={disabled}
                    aria-pressed={!!feature.highlighted}
                    aria-label="Toggle highlighted"
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                      feature.highlighted
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:bg-muted",
                      disabled && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <Star
                      className={cn(
                        "h-3.5 w-3.5",
                        feature.highlighted && "fill-current",
                      )}
                    />
                    {feature.highlighted ? "Highlighted" : "Normal"}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  disabled={disabled}
                  aria-label="Remove feature"
                  className="shrink-0 rounded-lg border border-border bg-background p-1.5 text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={addItem}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" />
        Add feature
      </button>
    </div>
  );
}
