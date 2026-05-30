/**
 * Public Forms — RENDERER pure logic (extracted, additive).
 *
 * This module holds the cleanly-separable PURE helpers the Forms Renderer
 * (`FormRenderer.tsx` + `FormFieldRenderer.tsx`) used to inline. Extracting them
 * keeps the components thin, makes the client↔server value contract testable
 * WITHOUT a browser, and removes drift risk between the renderer and the backend
 * `forms.mutations.submit` decode/validation pipeline.
 *
 * SCOPE: only logic with NO dependency on React state/effects/DOM lives here:
 *   - field-type → input-kind mapping (which control a type renders as);
 *   - initial-value derivation (defaultValue, then initialValues override);
 *   - visibility application (which fields render) via the HARDENED
 *     `evaluateConditionalLogic` (called, never reimplemented);
 *   - computed-value SERIALIZATION (the calc engine's number/object → string);
 *   - submit-value selection + serialization, matching what the backend decodes.
 *
 * The actual JSX, change/blur events, file pickers and multi-step nav UX stay in
 * the components and are exercised by the Playwright smoke — see the renderer
 * components' module docs.
 *
 * VALUE / SERIALIZATION CONTRACT (must match the backend so `submit` accepts what
 * we send — see `customFieldValidation.ts` + `mutations.ts`):
 *   - text / textarea / email / url / oembed / password / color_picker /
 *     date_* / time_picker / range            → plain string
 *   - number / range                          → numeric string
 *   - date_picker                             → "YYYY-MM-DD"
 *   - select (single) / radio / button_group  → the chosen choice `value` (scalar)
 *   - select (multiple) / checkbox            → JSON array string of `value`s
 *   - true_false                              → "1"|"0" (also accepts "true"/"false")
 *   - product                                 → JSON object string (e.g. {quantity})
 *   - calculation                             → server-owned number (string here)
 *   - LAYOUT/SECURITY (message/accordion/tab/page_break/captcha/honeypot)
 *                                             → NO submittable value (dropped)
 *
 * SSR-safe: no `window`/`document` access at module load.
 */

import { evaluateConditionalLogic } from "@/lib/forms/conditionalLogic";

/**
 * A field definition, structurally compatible with the renderer's
 * `PublicFormField` and the backend field-def shape. Only the keys this module
 * reads are required; callers may pass the richer renderer type unchanged.
 */
export interface RenderFieldDef {
  key: string;
  type: string;
  required?: boolean;
  defaultValue?: string | null;
  conditionalLogic?: string | null;
  menuOrder?: number;
}

/**
 * Layout / value-less field types that NEVER carry a submittable value. This is
 * the SINGLE SOURCE OF TRUTH for the renderer and MUST mirror the backend's
 * `LAYOUT_FIELD_TYPES` (packages/backend/convex/customFields/validators.ts) so a
 * field the server drops is also never serialized into the client payload.
 *
 * NOTE the security types `captcha` + `honeypot`: the server treats them as
 * value-less, so the client must too — otherwise a (visible) honeypot's empty
 * value would be sent and, if flagged required, would fail the client required
 * check and block legitimate submissions.
 */
export const LAYOUT_VALUELESS_TYPES: ReadonlySet<string> = new Set([
  "message",
  "accordion",
  "tab",
  "page_break",
  "captcha",
  "honeypot",
]);

/**
 * Computed field types (Form Calculation & Pricing System). They DO carry a
 * value, but it is server-owned (recomputed authoritatively at submit). Mirrors
 * the backend `COMPUTED_FIELD_TYPES`.
 */
export const COMPUTED_VALUE_TYPES: ReadonlySet<string> = new Set([
  "calculation",
  "product",
]);

/**
 * The kind of control a field type renders as. This is the data-driven form of
 * the `switch` in `FormFieldRenderer.renderControl()`. The component maps each
 * kind to JSX; this module owns ONLY the classification so it is unit-testable.
 *
 *   - "textarea"     → multi-line text
 *   - "text"         → single-line text input (text/email/url/number/date are
 *                       distinct kinds so the component can set <input type>)
 *   - "email" | "url" | "number" | "date"  → typed single-line inputs
 *   - "select"       → native single <select>
 *   - "multiselect"  → checkbox-style group writing a JSON array (select+multiple)
 *   - "radio"        → radio group (scalar)
 *   - "checkbox"     → checkbox group writing a JSON array
 *   - "boolean"      → single true/false checkbox
 *   - "calculation"  → read-only computed display
 *   - "product"      → priced line (editable qty + read-only total)
 *   - "layout"       → renders static copy / nothing; no input, no value
 *   - "text-fallback"→ a non-first-class but known-scalar type, safe as text
 *   - "unsupported"  → no mapping; renders a graceful note, NEVER crashes
 */
