/**
 * Form Prefill — shared types.
 *
 * SSR-safe by construction (no `window`). Reuses the renderer's
 * `PublicFormField` so the parser reads the exact field shape `getBySlug`
 * projects (key/type/label/settings(JSON)/conditionalLogic/menuOrder).
 */

import type { PublicFormField } from "@/components/forms/FormFieldRenderer";

export type { PublicFormField };

/**
 * The result of parsing URL params (+ optional dynamic sources) into a seed for
 * the renderer's value map. `initialValues` is keyed by field `key` (string→
 * string encoding the renderer understands). `applied`/`rejected` list the field
 * keys / param names that were accepted / dropped, for diagnostics.
 */
export interface PrefillResult {
  initialValues: Record<string, string>;
  /** A resolved step id/index to jump to (Multi-Step), if any. */
  initialStep?: string;
  applied: string[];
  rejected: string[];
}

/**
 * A non-URL value source (e.g. a logged-in user's profile). URL params win over
 * a source for the same field. `resolve` returns the raw (pre-sanitize) value.
 */
export interface DynamicSource {
  id: string;
  resolve: (field: PublicFormField) => string | undefined;
}

/**
 * The minimal form definition the parser reads: the public field list, plus an
 * optional ordered list of step ids (the Multi-Step allowlist for `step=`).
 */
export interface PublicFormDefinition {
  fields: PublicFormField[];
  /** Ordered step id allowlist (Multi-Step). Absent/empty ⇒ single-page. */
  steps?: string[];
}
