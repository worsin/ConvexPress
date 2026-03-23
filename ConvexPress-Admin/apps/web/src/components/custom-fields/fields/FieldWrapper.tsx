/**
 * FieldWrapper - Common wrapper for all field type renderers
 *
 * Handles label, instructions, and required indicator placement.
 */

import { cn } from "@/lib/utils";

interface FieldWrapperProps {
  label: string;
  instructions?: string;
  required: boolean;
  labelPlacement?: "top" | "left";
  instructionPlacement?: "label" | "field";
  children: React.ReactNode;
}

export function FieldWrapper({
  label,
  instructions,
  required,
  labelPlacement = "top",
  instructionPlacement = "label",
  children,
}: FieldWrapperProps) {
  const isLeft = labelPlacement === "left";

  return (
    <div
      className={cn("py-2", isLeft && "grid grid-cols-[140px_1fr] gap-3 items-start")}
    >
      <div className={cn(!isLeft && "mb-1")}>
        <label className="text-xs font-medium text-foreground">
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </label>
        {instructionPlacement === "label" && instructions && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {instructions}
          </p>
        )}
      </div>
      <div>
        {children}
        {instructionPlacement === "field" && instructions && (
          <p className="text-[10px] text-muted-foreground mt-1">
            {instructions}
          </p>
        )}
      </div>
    </div>
  );
}
