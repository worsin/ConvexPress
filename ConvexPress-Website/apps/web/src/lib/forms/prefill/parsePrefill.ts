/**
 * Form Prefill — the parser (§8 pipeline).
 *
 * Turns URL search params (+ optional dynamic sources) into a seed for the
 * renderer's value map. PURE + SSR-safe: runs identically in the SSR loader and
 * the browser; touches no `window` at module load or call time; never throws
 * (each param is processed in its own try/catch).
 *
 * SECURITY — only fields that OPT IN are populated:
 *   - `field.settings.allowDynamicPopulation === true` is REQUIRED.
 *   - hidden / admin-only / layout / password fields are NEVER populated, even
 *     if a param targets them (defense-in-depth; the server re-validates too).
 *   - illegal values are REJECTED (listed in `rejected`), never coerced.
 *   - duplicate `paramName` → the first-declared eligible field wins; the
 *     duplicate param is rejected.
 *   - params matching no eligible field → rejected.
 */

import { sanitizeInput } from "./sanitize";
import { normalizeForField, REJECT } from "./normalizers";
import { resolveInitialStep, type InitialStepOptions } from "./initialStep";
import type {
  DynamicSource,
  PrefillResult,
  PublicFormDefinition,
  PublicFormField,
} from "./types";

/** Field types that never carry a populatable value. */
const NON_POPULATABLE_TYPES = new Set([
  "message",
  "accordion",
  "tab",
  "page_break",
  "captcha",
  "honeypot",
  "password",
]);

interface FieldPrefillConfig {
  allowDynamicPopulation?: boolean;
  /** Optional URL param name override (case-insensitive). Default: field.key. */
  paramName?: string;
  /** Optional admin-only flag — never populated from the URL. */
  adminOnly?: boolean;
  /** Optional hidden flag (authoring) — never populated. */
  hidden?: boolean;
}

/** Parse a field's settings JSON tolerantly to read prefill config. */
function readPrefillConfig(field: PublicFormField): FieldPrefillConfig {
  try {
    const parsed = JSON.parse(field.settings);
    if (parsed && typeof parsed === "object") {
      return parsed as FieldPrefillConfig;
    }
  } catch {
    /* malformed settings — treat as no config (not eligible) */
  }
  return {};
}

/** True when a field is eligible for dynamic population. */
function isEligible(field: PublicFormField, cfg: FieldPrefillConfig): boolean {
  if (NON_POPULATABLE_TYPES.has(field.type)) return false;
  if (cfg.allowDynamicPopulation !== true) return false;
  if (cfg.adminOnly === true) return false;
  if (cfg.hidden === true) return false;
  return true;
}

/** Build a case-insensitive lookup of search params by lowercased key. */
function indexParams(
  searchParams: Record<string, unknown>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value == null) continue;
    // Arrays (repeated params) → take the first occurrence.
    const raw = Array.isArray(value) ? value[0] : value;
    if (typeof raw !== "string") continue;
    const lower = key.toLowerCase();
    if (!map.has(lower)) map.set(lower, raw);
  }
  return map;
}

/**
 * Parse prefill from URL params (URL wins over a DynamicSource for the same
 * field). Returns `{ initialValues, initialStep?, applied, rejected }`.
 */
export function parsePrefill(
  searchParams: Record<string, unknown>,
  formDef: PublicFormDefinition,
  sources: DynamicSource[] = [],
  stepOptions: InitialStepOptions = {},
): PrefillResult {
  const initialValues: Record<string, string> = {};
  const applied: string[] = [];
  const rejected: string[] = [];

  const paramIndex = indexParams(searchParams);
  // Track which param names have already been consumed (first field wins).
  const consumedParams = new Set<string>();

  for (const field of formDef.fields) {
    const cfg = readPrefillConfig(field);
    if (!isEligible(field, cfg)) continue;

    const paramName = (cfg.paramName ?? field.key).toLowerCase();

    try {
      // Resolve the RAW value: URL param wins, else a DynamicSource.
      let raw: string | undefined;
      let fromUrl = false;
      if (paramIndex.has(paramName)) {
        // Duplicate paramName across two eligible fields → first wins.
        if (consumedParams.has(paramName)) {
          rejected.push(paramName);
          continue;
        }
        raw = paramIndex.get(paramName);
        fromUrl = true;
      } else {
        for (const source of sources) {
          const v = source.resolve(field);
          if (v != null) {
            raw = v;
            break;
          }
        }
      }

      if (raw == null) continue; // nothing to populate for this field

      // URL values are sanitized; DynamicSource values are trusted host data
      // but still pass through sanitize for uniform safety.
      const clean = sanitizeInput(raw);
      if (clean == null) {
        if (fromUrl) {
          rejected.push(paramName);
          consumedParams.add(paramName);
        }
        continue;
      }

      const normalized = normalizeForField(field, clean);
      if (normalized === REJECT) {
        rejected.push(fromUrl ? paramName : field.key);
        if (fromUrl) consumedParams.add(paramName);
        continue;
      }

      initialValues[field.key] = normalized;
      applied.push(field.key);
      if (fromUrl) consumedParams.add(paramName);
    } catch {
      // Per-param isolation — a single bad param never breaks the rest.
      rejected.push(paramName);
    }
  }

  // Any URL param that matched no eligible field (and wasn't already rejected)
  // → rejected. `step` is owned by resolveInitialStep, not a field param.
  for (const lowerKey of paramIndex.keys()) {
    if (lowerKey === "step") continue;
    if (!consumedParams.has(lowerKey) && !rejected.includes(lowerKey)) {
      rejected.push(lowerKey);
    }
  }

  const initialStep = resolveInitialStep(
    searchParams,
    formDef,
    initialValues,
    stepOptions,
  );

  return { initialValues, initialStep, applied, rejected };
}
