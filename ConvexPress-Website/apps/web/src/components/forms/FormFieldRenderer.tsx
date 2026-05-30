/**
 * Public Forms — lean field renderer (Phase 1).
 *
 * Renders a single form field from its definition + current string value, and
 * reports edits back via `onChange(value: string)`. Values are always strings
 * because the backend stores every answer as a string (`fieldValues.value`).
 *
 * VALUE ENCODING (must match the Admin `customFieldValidation` contract so the
 * server-side validation in `forms.mutations.submit` accepts what we send):
 *   - text / textarea / email / url / number / date_picker → plain string
 *     (number = numeric string, date_picker = "YYYY-MM-DD")
 *   - select (single)        → the chosen choice `value` (plain string)
 *   - select (multiple)      → JSON array string of chosen `value`s
 *   - radio                  → the chosen choice `value` (plain string)
 *   - checkbox               → JSON array string of chosen `value`s
 *   - true_false             → "1" (checked) or "0" (unchecked)
 *
 * Choice-based fields read `settings.choices: Array<{ value, label }>` exactly
 * like the Admin field components.
 *
 * Anything we don't explicitly handle (compound/advanced types like repeater,
 * group, image, wysiwyg, …) degrades to a basic text input (when it plausibly
 * holds a scalar) or a clear "unsupported field" note — it never crashes.
 *
 * SSR-safe: no `window`/`document` access at module load or render.
 */

import { useMemo } from "react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { formatNumber, type NumberFormat } from "@/lib/forms/calc";
import {
  LAYOUT_VALUELESS_TYPES,
  inputKindForFieldType,
  parseMultiValue,
} from "@/lib/forms/render/fieldRender";

export interface PublicFormField {
  _id: string;
  label: string;
  name: string;
  key: string;
  type: string;
  instructions?: string | null;
  required?: boolean;
  defaultValue?: string | null;
  settings: string;
  conditionalLogic?: string | null;
  parentFieldId?: string | null;
  menuOrder?: number;
}

interface Choice {
  value: string;
  label: string;
}

interface FieldSettings {
  choices?: Choice[];
  multiple?: boolean;
  placeholder?: string;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  rows?: number;
  message?: string;
  layout?: "vertical" | "horizontal";
  // Form Calculation & Pricing settings (computed field types).
  numberFormat?: NumberFormat;
  quantityFieldKey?: string;
  unitPrice?: number;
  priceKind?: "none" | "oneTime" | "recurring";
  interval?: "month" | "year";
  recurringLabel?: string;
}

export interface FormFieldRendererProps {
  field: PublicFormField;
  value: string;
  onChange: (value: string) => void;
  /** Surfaced when client-side required validation has flagged this field. */
  invalid?: boolean;
  /** Stable DOM id for label association. */
  inputId: string;
}

/** Parse a field's `settings` JSON, tolerating malformed/empty blobs. */
function useFieldSettings(settings: string): FieldSettings {
  return useMemo<FieldSettings>(() => {
    try {
      const parsed = JSON.parse(settings);
      return parsed && typeof parsed === "object" ? (parsed as FieldSettings) : {};
    } catch {
      return {};
    }
  }, [settings]);
}

const baseControlClass =
  "w-full rounded-4xl border border-input bg-input/30 px-3 py-2 text-sm text-foreground outline-hidden transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Field types that carry no submittable value (layout-only / security). Sourced
 * from the shared renderer module so this stays the SINGLE list mirrored against
 * the backend `LAYOUT_FIELD_TYPES`. Includes the security types `captcha` +
 * `honeypot` (they render nothing here and must never be submitted).
 *
 * `page_break` (Form Multi-Step System) is a layout/no-value type too: it is a
 * wizard step boundary whose `label` is consumed by the FormWizard as the next
 * step's TITLE, not shown inline as field copy. It therefore renders nothing in
 * the field flow (see the page_break short-circuit below). On a single-page
 * render (no wizard) it is simply invisible — harmless.
 */
const LAYOUT_TYPES = LAYOUT_VALUELESS_TYPES;

