/**
 * "Add widget" dialog: every registry widget the viewer may use, grouped by
 * category. A widget can be added more than once (each gets its own key).
 */

import { Plus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { resolveIcon } from "../icons";
import { WIDGET_CATEGORY_LABELS, WIDGET_CATEGORY_ORDER, type DashboardWidgetDefinition } from "../types";

interface WidgetPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  widgets: DashboardWidgetDefinition[];
  /** Widget ids already on the grid (shown as "Added", still addable). */
  presentIds: ReadonlySet<string>;
  /** Widget ids with a website module; others are listed as unavailable. */
  availableIds: ReadonlySet<string>;
  onAdd: (widget: DashboardWidgetDefinition) => void;
}

export function WidgetPicker({ open, onOpenChange, widgets, presentIds, availableIds, onAdd }: WidgetPickerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] overflow-y-auto rounded-none sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">Add a widget</DialogTitle>
          <DialogDescription>Pick what you want to see on your dashboard. You can move and resize it afterwards.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {WIDGET_CATEGORY_ORDER.map((category) => {
            const members = widgets.filter((widget) => widget.category === category);
            if (members.length === 0) return null;
            return (
              <section key={category} aria-labelledby={`picker-${category}`}>
                <h3 id={`picker-${category}`} className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {WIDGET_CATEGORY_LABELS[category]}
                </h3>
                <ul role="list" className="grid gap-2 sm:grid-cols-2">
                  {members.map((widget) => {
                    const Icon = resolveIcon(widget.icon);
                    const available = availableIds.has(widget.id);
                    const present = presentIds.has(widget.id);
                    return (
                      <li key={widget.id} className="flex items-start gap-3 border border-border bg-card p-3">
                        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{widget.title}</p>
                          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{widget.description}</p>
                          {!available && (
                            <p className="mt-1 text-[10px] text-muted-foreground">Not available on this site yet.</p>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={!available}
                          onClick={() => {
                            onAdd(widget);
                            onOpenChange(false);
                          }}
                          className="inline-flex h-8 shrink-0 items-center gap-1 border border-border px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Plus className="size-3.5" aria-hidden="true" />
                          {present ? "Add again" : "Add"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