export type InputKind =
  | "textarea"
  | "text"
  | "email"
  | "url"
  | "number"
  | "date"
  | "select"
  | "multiselect"
  | "radio"
  | "checkbox"
  | "boolean"
  | "calculation"
  | "product"
  | "layout"
  | "text-fallback"
  | "unsupported";

/**
 * Scalar-ish types we are confident degrade safely to a plain text input when
 * not given a first-class renderer. Mirrors `FormFieldRenderer.TEXT_FALLBACK_TYPES`.
 */
const TEXT_FALLBACK_TYPES: ReadonlySet<string> = new Set([
  "password",
  "color_picker",
  "date_time_picker",
  "time_picker",
  "range",
  "oembed",
  "button_group",
]);

/** First-class field type → input kind. Anything absent is resolved by rules. */
const FIRST_CLASS_KIND: Readonly<Record<string, InputKind>> = {
  textarea: "textarea",
  text: "text",
  email: "email",
  url: "url",
  number: "number",
  date_picker: "date",
  radio: "radio",
  checkbox: "checkbox",
  true_false: "boolean",
  calculation: "calculation",
  product: "product",
};

/**
 * Classify a field type into the control kind the renderer should draw. Pure.
 *
 * Resolution order (matches the component's switch + fallbacks):
 *   1. layout/value-less types → "layout"
 *   2. `select` → "multiselect" when `settings.multiple`, else "select"
 *   3. a first-class mapped type → its kind
 *   4. a known scalar fallback → "text-fallback"
 *   5. otherwise → "unsupported" (graceful note; never throws)
 *
 * `isMultiple` lets the caller pass the already-parsed `settings.multiple`
 * (the component parses settings once); when omitted, `select` resolves to the
 * single-select kind.
 */
export function inputKindForFieldType(
  type: string,
  isMultiple?: boolean,
): InputKind {
  if (LAYOUT_VALUELESS_TYPES.has(type)) return "layout";
  if (type === "select") return isMultiple ? "multiselect" : "select";
  const firstClass = FIRST_CLASS_KIND[type];
  if (firstClass) return firstClass;
  if (TEXT_FALLBACK_TYPES.has(type)) return "text-fallback";
  return "unsupported";
}

/** True when a field type carries NO submittable value (layout/security). */
export function isLayoutValueless(type: string): boolean {
  return LAYOUT_VALUELESS_TYPES.has(type);
}

/** True when a field type's value is server-owned (computed at submit). */
export function isComputedType(type: string): boolean {
  return COMPUTED_VALUE_TYPES.has(type);
}

/**
 * Derive the initial `key -> string value` map for a form. Mirrors the
 * `useState` seed in `FormRenderer`: every field is seeded from its
 * `defaultValue` (or ""), then any `initialValues` (prefill / resume) OVERRIDE.
 * Precedence: defaultValue < initialValues. Pure; never reads React state.
 *
 * Note layout/security/computed fields are seeded too (harmless — they are
 * filtered out of the submit payload and validation by type, not by presence).
 */
export function deriveInitialValues(
  fields: readonly RenderFieldDef[],
  initialValues?: Record<string, string>,
): Record<string, string> {
  const seed: Record<string, string> = {};
  for (const field of fields) {
    seed[field.key] = field.defaultValue ?? "";
  }
  if (initialValues) {
    for (const [key, val] of Object.entries(initialValues)) {
      seed[key] = val;
    }
  }
  return seed;
}

/**
 * Stable sort of fields by the admin-authored `menuOrder` (absent ⇒ 0). Mirrors
 * the renderer's `useMemo` sort. Returns a NEW array; input is not mutated.
 */
export function sortByMenuOrder<T extends { menuOrder?: number }>(
  fields: readonly T[],
): T[] {
  return [...fields].sort((a, b) => (a.menuOrder ?? 0) - (b.menuOrder ?? 0));
}

/**
 * Apply visibility: return the subset of `fields` that should render, given the
 * current value map and an optional step restriction (Multi-Step System). A
 * field renders when it is in the step's key set (or no step is active) AND the
 * HARDENED `evaluateConditionalLogic` says it is visible.
 *
 * This is the pure form of the renderer's `visibleFields` useMemo. Hidden fields
 * are excluded from the returned set ⇒ they are not rendered, not validated, and
 * (when fed to `buildSubmitPayload`) not submitted — matching the server, which
 * drops hidden fields in its own visibility recompute.
 *
 * @param stepKeys when provided, only fields whose `key` is in this set are
 *   eligible (intersected with the conditional filter). Absent ⇒ whole form.
 */
export function selectVisibleFields<T extends RenderFieldDef>(
  fields: readonly T[],
  values: Record<string, string>,
  stepKeys?: ReadonlySet<string> | null,
): T[] {
  return fields.filter(
    (field) =>
      (!stepKeys || stepKeys.has(field.key)) &&
      evaluateConditionalLogic(field.conditionalLogic, values),
  );
}

