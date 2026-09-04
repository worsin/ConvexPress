/**
 * Widget picker — registry widgets grouped by category, with descriptions,
 * allowed sizes, and a note when the owning plugin is disabled.
 */

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";

import type { DashboardWidgetDefinition, DashboardWidgetSize } from "@backend/convex/extensions/dashboard/registry";
import { pluginIsEnabled } from "@backend/convex/extensions/dashboard/registry";
import { LucideDynamicIcon } from "@/components/icons/LucideDynamicIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const CATEGORY_LABELS: Record<DashboardWidgetDefinition["category"], string> = {
  overview: "Overview",
  activity: "Activity",
  commerce: "Shopping",
  learning: "Learning",
  support: "Support",
  content: "Content",
};

const CATEGORY_ORDER: DashboardWidgetDefinition["category"][] = ["overview", "activity", "commerce", "learning", "support", "content"];

interface WidgetPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  widgets: DashboardWidgetDefinition[];
  pluginFlags: Record<string, unknown>;
  /** How many times each widget is already on the grid. */
  counts: Record<string, number>;
  onAdd: (widget: DashboardWidgetDefinition, size?: DashboardWidgetSize) => void;
}

export function WidgetPickerDialog({ open, onOpenChange, widgets, pluginFlags, counts, onAdd }: WidgetPickerDialogProps) {
  const [search, setSearch] = useState("");
  const groups = useMemo(() => {
    const query = search.trim().toLowerCase();
    return CATEGORY_ORDER.map((category) => ({
      category,
      label: CATEGORY_LABELS[category],
      widgets: widgets.filter(
        (widget) =>
          widget.category === category &&
          (!query || widget.title.toLowerCase().includes(query) || widget.description.toLowerCase().includes(query) || widget.id.includes(query)),
      ),
    })).filter((group) => group.widgets.length > 0);
  }, [search, widgets]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 p-0" aria-describedby={undefined}>
        <DialogHeader className="border-b border-border px-6 pb-4 pt-6">
          <DialogTitle>Add a widget</DialogTitle>
          <DialogDescription>Widgets from every enabled plugin. The same widget can be placed more than once.</DialogDescription>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search widgets" className="pl-9" aria-label="Search widgets" autoFocus />
          </div>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          {groups.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No widgets match.</p>}
          {groups.map((group) => (
            <section key={group.category} className="mb-5 last:mb-0" aria-label={group.label}>
              <h3 className="eyebrow mb-2">{group.label}</h3>
              <ul className="flex flex-col gap-2">
                {group.widgets.map((widget) => {
                  const enabled = pluginIsEnabled(widget.pluginId, pluginFlags);
                  const count = counts[widget.id] ?? 0;
                  return (
                    <li
                      key={widget.id}
                      className={cn("flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5", !enabled && "opacity-70")}
                    >
                      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-surface-2 text-ink-2">
                        <LucideDynamicIcon name={widget.icon} className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[13px] font-semibold text-foreground">{widget.title}</span>
                          {widget.pluginId !== "core" && (
                            <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                              {widget.pluginId}
                            </Badge>
                          )}
                          {count > 0 && (
                            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                              on grid ×{count}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{widget.description}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                          <span>Sizes:</span>
                          {widget.sizes.map((size) => (
                            <span key={size} className={cn("rounded bg-surface-2 px-1 font-mono uppercase", size === widget.defaultSize && "text-foreground")}>
                              {size}
                            </span>
                          ))}
                          {widget.capability && <span>· needs {widget.capability}</span>}
                        </p>
                        {!enabled && (
                          <p className="mt-1 text-[11px] text-warning">
                            The {widget.pluginId} plugin is disabled — members will not see this widget until it is enabled in{" "}
                            <Link to="/plugins" className="underline underline-offset-2">
                              Extensions
                            </Link>
                            .
                          </p>
                        )}
                      </div>
                      <Button size="sm" variant="outline" onClick={() => onAdd(widget)} aria-label={`Add ${widget.title}`}>
                        <Plus data-icon="inline-start" />
                        Add
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
