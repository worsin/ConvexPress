/**
 * SelectField - Dropdown select for choosing from a predefined list.
 *
 * Used for: default role, comment order, week starts on, feed content, etc.
 * Integrates with TanStack Form field API.
 *
 * Uses @base-ui/react/select for proper accessibility:
 * - Keyboard navigation (arrow keys, type-to-search, Enter, Escape)
 * - ARIA listbox pattern
 * - Positioned popover with scroll arrows
 */

import type { AnyFieldApi } from "@tanstack/react-form";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { ChevronDown, Check } from "lucide-react";

import type { FieldOption } from "@/types/settings";
import { cn } from "@/lib/utils";

interface SelectFieldProps {
  /** TanStack Form field API */
  field: AnyFieldApi;
  /** Options to display */
  options: FieldOption[];
  /** Placeholder text when no option selected */
  placeholder?: string;
  /** Disabled state */
  disabled?: boolean;
}

export function SelectField({
  field,
  options,
  placeholder,
  disabled = false,
}: SelectFieldProps) {
  const value = (field.state.value as string) ?? "";
  const hasError = field.state.meta.errors.length > 0;

  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={(newValue) => {
        field.handleChange(newValue);
      }}
      disabled={disabled}
      name={field.name}
    >
      <SelectPrimitive.Trigger
        id={field.name}
        aria-invalid={hasError || undefined}
        onBlur={field.handleBlur}
        className={cn(
          "dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 disabled:bg-input/50 dark:disabled:bg-input/80 h-8 rounded-none border bg-transparent px-2.5 py-1 text-xs transition-colors focus-visible:ring-1 aria-invalid:ring-1 w-full min-w-0 outline-hidden disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-between gap-1",
        )}
      >
        <SelectPrimitive.Value
          placeholder={placeholder ?? "Select..."}
          className="truncate text-left flex-1"
        />
        <SelectPrimitive.Icon
          render={
            <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
          }
        />
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          side="bottom"
          sideOffset={4}
          align="start"
          className="z-50"
        >
          <SelectPrimitive.Popup
            className="bg-popover text-popover-foreground border border-border rounded-none shadow-md max-h-60 overflow-y-auto min-w-[var(--anchor-width)] origin-[var(--transform-origin)] data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 p-1"
          >
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                disabled={opt.disabled}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 text-xs rounded-none cursor-default outline-hidden select-none",
                  "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
                  "data-disabled:pointer-events-none data-disabled:opacity-50",
                )}
              >
                <SelectPrimitive.ItemIndicator
                  render={<span className="flex size-3.5 items-center justify-center shrink-0" />}
                >
                  <Check className="size-3" />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText className="truncate">
                  {opt.label}
                </SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
