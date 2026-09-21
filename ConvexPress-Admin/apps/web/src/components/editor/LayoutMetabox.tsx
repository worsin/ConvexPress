/**
 * LayoutMetabox -- Per-document header/footer controls for the active template.
 *
 * Appears in the editor sidebar alongside other metaboxes.
 */

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
  hideHeader = false,
  hideFooter = false,
  onHideHeaderChange,
  onHideFooterChange,
}: LayoutMetaboxProps) {

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Page appearance follows the active template. Adjust its defaults in Appearance → Customize.
      </p>

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
