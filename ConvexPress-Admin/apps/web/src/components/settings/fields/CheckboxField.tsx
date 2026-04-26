/**
 * CheckboxField - Single checkbox for boolean toggle values.
 *
 * Used for: membership enabled, allow comments, require name/email,
 * search engine visibility, etc.
 * Integrates with TanStack Form field API.
 */

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { SettingsFieldApi } from "./types";

interface CheckboxFieldProps {
  /** TanStack Form field API */
  field: SettingsFieldApi;
  /** Label text displayed next to the checkbox */
  label: string;
  /** Optional description below the label */
  description?: string;
  /** Disabled state */
  disabled?: boolean;
}

export function CheckboxField({
  field,
  label,
  description,
  disabled = false,
}: CheckboxFieldProps) {
  const checked = (field.state.value as boolean) ?? false;

  return (
    <label
      className={cn(
        "flex items-start gap-2.5 cursor-pointer group/field",
        disabled && "opacity-50 pointer-events-none",
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={(newChecked: boolean) => field.handleChange(newChecked)}
        disabled={disabled}
        name={field.name}
        id={field.name}
        className="mt-0.5"
      />
      <div className="select-none">
        <span className="text-xs text-foreground">{label}</span>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {description}
          </p>
        )}
      </div>
    </label>
  );
}
