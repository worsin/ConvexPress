/**
 * SettingsField - Single form field wrapper.
 *
 * Handles label, description, error message, and layout.
 * Does NOT render the input itself -- that is passed as children.
 *
 * Two layout modes:
 * - "horizontal": label on the left (w-1/3), input on the right (w-2/3)
 * - "stacked": label above, input below (for checkboxes, radio groups, textareas)
 *
 * Responsive: horizontal collapses to stacked on small screens.
 */

import type * as React from "react";
import { AlertCircle } from "lucide-react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface SettingsFieldProps {
  /** Field label */
  label: string;
  /** Optional help text below the input */
  description?: string;
  /** Field name for accessibility (htmlFor) */
  htmlFor?: string;
  /** Validation error message */
  error?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Layout mode */
  layout?: "horizontal" | "stacked";
  /** Child input component */
  children: React.ReactNode;
  /** Optional suffix displayed inline after the field */
  suffix?: string;
  /** Optional live preview element */
  preview?: React.ReactNode;
}

export function SettingsField({
  label,
  description,
  htmlFor,
  error,
  required = false,
  disabled = false,
  layout = "horizontal",
  children,
  suffix,
  preview,
}: SettingsFieldProps) {
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;
  const descriptionId = htmlFor ? `${htmlFor}-description` : undefined;

  return (
    <div
      className={cn(
        "group",
        disabled && "opacity-50 pointer-events-none",
        layout === "horizontal"
          ? "flex flex-col gap-2 md:flex-row md:items-start"
          : "flex flex-col gap-1.5",
      )}
      data-disabled={disabled || undefined}
    >
      {/* Label */}
      <div
        className={cn(
          layout === "horizontal"
            ? "md:w-1/3 md:pt-1.5 shrink-0"
            : "",
        )}
      >
        <Label htmlFor={htmlFor}>
          {label}
          {required && (
            <span className="text-destructive ml-0.5" aria-hidden="true">
              *
            </span>
          )}
        </Label>
      </div>

      {/* Input area */}
      <div className={cn(layout === "horizontal" ? "md:w-2/3" : "w-full")}>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">{children}</div>
          {suffix && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {suffix}
            </span>
          )}
        </div>

        {/* Preview */}
        {preview && <div className="mt-1.5">{preview}</div>}

        {/* Description */}
        {description && (
          <p
            id={descriptionId}
            className="mt-1.5 text-xs text-muted-foreground"
          >
            {description}
          </p>
        )}

        {/* Error message */}
        {error && (
          <p
            id={errorId}
            className="mt-1.5 flex items-center gap-1 text-xs text-destructive"
            role="alert"
          >
            <AlertCircle className="size-3 shrink-0" />
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
