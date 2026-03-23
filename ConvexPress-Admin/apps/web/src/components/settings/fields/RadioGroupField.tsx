/**
 * RadioGroupField - Radio button group for selecting one option.
 *
 * Used for: date format, time format, homepage display, permalink structure,
 * feed content display, avatar rating, default avatar.
 *
 * Uses @base-ui/react/radio-group and @base-ui/react/radio for proper
 * accessibility:
 * - WAI-ARIA radio group pattern
 * - Arrow key navigation between options
 * - Automatic focus management
 *
 * Supports:
 * - Vertical and horizontal layouts
 * - Preview text next to each option
 * - Custom input option (e.g., custom date format)
 * - Description text per option
 */

import type { AnyFieldApi } from "@tanstack/react-form";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Radio } from "@base-ui/react/radio";

import type { FieldOption } from "@/types/settings";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface RadioGroupFieldProps {
  /** TanStack Form field API */
  field: AnyFieldApi;
  /** Options to display */
  options: FieldOption[];
  /** Layout direction */
  direction?: "vertical" | "horizontal";
  /** Whether to show a custom input for a specific option value */
  customOption?: {
    value: string;
    inputPlaceholder?: string;
    inputField: AnyFieldApi;
  };
  /** Disabled state */
  disabled?: boolean;
}

export function RadioGroupField({
  field,
  options,
  direction = "vertical",
  customOption,
  disabled = false,
}: RadioGroupFieldProps) {
  const value = (field.state.value as string) ?? "";

  return (
    <RadioGroup
      value={value}
      onValueChange={(newValue) => field.handleChange(newValue)}
      disabled={disabled}
      name={field.name}
      aria-label={field.name}
      className={cn(
        "flex gap-2",
        direction === "vertical" ? "flex-col" : "flex-row flex-wrap",
      )}
    >
      {options.map((opt) => {
        const isSelected = value === opt.value;
        const isCustom = customOption && opt.value === customOption.value;

        return (
          <label
            key={opt.value}
            className={cn(
              "flex items-start gap-2.5 cursor-pointer text-xs",
              opt.disabled && "opacity-50 pointer-events-none",
            )}
          >
            {/* Base UI Radio */}
            <span className="mt-0.5 flex shrink-0">
              <Radio.Root
                value={opt.value}
                disabled={opt.disabled}
                className={cn(
                  "size-4 rounded-full border-2 border-input flex items-center justify-center transition-colors outline-hidden",
                  "focus-visible:ring-1 focus-visible:ring-ring/50 focus-visible:border-ring",
                  isSelected && "border-primary",
                )}
              >
                <Radio.Indicator
                  className="size-2 rounded-full bg-primary"
                />
              </Radio.Root>
            </span>

            {/* Label and extras */}
            <div className="flex flex-1 items-start gap-2 min-w-0">
              <div className="flex-1 min-w-0">
                <span className="text-foreground">{opt.label}</span>
                {opt.description && (
                  <p className="text-muted-foreground text-xs mt-0.5">
                    {opt.description}
                  </p>
                )}

                {/* Custom input (shown inline when this is the custom option) */}
                {isCustom && (
                  <div className="mt-1.5">
                    <Input
                      value={
                        (customOption.inputField.state.value as string) ?? ""
                      }
                      onChange={(e) =>
                        customOption.inputField.handleChange(e.target.value)
                      }
                      onBlur={customOption.inputField.handleBlur}
                      onFocus={() => {
                        // Auto-select the custom radio when input is focused
                        if (!isSelected) {
                          field.handleChange(opt.value);
                        }
                      }}
                      placeholder={customOption.inputPlaceholder}
                      disabled={disabled}
                      className="max-w-xs"
                    />
                  </div>
                )}
              </div>

              {/* Preview text */}
              {opt.preview && (
                <span className="text-muted-foreground whitespace-nowrap shrink-0">
                  {opt.preview}
                </span>
              )}
            </div>
          </label>
        );
      })}
    </RadioGroup>
  );
}
