import type { TemplateSettingsField } from "./types";

type Values = Record<string, Record<string, unknown>>;
/** Saved drafts and postMessage payloads must contain object-valued modules. */
export function isDraftValues(value: unknown): value is Values {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every(fields => !!fields && typeof fields === "object" && !Array.isArray(fields));
}
/** A draft is a complete override snapshot. Missing fields fall back to defaults. */
export function mergeTemplateValues(
  defaults: Values,
  saved: Values,
  draft?: Values,
): Values {
  const overrides = draft ?? saved;
  return Object.fromEntries(
    Object.keys(defaults).map((module) => [
      module,
      mergeSettingsObject(defaults[module], overrides[module], true),
    ]),
  );
}

export function fieldIsRelevant(
  module: string,
  field: TemplateSettingsField,
  surfaces: readonly string[],
  reads: readonly string[],
): boolean {
  if (reads.includes(`${module}.${field.id}`)) return true;
  return (
    !field.surfaces?.length ||
    field.surfaces.some((surface) => surfaces.includes(surface))
  );
}

/** Only a framed page's actual parent can deliver an external preview draft. */
export function acceptsPreviewMessage(
  previewing: boolean,
  source: unknown,
  parent: unknown,
  self: unknown,
  data: unknown,
): boolean {
  if (
    !previewing ||
    parent === self ||
    source !== parent ||
    !data ||
    typeof data !== "object"
  )
    return false;
  const value = data as Record<string, unknown>;
  return (
    value.type === "convexpress:customize" &&
    typeof value.packId === "string" &&
    /^[a-z0-9][a-z0-9-]{0,63}$/.test(value.packId) &&
    (value.values === undefined || isDraftValues(value.values)) &&
    (!value.variants ||
      (typeof value.variants === "object" && !Array.isArray(value.variants)))
  );
}

/** Builder sections merge recursively; ordered rows/columns replace as a whole. */
export function mergeSettingsObject(
  defaults: Record<string, unknown>,
  overrides: Record<string, unknown> | undefined,
  inheritNull = false,
): Record<string, unknown> {
  const next = { ...defaults };
  for (const [key, value] of Object.entries(overrides ?? {})) {
    // Older Customize controls persisted null for "Template default". Treat
    // that sentinel as inheritance without discarding false, zero or empties.
    if (inheritNull && value == null) continue;
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      defaults[key] &&
      typeof defaults[key] === "object" &&
      !Array.isArray(defaults[key])
    ) {
      next[key] = mergeSettingsObject(
        defaults[key] as Record<string, unknown>,
        value as Record<string, unknown>,
        inheritNull,
      );
    } else next[key] = value;
  }
  return next;
}
