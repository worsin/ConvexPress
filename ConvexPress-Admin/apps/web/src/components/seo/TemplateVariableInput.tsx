/**
 * TemplateVariableInput - Text input with template variable tag buttons and live preview.
 *
 * Shows insertable %%variable%% tags below the input.
 */

import { useRef } from "react";
import { Input } from "@/components/ui/input";
import { TEMPLATE_VARIABLES } from "@/lib/seo/constants";

interface TemplateVariableInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  preview?: string;
  maxLength?: number;
}

export function TemplateVariableInput({
  value,
  onChange,
  placeholder,
  preview,
  maxLength,
}: TemplateVariableInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const insertVariable = (variable: string) => {
    const input = inputRef.current;
    if (!input) {
      onChange(value + variable);
      return;
    }

    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? value.length;
    const newValue = value.substring(0, start) + variable + value.substring(end);
    onChange(newValue);

    // Restore cursor position after the inserted variable
    requestAnimationFrame(() => {
      const newCursorPos = start + variable.length;
      input.setSelectionRange(newCursorPos, newCursorPos);
      input.focus();
    });
  };

  return (
    <div className="space-y-1.5">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="h-7 text-xs font-mono"
      />

      {/* Variable tag buttons */}
      <div className="flex flex-wrap gap-1">
        {TEMPLATE_VARIABLES.slice(0, 8).map((tv) => (
          <button
            key={tv.variable}
            type="button"
            onClick={() => insertVariable(tv.variable)}
            className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono bg-muted border border-border hover:bg-accent transition-colors"
            title={tv.description}
          >
            {tv.label}
          </button>
        ))}
      </div>

      {/* Live preview */}
      {preview && (
        <div className="px-2 py-1 bg-muted/50 border border-border">
          <p className="text-[10px] text-muted-foreground mb-0.5">Preview:</p>
          <p className="text-xs text-foreground">{preview}</p>
        </div>
      )}
    </div>
  );
}
