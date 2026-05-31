/**
 * ConvexPress Forms — Builder pure core (extracted from mutations.ts)
 *
 * Pure, I/O-free logic for the Form BUILDER (admin CRUD). The mutations in
 * `mutations.ts` compose these so the behavior is identically testable without a
 * Convex ctx. Nothing here touches `ctx.db`, `ctx.auth`, or `Date.now()` — every
 * function takes its inputs explicitly and returns a value.
 *
 * Surfaced cores:
 *   - slugify / isValidSlug          — title → URL-safe slug (normalize, bound).
 *   - nextCopySlug                   — first free "-copy[-n]" given a taken-predicate.
 *   - isValidStatusTransition        — draft↔published↔archived gate.
 *   - DEFAULT_FORM_SETTINGS / ...    — default settings shape on create.
 *   - remapFieldReferences           — DUPLICATE: rewrite every sibling-KEY
 *                                      reference (conditionalLogic rules,
 *                                      requiredWhen, calc formulas, quantityFieldKey)
 *                                      onto the copied field's NEW key. This is the
 *                                      fix for the deep-copy reference bug where a
 *                                      duplicated form's logic/formulas kept pointing
 *                                      at the ORIGINAL field keys.
 */

/** The three form lifecycle states (mirrors the `forms.status` union). */
export type FormStatus = "draft" | "published" | "archived";

// ─── Slug generation ─────────────────────────────────────────────────────────

/** Max stored slug length (kept in sync with the original inline slicer). */
export const SLUG_MAX_LENGTH = 96;

/**
 * Lowercase/slugify a string into a URL-safe form slug. Normalization:
 *   - lowercased + trimmed,
 *   - any run of non-`[a-z0-9]` collapsed to a single "-",
 *   - leading/trailing "-" stripped,
 *   - bounded to {@link SLUG_MAX_LENGTH} chars.
 * An all-punctuation / empty input yields "" (the caller rejects empties).
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH);
}

/** A slug is valid when it survives slugify with ≥1 alphanumeric char. */
export function isValidSlug(slug: string): boolean {
  return slugify(slug).length > 0;
}

/**
 * Given a base slug and a predicate that reports whether a candidate slug is
 * already taken, return the first available "-copy" variant:
 *   `base-copy`, then `base-copy-2`, `base-copy-3`, … up to `base-copy-99`.
 * If all are taken (pathological), returns `${base}-copy-${fallbackSuffix}`
 * (the caller passes a timestamp so uniqueness is guaranteed). Pure: the I/O
 * lives in the predicate the caller supplies.
 */
export function nextCopySlug(
  baseSlug: string,
  isTaken: (candidate: string) => boolean,
  fallbackSuffix: string | number,
): string {
  let candidate = `${baseSlug}-copy`;
  let n = 1;
  while (n < 100) {
    if (!isTaken(candidate)) return candidate;
    n += 1;
    candidate = `${baseSlug}-copy-${n}`;
  }
  return `${baseSlug}-copy-${fallbackSuffix}`;
}

// ─── Status transitions ──────────────────────────────────────────────────────

/**
 * Allowed status transitions for a form. The builder lets a form move freely
 * among draft / published / archived (publish, unpublish, archive, restore),
 * including the no-op self transition (idempotent re-publish / re-archive).
 * There is no terminal status — an archived form can be restored to draft.
 */
const STATUS_TRANSITIONS: Record<FormStatus, ReadonlySet<FormStatus>> = {
  draft: new Set<FormStatus>(["draft", "published", "archived"]),
  published: new Set<FormStatus>(["published", "draft", "archived"]),
  archived: new Set<FormStatus>(["archived", "draft", "published"]),
};

/** Whether `to` is a legal next status from `from`. */
export function isValidStatusTransition(from: FormStatus, to: FormStatus): boolean {
  return STATUS_TRANSITIONS[from]?.has(to) ?? false;
}

// ─── Default settings ────────────────────────────────────────────────────────

/**
 * Default form-level settings applied on create when the caller supplies none.
 * Kept intentionally minimal/JSON-serializable — the builder UI fills the rest.
 * Exposed as a factory so callers can't mutate a shared object.
 */
export function defaultFormSettings(): Record<string, never> {
  return {};
}

/** The serialized default settings string used when create() gets no settings. */
export const DEFAULT_FORM_SETTINGS_JSON = "{}";

/**
 * Normalize an optional settings blob: validate it is JSON, defaulting absent to
 * "{}". Returns `{ ok: true, value }` or `{ ok: false }` (the caller throws the
 * ConvexError so this stays pure / framework-free).
 */
export function normalizeSettings(
  settings: string | undefined,
): { ok: true; value: string } | { ok: false } {
  if (settings === undefined || settings === "") {
    return { ok: true, value: DEFAULT_FORM_SETTINGS_JSON };
  }
  try {
    JSON.parse(settings);
    return { ok: true, value: settings };
  } catch {
    return { ok: false };
  }
}

// ─── DUPLICATE: field-reference remapping (bug fix core) ─────────────────────

/**
 * Carrier strings on a copied field that reference SIBLING field keys and must
 * be rewritten when those siblings get new keys during a duplicate:
 *   - `conditionalLogic`: JSON `{ rules: [{ field|fieldKey, value, operandKind }] }`
 *       → `rule.field`/`rule.fieldKey` is a sibling KEY; `rule.value` is ALSO a
 *         sibling KEY when `operandKind === "field"` (cross-field operand).
 *   - `settings.requiredWhen`: same conditional shape (string OR object).
 *   - `settings.formula` / `settings.unitPriceFormula`: calc formulas whose
 *       `{field_key}` leaves are sibling KEYs.
 *   - `settings.quantityFieldKey`: a bare sibling KEY (product quantity driver).
 * `{row.x}` repeater sub-refs are NOT field keys and are left untouched.
 */
