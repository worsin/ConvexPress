/**
 * Customer dashboard admin — small controlled field primitives.
 *
 * Thin Atelier-styled wrappers over Base UI (switch, select) used by the
 * settings page, the layout editor's inspector, and the menu item editor.
 * Everything is controlled; no form library.
 */

import type { ReactNode } from "react";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ─── Switch ─────────────────────────────────────────────────────────────────

interface SwitchControlProps {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  "aria-label"?: string;
  size?: "sm" | "md";
}

export function SwitchControl({ id, checked, onCheckedChange, disabled, size = "md", ...aria }: SwitchControlProps) {
  return (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={aria["aria-label"]}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        size === "md" ? "h-5 w-9" : "h-4 w-7",
        checked ? "bg-primary" : "bg-line-strong",
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block rounded-full bg-card shadow-soft transition-transform",
          size === "md" ? "size-3.5" : "size-2.5",
          checked ? (size === "md" ? "translate-x-4" : "translate-x-3") : "translate-x-0.5",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

interface ToggleRowProps {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function ToggleRow({ id, label, description, checked, onCheckedChange, disabled }: ToggleRowProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4 py-2", disabled && "opacity-60")}>
      <label htmlFor={id} className="min-w-0 cursor-pointer select-none">
        <span className="block text-[13px] font-medium text-foreground">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}
      </label>
      <SwitchControl id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

// ─── Field row ──────────────────────────────────────────────────────────────

interface FieldRowProps {
  label: string;
  htmlFor?: string;
  description?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}

export function FieldRow({ label, htmlFor, description, error, children, className }: FieldRowProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-[13px]">
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

// ─── Select ─────────────────────────────────────────────────────────────────

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
  icon?: ReactNode;
}

export interface SelectOptionGroup<T extends string = string> {
  label: string;
  options: SelectOption<T>[];
}

interface SelectControlProps<T extends string> {
  id?: string;
  value: T;
  onValueChange: (value: T) => void;
  options: Array<SelectOption<T>> | Array<SelectOptionGroup<T>>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "default";
  "aria-label"?: string;
}

function isGrouped<T extends string>(
  options: Array<SelectOption<T>> | Array<SelectOptionGroup<T>>,
): options is Array<SelectOptionGroup<T>> {
  return options.length > 0 && "options" in (options[0] as object);
}

export function SelectControl<T extends string>({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
  size = "default",
  ...aria
}: SelectControlProps<T>) {
  const flat = isGrouped(options) ? options.flatMap((group) => group.options) : options;
  const labelFor = (current: unknown) => flat.find((option) => option.value === current)?.label ?? placeholder ?? "";
  const renderItem = (option: SelectOption<T>) => (
    <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
      {option.icon}
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{option.label}</span>
        {option.description && (
          <span className="truncate text-xs text-muted-foreground">{option.description}</span>
        )}
      </span>
    </SelectItem>
  );
  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as T)} disabled={disabled}>
      <SelectTrigger id={id} size={size} className={cn("w-full", className)} aria-label={aria["aria-label"]}>
        <SelectValue placeholder={placeholder}>{(current: unknown) => labelFor(current)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {isGrouped(options)
          ? options.map((group) => (
              <SelectGroup key={group.label}>
                <SelectLabel>{group.label}</SelectLabel>
                {group.options.map(renderItem)}
              </SelectGroup>
            ))
          : options.map(renderItem)}
      </SelectContent>
    </Select>
  );
}

// ─── Segmented ──────────────────────────────────────────────────────────────

interface SegmentedControlProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: Array<{ value: T; label: string; icon?: ReactNode }>;
  "aria-label": string;
  className?: string;
}

export function SegmentedControl<T extends string>({ value, onValueChange, options, className, ...aria }: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={aria["aria-label"]}
      className={cn("inline-flex h-9 items-center gap-0.5 rounded-lg border border-line-strong bg-surface-2 p-0.5", className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "inline-flex h-full items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/50",
              active ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