export function FormFieldRenderer({
  field,
  value,
  onChange,
  invalid,
  inputId,
}: FormFieldRendererProps) {
  const settings = useFieldSettings(field.settings);
  const describedById = field.instructions ? `${inputId}-desc` : undefined;

  const labelNode = (
    <FieldLabel htmlFor={inputId} label={field.label} required={field.required} />
  );

  const instructionsNode = field.instructions ? (
    <p id={describedById} className="text-xs text-muted-foreground">
      {field.instructions}
    </p>
  ) : null;

  // ── Value-less markers that render NOTHING in the field flow:
  //   • `page_break` — a wizard step boundary; its `label` is consumed by the
  //     FormWizard as the next step's title, never shown inline.
  //   • `captcha` / `honeypot` (Form Spam System) — owned by a dedicated spam
  //     layer, not this lean renderer. A honeypot in particular MUST stay
  //     invisible (a visible labeled box would defeat the trap and confuse
  //     humans), and neither carries a submittable value.
  if (
    field.type === "page_break" ||
    field.type === "captcha" ||
    field.type === "honeypot"
  ) {
    return null;
  }

  // ── Layout-only fields: render their message, no input ──────────────────────
  if (LAYOUT_TYPES.has(field.type)) {
    return (
      <div data-slot="form-field" data-field-type={field.type} className="flex flex-col gap-1.5">
        {field.label ? (
          <p className="text-sm font-medium text-foreground">{field.label}</p>
        ) : null}
        {(settings.message || field.instructions) && (
          <p className="text-xs text-muted-foreground">
            {settings.message ?? field.instructions}
          </p>
        )}
      </div>
    );
  }

  const control = renderControl();

  return (
    <div
      data-slot="form-field"
      data-field-type={field.type}
      className="flex flex-col gap-1.5"
    >
      {field.type === "true_false" ? null : labelNode}
      {control}
      {instructionsNode}
    </div>
  );

  function renderControl() {
    const aria = {
      "aria-invalid": invalid || undefined,
      "aria-describedby": describedById,
      "aria-required": field.required || undefined,
    } as const;

    switch (field.type) {
      case "textarea":
        return (
          <Textarea
            id={inputId}
            value={value}
            rows={settings.rows ?? 4}
            placeholder={settings.placeholder}
            onChange={(e) => onChange(e.target.value)}
            {...aria}
          />
        );

      case "email":
        return (
          <Input
            id={inputId}
            type="email"
            value={value}
            placeholder={settings.placeholder}
            onChange={(e) => onChange(e.target.value)}
            {...aria}
          />
        );

      case "url":
        return (
          <Input
            id={inputId}
            type="url"
            value={value}
            placeholder={settings.placeholder}
            onChange={(e) => onChange(e.target.value)}
            {...aria}
          />
        );

      case "number":
        return (
          <Input
            id={inputId}
            type="number"
            value={value}
            placeholder={settings.placeholder}
            min={settings.min as number | undefined}
            max={settings.max as number | undefined}
            step={settings.step as number | undefined}
            onChange={(e) => onChange(e.target.value)}
            {...aria}
          />
        );

      case "date_picker":
        return (
          <Input
            id={inputId}
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            {...aria}
          />
        );

      case "select":
        return (
          <SelectControl
            inputId={inputId}
            settings={settings}
            value={value}
            onChange={onChange}
            invalid={invalid}
            describedById={describedById}
            required={field.required}
          />
        );

      case "radio":
        return (
          <RadioControl
            name={inputId}
            settings={settings}
            value={value}
            onChange={onChange}
            describedById={describedById}
          />
        );

      case "checkbox":
        return (
          <CheckboxGroupControl
            name={inputId}
            settings={settings}
            value={value}
            onChange={onChange}
            describedById={describedById}
          />
        );

      case "true_false":
        return (
          <TrueFalseControl
            inputId={inputId}
            label={field.label}
            value={value}
            onChange={onChange}
            describedById={describedById}
            required={field.required}
            invalid={invalid}
          />
        );

      case "text":
        return (
          <Input
            id={inputId}
            type="text"
            value={value}
            placeholder={settings.placeholder}
            onChange={(e) => onChange(e.target.value)}
            {...aria}
          />
        );

      case "calculation":
        // Read-only computed display (Form Calculation & Pricing System). The
        // value is the live-recomputed number fed by FormRenderer; never an input.
        return (
          <CalculationDisplay value={value} settings={settings} inputId={inputId} />
        );

      case "product":
        // Priced line: editable quantity (only when not field-driven) + a
        // read-only derived line total. The server re-derives the price at submit.
        return (
          <ProductControl
            value={value}
            settings={settings}
            inputId={inputId}
            label={field.label}
            onChange={onChange}
          />
        );

      default:
        // Known-scalar fallbacks render a plain text input; everything else
        // (repeater/group/image/etc.) gets a clear note instead of crashing.
        // The text-fallback vs unsupported decision is owned by the shared
        // renderer module so it stays in lockstep with the unit tests.
        if (inputKindForFieldType(field.type, settings.multiple) === "text-fallback") {
          return (
            <Input
              id={inputId}
              type="text"
              value={value}
              placeholder={settings.placeholder}
              onChange={(e) => onChange(e.target.value)}
              {...aria}
            />
          );
        }
        return (
          <div
            id={inputId}
            className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
          >
            This field type ({field.type}) isn&apos;t supported on this form yet.
          </div>
        );
    }
  }
}

