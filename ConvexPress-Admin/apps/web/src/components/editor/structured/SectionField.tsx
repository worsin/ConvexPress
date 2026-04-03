/**
 * SectionField - Reusable labeled field with optional AI regenerate button
 *
 * Wraps an input/textarea with a label and optional per-field regenerate button.
 */

import { RegenerateButton } from "./RegenerateButton";

interface SectionFieldProps {
  label: string;
  children: React.ReactNode;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}

export function SectionField({
  label,
  children,
  onRegenerate,
  isRegenerating,
}: SectionFieldProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">
          {label}
        </label>
        {onRegenerate && (
          <RegenerateButton
            onClick={onRegenerate}
            isLoading={isRegenerating}
            label="Regenerate"
          />
        )}
      </div>
      {children}
    </div>
  );
}
