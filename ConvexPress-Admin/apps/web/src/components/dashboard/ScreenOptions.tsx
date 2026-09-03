/**
 * Dashboard System - Screen Options
 *
 * Collapsible panel for configuring widget visibility on the dashboard.
 * Mirrors WordPress's Screen Options tab.
 *
 * Differs from the shared ScreenOptions component in that this one
 * controls widget visibility rather than table column visibility.
 *
 * Uses Base UI Collapsible (NOT Radix).
 */

import { useCallback } from "react";
import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { ChevronDownIcon, SlidersHorizontal } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { WIDGET_REGISTRY } from "@/lib/dashboard/widget-registry";
import { useControlShell } from "@/control/ControlShellContext";

interface DashboardScreenOptionsProps {
  /** IDs of currently hidden widgets. */
  hiddenWidgets: string[];
  /** User's capabilities for filtering available widgets. */
  userCapabilities: string[];
  /** Callback to show a widget (remove from hidden). */
  onRestoreWidget: (widgetId: string) => void;
  /** Callback to hide a widget (add to hidden). */
  onDismissWidget: (widgetId: string) => void;
}

export function DashboardScreenOptions({
  hiddenWidgets,
  userCapabilities,
  onRestoreWidget,
  onDismissWidget,
}: DashboardScreenOptionsProps) {
  const standalone = useControlShell() !== null;

  // Only show widgets the user has capability to see
  const availableWidgets = WIDGET_REGISTRY.filter((widget) => {
    if (widget.standaloneOnly && !standalone) return false;
    if (
      widget.minCapability &&
      !userCapabilities.includes(widget.minCapability)
    ) {
      return false;
    }
    return true;
  });

  const handleToggle = useCallback(
    (widgetId: string, checked: boolean) => {
      if (checked) {
        onRestoreWidget(widgetId);
      } else {
        onDismissWidget(widgetId);
      }
    },
    [onRestoreWidget, onDismissWidget],
  );

  if (availableWidgets.length === 0) return null;

  return (
    <CollapsiblePrimitive.Root>
      <div className="flex justify-end">
        <CollapsiblePrimitive.Trigger className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <SlidersHorizontal className="size-3.5" aria-hidden="true" />
          Screen Options
          <ChevronDownIcon className="size-3.5 transition-transform data-[panel-open]:rotate-180" aria-hidden="true" />
        </CollapsiblePrimitive.Trigger>
      </div>
      <CollapsiblePrimitive.Panel className="overflow-hidden data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0">
        <div className="mt-2 rounded-xl border border-border bg-card px-[18px] py-4 shadow-soft">
          <h4 className="eyebrow mb-3">Show on screen</h4>
          <div className="flex flex-wrap gap-x-6 gap-y-2.5">
            {availableWidgets.map((widget) => {
              const isVisible = !hiddenWidgets.includes(widget.id);
              return (
                <label
                  key={widget.id}
                  className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-2"
                >
                  <Checkbox
                    checked={isVisible}
                    onCheckedChange={(checked) =>
                      handleToggle(widget.id, !!checked)
                    }
                  />
                  {widget.title}
                </label>
              );
            })}
          </div>
        </div>
      </CollapsiblePrimitive.Panel>
    </CollapsiblePrimitive.Root>
  );
}
