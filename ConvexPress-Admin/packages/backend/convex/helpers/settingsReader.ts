/**
 * Typed reads of stored settings.
 *
 * `settings.values` (and other JSON-encoded settings rows) are untyped storage.
 * A section is read back field by field over its defaults: a stored value is
 * used only when it has the field's documented type, otherwise the default is
 * kept, and fields the section does not define are dropped. The result is
 * exactly the section's TypeScript type, so return validators derived from it
 * hold at runtime.
 */
import type { GenericValidator, Infer } from "convex/values";
import { validate } from "convex-helpers/validators";
import { isConvexRecordKey } from "./jsonValue";

export type SettingReader<T> = (value: unknown, fallback: T) => T;
export type SettingsSpec<T> = { [K in keyof T]: SettingReader<T[K]> };

export function settingsRecord(raw: unknown): Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw) ? { ...raw } : {};
}

export const textSetting: SettingReader<string> = (value, fallback) =>
  typeof value === "string" ? value : fallback;

export const flagSetting: SettingReader<boolean> = (value, fallback) =>
  typeof value === "boolean" ? value : fallback;

export const numberSetting: SettingReader<number> = (value, fallback) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** A string restricted to `options`. */
export function choiceSetting<T extends string>(options: readonly T[]): SettingReader<T> {
  const isOption = (value: unknown): value is T => options.some((option) => option === value);
  return (value, fallback) => (isOption(value) ? value : fallback);
}

/** A choice that may also be null. */
export function nullableChoiceSetting<T extends string>(options: readonly T[]): SettingReader<T | null> {
  const isOption = (value: unknown): value is T => options.some((option) => option === value);
  return (value, fallback) => (value === null ? null : isOption(value) ? value : fallback);
}

/** A list whose entries are read by `item`; entries it rejects (null) are dropped. */
export function listSetting<T>(item: (value: unknown) => T | null): SettingReader<T[]> {
  return (value, fallback) => {
    if (!Array.isArray(value)) return fallback;
    const out: T[] = [];
    for (const entry of value) {
      const read = item(entry);
      if (read !== null) out.push(read);
    }
    return out;
  };
}

/** Read a stored settings group at exactly `T`. */
export function readSettingsGroup<T extends object>(spec: SettingsSpec<T>, defaults: T, raw: unknown): T {
  const stored = settingsRecord(raw);
  const out: T = { ...defaults };
  for (const key in spec) out[key] = spec[key](stored[key], defaults[key]);
  return out;
}

// ─── Validator-driven reads ──────────────────────────────────────────────────

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof ArrayBuffer);
}

/** The fallback when it fits `validator`, otherwise "no value" (undefined). */
function fallbackFor(validator: GenericValidator, fallback: unknown): unknown {
  return validate(validator, fallback) ? fallback : undefined;
}

/**
 * Read `stored` toward `validator`'s shape. Objects are read field by field
 * (unknown fields dropped, a missing or mistyped required field taken from the
 * fallback, an absent optional field left absent); array entries and record
 * entries that cannot be read are dropped; union members are tried in order.
 * Returns undefined when nothing valid can be produced.
 */
function readLoose(validator: GenericValidator, stored: unknown, fallback: unknown): unknown {
  if (stored === undefined) return fallbackFor(validator, fallback);
  switch (validator.kind) {
    case "object": {
      if (!isPlainRecord(stored)) return fallbackFor(validator, fallback);
      const base = isPlainRecord(fallback) ? fallback : {};
      const out: Record<string, unknown> = {};
      for (const [key, field] of Object.entries(validator.fields)) {
        if (field.isOptional === "optional" && stored[key] === undefined) continue;
        const value = readLoose(field, stored[key], base[key]);
        if (value !== undefined) out[key] = value;
      }
      return validate(validator, out) ? out : fallbackFor(validator, fallback);
    }
    case "array": {
      if (!Array.isArray(stored)) return fallbackFor(validator, fallback);
      const out: unknown[] = [];
      for (const entry of stored) {
        const value = readLoose(validator.element, entry, undefined);
        if (value !== undefined) out.push(value);
      }
      return out;
    }
    case "record": {
      if (!isPlainRecord(stored)) return fallbackFor(validator, fallback);
      const out: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(stored)) {
        if (!isConvexRecordKey(key) || !validate(validator.key, key)) continue;
        const value = readLoose(validator.value, entry, undefined);
        if (value !== undefined) out[key] = value;
      }
      return out;
    }
    case "union": {
      if (validate(validator, stored)) return stored;
      for (const member of validator.members) {
        const value = readLoose(member, stored, undefined);
        if (value !== undefined) return value;
      }
      return fallbackFor(validator, fallback);
    }
    default:
      return validate(validator, stored) ? stored : fallbackFor(validator, fallback);
  }
}

/**
 * Read untyped stored JSON at exactly `validator`'s type, falling back to
 * `fallback` (field by field for objects). The result always satisfies the
 * validator, so it can be returned through a `returns` built from it.
 */
export function readValidated<V extends GenericValidator>(validator: V, stored: unknown, fallback: Infer<V>): Infer<V> {
  const read = readLoose(validator, stored, fallback);
  return validate(validator, read) ? read : fallback;
}
