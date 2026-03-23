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
import { ChevronDownIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { WIDGET_REGISTRY } from "@/lib/dashboard/widget-registry";

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
  // Only show widgets the user has capability to see
  const availableWidgets = WIDGET_REGISTRY.filter((widget) => {
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
      <div className="flex justify-end mb-2">
        <CollapsiblePrimitive.Trigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          Screen Options
          <ChevronDownIcon className="size-3.5 transition-transform data-[panel-open]:rotate-180" />
        </CollapsiblePrimitive.Trigger>
      </div>
      <CollapsiblePrimitive.Panel className="overflow-hidden data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0">
        <div className="border border-border bg-card p-4 mb-4">
          <h4 className="text-xs font-semibold text-foreground mb-2">
            Show on screen
          </h4>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {availableWidgets.map((widget) => {
              const isVisible = !hiddenWidgets.includes(widget.id);
              return (
                <label
                  key={widget.id}
                  className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer"
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
