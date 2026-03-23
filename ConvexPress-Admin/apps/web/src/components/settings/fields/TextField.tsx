/**
 * TextField - Standard text input for string values.
 *
 * Used for: site title, tagline, URLs, email addresses, base slugs, etc.
 * Integrates with TanStack Form field API.
 */

import type { AnyFieldApi } from "@tanstack/react-form";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TextFieldProps {
  /** TanStack Form field API */
  field: AnyFieldApi;
  /** Input type: text, email, url, password */
  type?: "text" | "email" | "url" | "password";
  /** Placeholder text */
  placeholder?: string;
  /** Maximum character length */
  maxLength?: number;
  /** Whether to show character count */
  showCharCount?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Auto-focus on mount */
  autoFocus?: boolean;
  /** Additional className */
  className?: string;
}

export function TextField({
  field,
  type = "text",
  placeholder,
  maxLength,
  showCharCount = false,
  disabled = false,
  autoFocus = false,
  className,
}: TextFieldProps) {
  const value = (field.state.value as string) ?? "";
  const hasError = field.state.meta.errors.length > 0;
  const charCount = value.length;

  return (
    <div>
      <Input
        id={field.name}
        name={field.name}
        type={type}
        value={value}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-invalid={hasError || undefined}
        aria-describedby={
          [
            hasError ? `${field.name}-error` : null,
            `${field.name}-description`,
          ]
            .filter(Boolean)
            .join(" ") || undefined
        }
        className={cn(className)}
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