// ─── Sub-controls ─────────────────────────────────────────────────────────────

function FieldLabel({
  htmlFor,
  label,
  required,
}: {
  htmlFor: string;
  label: string;
  required?: boolean;
}) {
  if (!label) return null;
  return (
    <Label htmlFor={htmlFor}>
      {label}
      {required ? (
        <span className="text-destructive" aria-hidden="true">
          {" "}
          *
        </span>
      ) : null}
    </Label>
  );
}

function SelectControl({
  inputId,
  settings,
  value,
  onChange,
  invalid,
  describedById,
  required,
}: {
  inputId: string;
  settings: FieldSettings;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedById?: string;
  required?: boolean;
}) {
  const choices = settings.choices ?? [];

  // Multi-select degrades to a checkbox-style group so we can write the JSON
  // array the validator expects without pulling in a custom multiselect widget.
  if (settings.multiple) {
    return (
      <CheckboxGroupControl
        name={inputId}
        settings={settings}
        value={value}
        onChange={onChange}
        describedById={describedById}
      />
    );
  }

  return (
    <select
      id={inputId}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={invalid || undefined}
      aria-describedby={describedById}
      aria-required={required || undefined}
      className={cn(baseControlClass, "appearance-none")}
    >
      <option value="">Select…</option>
      {choices.map((choice) => (
        <option key={choice.value} value={choice.value}>
          {choice.label}
        </option>
      ))}
    </select>
  );
}

function RadioControl({
  name,
  settings,
  value,
  onChange,
  describedById,
}: {
  name: string;
  settings: FieldSettings;
  value: string;
  onChange: (value: string) => void;
  describedById?: string;
}) {
  const choices = settings.choices ?? [];
  const horizontal = settings.layout === "horizontal";

  return (
    <div
      role="radiogroup"
      aria-describedby={describedById}
      className={cn("flex gap-2", horizontal ? "flex-row flex-wrap" : "flex-col")}
    >
      {choices.map((choice) => (
        <label
          key={choice.value}
          className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
        >
          <input
            type="radio"
            name={name}
            value={choice.value}
            checked={value === choice.value}
            onChange={() => onChange(choice.value)}
            className="size-4 accent-primary"
          />
          <span>{choice.label}</span>
        </label>
      ))}
    </div>
  );
}

function CheckboxGroupControl({
  name,
  settings,
  value,
  onChange,
  describedById,
}: {
  name: string;
  settings: FieldSettings;
  value: string;
  onChange: (value: string) => void;
  describedById?: string;
}) {
  const choices = settings.choices ?? [];
  const horizontal = settings.layout === "horizontal";

  const selected = useMemo<string[]>(() => parseMultiValue(value), [value]);

  const toggle = (choiceValue: string) => {
    const next = selected.includes(choiceValue)
      ? selected.filter((v) => v !== choiceValue)
      : [...selected, choiceValue];
    onChange(JSON.stringify(next));
  };

  return (
    <div
      role="group"
      aria-describedby={describedById}
      className={cn("flex gap-2", horizontal ? "flex-row flex-wrap" : "flex-col")}
    >
      {choices.map((choice) => (
        <label
          key={choice.value}
          className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
        >
          <Checkbox
            name={name}
            checked={selected.includes(choice.value)}
            onCheckedChange={() => toggle(choice.value)}
          />
          <span>{choice.label}</span>
        </label>
      ))}
    </div>
  );
}

