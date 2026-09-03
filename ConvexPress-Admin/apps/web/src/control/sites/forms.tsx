/**
 * Small form building blocks shared by every Sites dialog: labelled inputs,
 * textareas, native selects (keyboard and screen-reader friendly), inline
 * hints and errors, and a status banner.
 */

import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useId, type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  optional?: boolean;
  className?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}

export function Field({ label, hint, optional, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-[12.5px] text-ink-2">
        {label}
        {optional && <span className="font-normal text-muted-foreground">(optional)</span>}
      </Label>
      {children(id, hintId)}
      {hint && (
        <p id={hintId} className="text-[12px] leading-5 text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

interface TextFieldProps {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  placeholder?: string;
  required?: boolean;
  optional?: boolean;
  autoFocus?: boolean;
  mono?: boolean;
  type?: string;
  autoComplete?: string;
  className?: string;
  disabled?: boolean;
}

export function TextField({
  label,
  value,
  onChange,
  hint,
  placeholder,
  required,
  optional,
  autoFocus,
  mono,
  type = "text",
  autoComplete,
  className,
  disabled,
}: TextFieldProps) {
  return (
    <Field label={label} hint={hint} optional={optional} className={className}>
      {(id, describedBy) => (
        <Input
          id={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required={required}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-describedby={describedBy}
          className={cn("h-10", mono && "font-mono text-[13px]")}
        />
      )}
    </Field>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  hint,
  placeholder,
  optional,
  rows = 3,
  className,
}: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  placeholder?: string;
  optional?: boolean;
  rows?: number;
  className?: string;
}) {
  return (
    <Field label={label} hint={hint} optional={optional} className={className}>
      {(id, describedBy) => (
        <Textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={rows}
          aria-describedby={describedBy}
          className="min-h-20 text-[13.5px]"
        />
      )}
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
  className,
  disabled,
}: {
  label: ReactNode;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  hint?: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Field label={label} hint={hint} className={className}>
      {(id, describedBy) => (
        <div className="relative">
          <select
            id={id}
            value={value}
            disabled={disabled}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.value as T)}
            className="h-10 w-full appearance-none rounded-lg border border-input bg-card px-3 pr-9 text-[13.5px] text-foreground outline-hidden transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      )}
    </Field>
  );
}

export function CheckField({
  label,
  checked,
  onChange,
  hint,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 text-[13.5px]">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 accent-[var(--primary)]"
      />
      <span>
        <span className="font-medium text-foreground">{label}</span>
        {hint && <span className="block text-[12px] text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

export type NoticeTone = "success" | "error" | "info" | "pending";

export function Notice({
  tone,
  children,
  className,
  role,
}: {
  tone: NoticeTone;
  children: ReactNode;
  className?: string;
  role?: string;
}) {
  const styles: Record<NoticeTone, string> = {
    success: "border-success/40 bg-success-soft text-success",
    error: "border-destructive/30 bg-live-soft text-destructive",
    info: "border-border bg-surface-2 text-ink-2",
    pending: "border-border bg-surface-2 text-ink-2",
  };
  const Icon =
    tone === "success"
      ? CheckCircle2
      : tone === "error"
        ? AlertTriangle
        : tone === "pending"
          ? Loader2
          : null;
  return (
    <p
      role={role ?? (tone === "error" ? "alert" : "status")}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13px] leading-5",
        styles[tone],
        className,
      )}
    >
      {Icon && (
        <Icon
          aria-hidden="true"
          className={cn("mt-0.5 size-4 shrink-0", tone === "pending" && "animate-spin")}
        />
      )}
      <span className="min-w-0 flex-1">{children}</span>
    </p>
  );
}

/** Typed confirmation phrase input used by destructive actions. */
export function ConfirmationField({
  phrase,
  value,
  onChange,
  ariaLabel,
}: {
  phrase: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[13px] text-ink-2">
        Type <code className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] font-semibold text-foreground">{phrase}</code> to confirm.
      </p>
      <Input
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        spellCheck={false}
        className="h-10 font-mono text-[13px]"
      />
    </div>
  );
}
