/**
 * Forms save-and-continue draft validation helpers.
 *
 * Draft autosaves should accept an incomplete visible form while the submitter
 * is still typing. They must still run the normal type validators for any
 * supplied values, so malformed emails, negative product quantities, etc. do not
 * get persisted just because the row is partial.
 */

import type { LogicFieldDef } from "./formLogic";

function stripRequiredWhen(settings: string | null | undefined): string | null | undefined {
  if (!settings) return settings;
  try {
    const parsed = JSON.parse(settings);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return settings;
    }
    const { requiredWhen: _requiredWhen, ...rest } = parsed as Record<string, unknown>;
    if (_requiredWhen === undefined) return settings;
    return JSON.stringify(rest);
  } catch {
    return settings;
  }
}

export function relaxRequiredForDrafts(
  fieldDefs: readonly LogicFieldDef[],
): LogicFieldDef[] {
  return fieldDefs.map((def) => ({
    ...def,
    required: false,
    settings: stripRequiredWhen(def.settings),
  }));
}