export interface FieldReferenceCarriers {
  conditionalLogic?: string | null;
  settings?: string | null;
}

/** Apply a key remap to a copied field's reference carriers. */
export function remapFieldReferences<T extends FieldReferenceCarriers>(
  field: T,
  keyMap: ReadonlyMap<string, string>,
): T {
  // Nothing to do when no keys actually changed.
  if (keyMap.size === 0) return field;
  return {
    ...field,
    conditionalLogic: remapConditionalLogicJson(field.conditionalLogic, keyMap),
    settings: remapSettingsJson(field.settings, keyMap),
  };
}

/** Resolve a key through the map, leaving unknown keys (literals) untouched. */
function mapKey(key: string, keyMap: ReadonlyMap<string, string>): string {
  return keyMap.get(key) ?? key;
}

/**
 * Rewrite a serialized conditionalLogic JSON's rule references onto new keys.
 * Tolerant: malformed / non-object / rule-less JSON is returned VERBATIM (we
 * never destroy data we can't parse). Both the canonical `field` and the legacy
 * `fieldKey` alias are remapped, and `value` is remapped only for a
 * `operandKind === "field"` (cross-field) rule.
 */
export function remapConditionalLogicJson(
  json: string | null | undefined,
  keyMap: ReadonlyMap<string, string>,
): string | null | undefined {
  if (json == null || json === "") return json;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return json;
  }
  const remapped = remapConditionalLogicData(parsed, keyMap);
  if (remapped === undefined) return json;
  return JSON.stringify(remapped);
}

/**
 * Remap a parsed conditional-logic object (used for both `conditionalLogic` and
 * an object-form `requiredWhen`). Returns the rewritten object, or `undefined`
 * when the input is not a remappable shape (so callers keep the original).
 */
function remapConditionalLogicData(
  data: unknown,
  keyMap: ReadonlyMap<string, string>,
): Record<string, unknown> | undefined {
  if (!data || typeof data !== "object") return undefined;
  const obj = data as Record<string, unknown>;
  const rules = obj.rules;
  if (!Array.isArray(rules)) return undefined;
  const newRules = rules.map((rule) => {
    if (!rule || typeof rule !== "object") return rule;
    const r = { ...(rule as Record<string, unknown>) };
    if (typeof r.field === "string") r.field = mapKey(r.field, keyMap);
    if (typeof r.fieldKey === "string") r.fieldKey = mapKey(r.fieldKey, keyMap);
    // A cross-field operand stores another field's KEY in `value`.
    if (r.operandKind === "field" && typeof r.value === "string") {
      r.value = mapKey(r.value, keyMap);
    }
    return r;
  });
  return { ...obj, rules: newRules };
}

/**
 * Rewrite a serialized settings JSON's field-key references onto new keys:
 * `requiredWhen` (conditional shape), `formula` + `unitPriceFormula` (calc
 * `{field_key}` leaves), and `quantityFieldKey` (bare key). Unknown/extra keys
 * are preserved untouched. Malformed/non-object JSON is returned verbatim.
 */
export function remapSettingsJson(
  json: string | null | undefined,
  keyMap: ReadonlyMap<string, string>,
): string | null | undefined {
  if (json == null || json === "") return json;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return json;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json;
  const settings = { ...(parsed as Record<string, unknown>) };
  let changed = false;

  // requiredWhen: string form OR nested object form.
  const rw = settings.requiredWhen;
  if (typeof rw === "string" && rw !== "") {
    const next = remapConditionalLogicJson(rw, keyMap);
    if (next !== rw) {
      settings.requiredWhen = next;
      changed = true;
    }
  } else if (rw && typeof rw === "object") {
    const next = remapConditionalLogicData(rw, keyMap);
    if (next !== undefined) {
      settings.requiredWhen = next;
      changed = true;
    }
  }

  // Calc formulas: rewrite `{field_key}` leaves.
  for (const formulaKey of ["formula", "unitPriceFormula"] as const) {
    const f = settings[formulaKey];
    if (typeof f === "string" && f !== "") {
      const next = remapFormulaRefs(f, keyMap);
      if (next !== f) {
        settings[formulaKey] = next;
        changed = true;
      }
    }
  }

  // Product quantity driver: a bare sibling key.
  if (typeof settings.quantityFieldKey === "string") {
    const next = mapKey(settings.quantityFieldKey, keyMap);
    if (next !== settings.quantityFieldKey) {
      settings.quantityFieldKey = next;
      changed = true;
    }
  }

  return changed ? JSON.stringify(settings) : json;
}

/**
 * Rewrite the `{field_key}` references inside a calc formula string onto new
 * keys. A formula reference is exactly `{` + key + `}` (the tokenizer trims
 * inner whitespace), and `{row.x}` repeater refs are left alone (not field
 * keys). Generated field keys are `[a-zA-Z0-9_]` only, so a brace-delimited
 * scan is exact and never touches operators or literals.
 */
export function remapFormulaRefs(
  formula: string,
  keyMap: ReadonlyMap<string, string>,
): string {
  return formula.replace(/\{([^}]*)\}/g, (match, inner: string) => {
    const trimmed = inner.trim();
    if (trimmed.startsWith("row.")) return match; // repeater sub-ref, not a field key
    const mapped = keyMap.get(trimmed);
    return mapped !== undefined ? `{${mapped}}` : match;
  });
}
