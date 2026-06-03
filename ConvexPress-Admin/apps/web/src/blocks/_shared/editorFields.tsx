import { Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

export function TextField({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  type?: "text" | "email" | "url" | "tel";
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="h-9 border border-border bg-background px-2.5 text-sm text-foreground outline-hidden transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  disabled,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
        disabled={disabled}
        className="h-9 border border-border bg-background px-2.5 text-sm text-foreground outline-hidden transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

export function TextareaField({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        rows={rows}
        className="border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-hidden transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

export function SelectField<TValue extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: TValue;
  options: Array<[TValue, string]>;
  onChange: (value: TValue) => void;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as TValue)}
        disabled={disabled}
        className="h-9 border border-border bg-background px-2.5 text-sm text-foreground outline-hidden transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CheckboxField({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        className="size-4 border border-border bg-background"
      />
      {label}
    </label>
  );
}

export function RepeaterHeader({
  label,
  onAdd,
  disabled,
}: {
  label: string;
  onAdd: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <button
        type="button"
        onClick={onAdd}
        disabled={disabled}
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Plus className="size-3" />
        Add
      </button>
    </div>
  );
}

export function RepeaterItem({
  children,
  onRemove,
  disabled,
  removeLabel = "Remove item",
}: {
  children: ReactNode;
  onRemove: () => void;
  disabled?: boolean;
  removeLabel?: string;
}) {
  return (
    <div className="grid gap-3 border border-border bg-card p-3">
      {children}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="inline-flex items-center gap-1 text-xs font-medium text-destructive hover:underline disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Trash2 className="size-3" />
          {removeLabel}
        </button>
      </div>
    </div>
  );
}
