/**
 * ToggleField - Toggle switch for on/off boolean values.
 *
 * Alternative to CheckboxField for settings where the on/off state
 * is more prominent (e.g., "Show Avatars").
 * Integrates with TanStack Form field API.
 *
 * Uses @base-ui/react/switch for proper accessibility:
 * - Built-in role="switch" semantics
 * - Keyboard support (Space to toggle)
 * - ARIA attributes managed automatically
 */

import type { AnyFieldApi } from "@tanstack/react-form";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/lib/utils";

interface ToggleFieldProps {
  /** TanStack Form field API */
  field: AnyFieldApi;
  /** Label text */
  label: string;
  /** Optional description */
  description?: string;
  /** Disabled state */
  disabled?: boolean;
}

export function ToggleField({
  field,
  label,
  description,
  disabled = false,
}: ToggleFieldProps) {
  const checked = (field.state.value as boolean) ?? false;

  return (
    <div
      className={cn(
        "flex items-start gap-3",
        disabled && "opacity-50 pointer-events-none",
      )}
    >
      {/* Base UI Switch */}
      <SwitchPrimitive.Root
        checked={checked}
        onCheckedChange={(newChecked) => field.handleChange(newChecked)}
        disabled={disabled}
        name={field.name}
        id={field.name}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-primary" : "bg-input",
        )}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            "pointer-events-none block size-3.5 rounded-full shadow-sm transition-transform",
            checked
              ? "translate-x-4 bg-primary-foreground"
              : "translate-x-0.5 bg-foreground/70",
          )}
        />
      </SwitchPrimitive.Root>

      {/* Label and description */}
      <label htmlFor={field.name} className="select-none cursor-pointer">
        <span className="text-xs text-foreground">{label}</span>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {description}
          </p>
        )}
      </label>
    </div>
  );
}
