/**
 * Form pieces shared by the offer, template and coupon editors: labelled
 * fields, sections, switch rows, money in the currency's units (stored as
 * integer minor units), whole-number inputs, and slugs.
 */
import { useId, useState } from "react";
import { Lock } from "lucide-react";

import { cn } from "@/lib/utils";

export const inputClass =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-destructive";

export function Section({ title, description, children, aside }: {
  title: string;
  description?: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description ? <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, htmlFor, required, helper, error, locked, className, children }: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  helper?: string;
  error?: string;
  /** Shown with a lock and the reason the value cannot change. */
  locked?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
        {label}
        {required ? <span className="text-destructive">*</span> : null}
        {locked ? <Lock className="h-3 w-3" aria-label="Locked" /> : null}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-[11px] text-destructive" role="alert">
          {error}
        </p>
      ) : locked ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{locked}</p>
      ) : helper ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{helper}</p>
      ) : null}
    </div>
  );
}

/** A switch with a title and one line saying what it does. */
export function ToggleRow({ checked, onChange, title, description, disabled }: {
  checked: boolean;
  onChange: (next: boolean) => void;
  title: string;
  description: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background px-3 py-2.5",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-ring"
      />
      <span>
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

/** Integer minor units ⇄ "12.50"; undefined when the text is not an amount. */
export function minorToInput(amount: number | undefined): string {
  return amount === undefined ? "" : (amount / 100).toFixed(2);
}

export function inputToMinor(text: string): number | undefined {
  const normalized = text.trim().replace(/,/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return undefined;
  const [whole, fraction = ""] = normalized.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(result) ? result : undefined;
}

/** A money amount typed in the currency's units ("299.00"), held as minor units. */
export function MoneyInput({ id, value, onChange, currencyCode, disabled, invalid, placeholder }: {
  id?: string;
  value: number | undefined;
  onChange: (next: number | undefined, text: string) => void;
  currencyCode: string;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState(minorToInput(value));
  const [seenValue, setSeenValue] = useState(value);
  // Follow the value when it changes from outside (a record loading), without
  // reformatting what the operator is typing.
  if (value !== seenValue) {
    setSeenValue(value);
    if (inputToMinor(text) !== value) setText(minorToInput(value));
  }
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{currencyCode}</span>
      <input
        id={id}
        inputMode="decimal"
        value={text}
        disabled={disabled}
        aria-invalid={invalid || (text.trim() !== "" && inputToMinor(text) === undefined)}
        placeholder={placeholder ?? "0.00"}
        onChange={(event) => {
          setText(event.target.value);
          onChange(inputToMinor(event.target.value), event.target.value);
        }}
        className={cn(inputClass, "pl-12 tabular-nums")}
      />
    </div>
  );
}

/** "" ⇄ undefined; otherwise a whole number, or NaN when it is not one. */
export function wholeNumber(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

/** "Growth Plan!" → "growth-plan". */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
