/**
 * TextareaField - Multi-line text input for large text values.
 *
 * Used for: moderation word list, disallowed word list, etc.
 * Integrates with TanStack Form field API.
 */

import { cn } from "@/lib/utils";
import type { SettingsFieldApi } from "./types";

interface TextareaFieldProps {
  /** TanStack Form field API */
  field: SettingsFieldApi;
  /** Placeholder text */
  placeholder?: string;
  /** Number of visible rows */
  rows?: number;
  /** Maximum character length */
  maxLength?: number;
  /** Whether to show character count */
  showCharCount?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Resize behavior */
  resize?: "none" | "vertical" | "both";
}

export function TextareaField({
  field,
  placeholder,
  rows = 4,
  maxLength,
  showCharCount = false,
  disabled = false,
  resize = "vertical",
}: TextareaFieldProps) {
  const value = (field.state.value as string) ?? "";
  const hasError = field.state.meta.errors.length > 0;
  const charCount = value.length;

  const resizeClass = {
    none: "resize-none",
    vertical: "resize-y",
    both: "resize",
  }[resize];

  return (
    <div>
      <textarea
        id={field.name}
        name={field.name}
        value={value}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        rows={rows}
        aria-invalid={hasError || undefined}
        aria-describedby={
          [
            hasError ? `${field.name}-error` : null,
            `${field.name}-description`,
          ]
            .filter(Boolean)
            .join(" ") || undefined
        }
        className={cn(
          "dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 disabled:bg-input/50 dark:disabled:bg-input/80 rounded-none border bg-transparent px-2.5 py-2 text-xs transition-colors focus-visible:ring-1 aria-invalid:ring-1 placeholder:text-muted-foreground w-full min-w-0 outline-hidden disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          resizeClass,
        )}
      />
      {showCharCount && maxLength && (
        <p
          className={cn(
            "mt-1 text-xs",
            charCount > maxLength * 0.9
              ? "text-destructive"
              : "text-muted-foreground",
          )}
        >
          {charCount.toLocaleString()} / {maxLength.toLocaleString()}
        </p>
      )}
    </div>
  );
}
