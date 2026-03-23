/**
 * NumberField - Numeric input with optional min/max constraints.
 *
 * Used for: posts per page, feed item count, auto-close days,
 * thread depth, comments per page, hold if links exceed, etc.
 * Integrates with TanStack Form field API.
 *
 * Uses @base-ui/react/number-field for proper accessibility:
 * - Increment/decrement buttons
 * - Keyboard support (Arrow Up/Down)
 * - Min/max constraint enforcement
 * - Step snapping
 */

import type { AnyFieldApi } from "@tanstack/react-form";
import { NumberField as NumberFieldPrimitive } from "@base-ui/react/number-field";
import { ChevronUp, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

interface NumberFieldProps {
  /** TanStack Form field API */
  field: AnyFieldApi;
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
  /** Step increment */
  step?: number;
  /** Disabled state */
  disabled?: boolean;
  /** Width (narrow for inline use) */
  width?: "narrow" | "default";
}

export function NumberField({
  field,
  min,
  max,
  step = 1,
  disabled = false,
  width = "default",
}: NumberFieldProps) {
  const value = (field.state.value as number) ?? 0;
  const hasError = field.state.meta.errors.length > 0;

  return (
    <NumberFieldPrimitive.Root
      value={value}
      onValueChange={(val) => {
        field.handleChange(val ?? 0);
      }}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      id={field.name}
      name={field.name}
      className={cn(
        "flex",
        width === "narrow" ? "w-20" : "w-full",
      )}
    >
      <NumberFieldPrimitive.Group
        className={cn(
          "flex items-center",
          width === "narrow" ? "w-20" : "w-full",
        )}
      >
        <NumberFieldPrimitive.Input
          onBlur={field.handleBlur}
          aria-invalid={hasError || undefined}
          className={cn(
            "dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 disabled:bg-input/50 dark:disabled:bg-input/80 h-8 rounded-none border bg-transparent px-2.5 py-1 text-xs transition-colors focus-visible:ring-1 aria-invalid:ring-1 min-w-0 outline-hidden disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 flex-1",
            "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
          )}
        />
        <div className="flex flex-col -ml-px">
          <NumberFieldPrimitive.Increment
            className="flex items-center justify-center h-4 w-5 border border-input bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            <ChevronUp className="size-3" />
          </NumberFieldPrimitive.Increment>
          <NumberFieldPrimitive.Decrement
            className="flex items-center justify-center h-4 w-5 border border-t-0 border-input bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            <ChevronDown className="size-3" />
          </NumberFieldPrimitive.Decrement>
        </div>
      </NumberFieldPrimitive.Group>
    </NumberFieldPrimitive.Root>
  );
}