/**
 * Serialize ONE calc-engine computed value to the string the renderer displays
 * and the backend's `serializeComputedValue` produces: a number → its string
 * form; anything else (a priced-line object) → JSON. Mirrors the per-entry
 * serialization in `FormRenderer.computedValues` AND backend `mutations.ts`.
 */
export function serializeComputedValue(value: unknown): string {
  return typeof value === "number" ? String(value) : JSON.stringify(value);
}

/**
 * Serialize a whole `key -> computedValue` map (the calc engine's `computed`
 * output) into the `key -> string` map the renderer overlays onto computed
 * fields. Pure; mirrors the loop in `FormRenderer.computedValues`.
 */
export function serializeComputedMap(
  computed: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(computed)) {
    out[key] = serializeComputedValue(val);
  }
  return out;
}

/**
 * Pick the value the renderer should hand a field: for a computed field, prefer
 * the live-recomputed value (falling back to the stored value, then ""); for any
 * other field, the stored value (or ""). Pure form of the `fieldValue` ternary
 * in `FormRenderer`'s field list.
 */
export function displayValueForField(
  field: RenderFieldDef,
  values: Record<string, string>,
  computedValues: Record<string, string>,
): string {
  if (COMPUTED_VALUE_TYPES.has(field.type)) {
    return computedValues[field.key] ?? values[field.key] ?? "";
  }
  return values[field.key] ?? "";
}

/** One entry of the `submit` mutation's `values` array. */
export interface SubmitValueEntry {
  fieldKey: string;
  value: string;
}

/**
 * Build the `submit` payload from the ALREADY-VISIBLE fields + value map. Drops
 * layout/security (value-less) fields by type, mirroring the renderer's
 * `payloadValues` map AND the server, which never persists those types. Computed
 * fields ARE included (the server re-derives + overwrites their value).
 *
 * Pass the output of {@link selectVisibleFields} so hidden fields are already
 * excluded — they must not be sent (the server drops them, but the client
 * shouldn't leak a hidden answer either).
 */
export function buildSubmitPayload(
  visibleFields: readonly RenderFieldDef[],
  values: Record<string, string>,
): SubmitValueEntry[] {
  return visibleFields
    .filter((field) => !LAYOUT_VALUELESS_TYPES.has(field.type))
    .map((field) => ({
      fieldKey: field.key,
      value: values[field.key] ?? "",
    }));
}

/**
 * Serialize a single user selection to the wire string the backend validator
 * decodes, given the field type. This centralizes the array/object/scalar
 * encoding the sub-controls perform inline so it can be round-tripped in tests
 * against the backend decode contract.
 *
 *   - multi-choice (`checkbox`, or `select` with `multiple`): an array of chosen
 *     `value`s → `JSON.stringify(array)`. The backend `validateCheckbox` /
 *     `validateSelect(multiple)` does `JSON.parse` and requires an array.
 *   - single-choice (`select`, `radio`, `button_group`): the scalar `value`.
 *   - `true_false`: pass a boolean → "1"/"0".
 *   - everything else: the value coerced to string.
 *
 * `selection` is `string | string[] | boolean`; arrays are only meaningful for
 * multi-choice kinds.
 */
export function serializeFieldValue(
  type: string,
  selection: string | string[] | boolean,
  isMultiple?: boolean,
): string {
  if (type === "checkbox" || (type === "select" && isMultiple)) {
    const arr = Array.isArray(selection)
      ? selection
      : selection === "" || selection == null
        ? []
        : [String(selection)];
    return JSON.stringify(arr);
  }
  if (type === "true_false") {
    if (typeof selection === "boolean") return selection ? "1" : "0";
    return selection === "1" || selection === "true" ? "1" : "0";
  }
  if (Array.isArray(selection)) return JSON.stringify(selection);
  if (typeof selection === "boolean") return selection ? "1" : "0";
  return String(selection ?? "");
}

/**
 * Decode a serialized multi-choice value (checkbox / multi-select) back to its
 * array of selected `value`s, tolerating malformed/empty blobs (→ []). Pure form
 * of the `selected` useMemo in `CheckboxGroupControl`. Used by the component to
 * render checked state and by tests to assert the serialize round-trip.
 */
export function parseMultiValue(value: string): string[] {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Whether a value counts as "empty" for the client-side required check. Mirrors
 * `FormRenderer.validate`: an empty string, an empty JSON array, or an empty JSON
 * object are all empty. Pure.
 */
export function isEmptyForRequired(value: string | undefined): boolean {
  const raw = (value ?? "").trim();
  return raw === "" || raw === "[]" || raw === "{}";
}
