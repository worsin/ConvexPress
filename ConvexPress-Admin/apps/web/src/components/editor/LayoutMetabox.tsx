/**
 * LayoutMetabox -- Allows editors to override the default layout for a specific
 * post or page, and optionally hide the site header/footer.
 *
 * Appears in the editor sidebar alongside other metaboxes.
 */

import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { Label } from "@/components/ui/label";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "@/lib/utils";

interface LayoutMetaboxProps {
  layoutId?: string;
  hideHeader?: boolean;
  hideFooter?: boolean;
  onLayoutChange: (layoutId: string) => void;
  onHideHeaderChange: (hide: boolean) => void;
  onHideFooterChange: (hide: boolean) => void;
}

function ToggleRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <label htmlFor={id} className="text-xs text-foreground cursor-pointer">
        {label}
      </label>
      <SwitchPrimitive.Root
        checked={checked}
        onCheckedChange={onChange}
        id={id}
        className={cn(
          "relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring/50",
          checked ? "bg-primary" : "bg-input",
        )}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            "pointer-events-none block size-2.5 rounded-full shadow-sm transition-transform",
            checked
              ? "translate-x-3 bg-primary-foreground"
              : "translate-x-0.5 bg-foreground/70",
          )}
        />
      </SwitchPrimitive.Root>
    </div>
  );
}

export function LayoutMetabox({
  layoutId = "",
  hideHeader = false,
  hideFooter = false,
  onLayoutChange,
  onHideHeaderChange,
  onHideFooterChange,
}: LayoutMetaboxProps) {
  const layouts = useQuery(api.layouts.queries.list);

  return (
    <div className="space-y-3">
      {/* Layout override */}
      <div className="space-y-1">
        <Label className="text-xs font-medium">Layout</Label>
        <select
          value={layoutId}
          onChange={(e) => onLayoutChange(e.target.value)}
          className="w-full h-7 rounded-none border border-border bg-transparent px-2 text-xs"
          aria-label="Layout override"
        >
          <option value="">Use default</option>
          {layouts?.map((layout) => (
            <option key={layout._id} value={layout._id}>
              {layout.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Override the default layout for this content.
        </p>
      </div>

      {/* Hide header toggle */}
      <ToggleRow
        id="layout-hide-header"
        label="Hide Header"
        checked={hideHeader}
        onChange={onHideHeaderChange}
      />

      {/* Hide footer toggle */}
      <ToggleRow
        id="layout-hide-footer"
        label="Hide Footer"
        checked={hideFooter}
        onChange={onHideFooterChange}
      />
    </div>
  );
}