function TrueFalseControl({
  inputId,
  label,
  value,
  onChange,
  describedById,
  required,
  invalid,
}: {
  inputId: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  describedById?: string;
  required?: boolean;
  invalid?: boolean;
}) {
  const checked = value === "1" || value === "true";
  return (
    <label
      htmlFor={inputId}
      className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
    >
      <Checkbox
        id={inputId}
        checked={checked}
        onCheckedChange={(next) => onChange(next === true ? "1" : "0")}
        aria-describedby={describedById}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
      />
      <span>
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
      </span>
    </label>
  );
}

// ─── Computed field controls (Form Calculation & Pricing System) ───────────────

/** Read-only display of a `calculation` field's recomputed value. */
function CalculationDisplay({
  value,
  settings,
  inputId,
}: {
  value: string;
  settings: FieldSettings;
  inputId: string;
}) {
  const numeric = Number(value);
  const display = formatNumber(
    Number.isFinite(numeric) ? numeric : 0,
    settings.numberFormat,
  );
  return (
    <output
      id={inputId}
      data-slot="calculation-value"
      className="inline-flex min-w-24 items-center rounded-4xl border border-input bg-input/30 px-3 py-2 text-sm font-medium tabular-nums text-foreground"
    >
      {display}
    </output>
  );
}

/**
 * `product` line control: an editable quantity (only when not field-driven) plus
 * a read-only derived line total. On quantity edit it emits a compact
 * `{ "quantity": N }` payload — the server re-derives the price authoritatively.
 */
function ProductControl({
  value,
  settings,
  inputId,
  label,
  onChange,
}: {
  value: string;
  settings: FieldSettings;
  inputId: string;
  label: string;
  onChange: (value: string) => void;
}) {
  const line = useMemo<{
    unitPrice?: number;
    quantity?: number;
    lineTotal?: number;
  }>(() => {
    try {
      const parsed = JSON.parse(value || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      const q = Number(value);
      return Number.isFinite(q) ? { quantity: q } : {};
    }
  }, [value]);

  const quantity = typeof line.quantity === "number" ? line.quantity : 1;
  const unitPrice =
    typeof line.unitPrice === "number" ? line.unitPrice : settings.unitPrice ?? 0;
  const lineTotal =
    typeof line.lineTotal === "number" ? line.lineTotal : unitPrice * quantity;
  const userEditableQty = !settings.quantityFieldKey;

  const recurringSuffix =
    settings.priceKind === "recurring"
      ? settings.recurringLabel ?? `/${settings.interval ?? "month"}`
      : "";

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">
        {formatNumber(unitPrice, settings.numberFormat)}
      </span>
      <span className="text-muted-foreground" aria-hidden="true">
        ×
      </span>
      {userEditableQty ? (
        <Input
          id={inputId}
          type="number"
          min={0}
          step={1}
          value={quantity}
          aria-label={`${label} quantity`}
          onChange={(e) => {
            const next = Number(e.target.value);
            onChange(JSON.stringify({ quantity: next >= 0 ? next : 0 }));
          }}
          className="w-20"
        />
      ) : (
        <span className="tabular-nums text-foreground">{quantity}</span>
      )}
      <span className="text-muted-foreground" aria-hidden="true">
        =
      </span>
      <output
        data-slot="product-line-total"
        className="inline-flex items-center rounded-4xl border border-input bg-input/30 px-3 py-2 font-medium tabular-nums text-foreground"
      >
        {formatNumber(lineTotal, settings.numberFormat)}
        {recurringSuffix ? (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {recurringSuffix}
          </span>
        ) : null}
      </output>
    </div>
  );
}
