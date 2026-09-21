import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const MODULES = new Set(["colors", "typography", "layout", "header", "footer", "menuLayout", "shop", "pageTemplates"]);
const FIELD_TYPES = new Set(["color", "font", "select", "toggle", "text", "number", "image", "menuLocation", "range"]);

/** Recursively audit the pack boundary, including shared parts used by its surfaces. */
export function validateTemplateContract(directory, manifest, catalog) {
  const issues = [];
  if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(manifest.version ?? "")) issues.push("version must be semantic major.minor.patch");
  if (!/^[~^]?1(?:\.\d+(?:\.\d+)?)?$/.test(manifest.sdk ?? "")) issues.push("sdk must target the supported 1.x contract (for example ^1.0.0)");
  if (new Set(manifest.surfaces).size !== manifest.surfaces?.length) issues.push("surface ids must be unique");
  for (const module of manifest.modules ?? []) if (!MODULES.has(module)) issues.push(`unknown standard module '${module}'; define custom groups in settings`);
  const groups = new Set();
  for (const group of manifest.settings ?? []) {
    if (groups.has(group.id) || (manifest.modules ?? []).includes(group.id)) issues.push(`duplicate settings group '${group.id}'`);
    groups.add(group.id);
    const fields = new Set();
    for (const field of group.fields ?? []) {
      if (fields.has(field.id)) issues.push(`duplicate field '${group.id}.${field.id}'`);
      fields.add(field.id);
      if (!FIELD_TYPES.has(field.type)) issues.push(`unknown field type '${group.id}.${field.id}'`);
      if (!Object.hasOwn(field, "default")) issues.push(`field '${group.id}.${field.id}' needs a default`);
      for (const surface of field.surfaces ?? []) if (!catalog.has(surface)) issues.push(`field '${group.id}.${field.id}' names unknown surface '${surface}'`);
    }
  }
  const visit = folder => {
    for (const name of readdirSync(folder)) {
      const file = join(folder, name);
      if (statSync(file).isDirectory()) { visit(file); continue; }
      if (!/\.[jt]sx?$/.test(name) || /\.test\./.test(name)) continue;
      const source = readFileSync(file, "utf8");
      const local = relative(directory, file);
      if (/(?:from\s*|import\s*\()?["'](?:convex\/react|[^"']*generated\/api|@radix-ui\/[^"']*)["']/.test(source)) issues.push(`${local}: direct backend/Radix dependency; use SDK view models and Base UI`);
      if (/\b(?:api|internal)\.[a-zA-Z_$]+\.[a-zA-Z_$]+/.test(source)) issues.push(`${local}: backend API references belong in a route or SDK hook`);
      if (/#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})\b|\b(?:bg|text|border)-(?:zinc|slate|gray|neutral|stone|red|blue|green)-\d{2,3}\b/i.test(source)) issues.push(`${local}: use theme tokens instead of color literals`);
      if (local.startsWith("surfaces/") && !/export\s+default\b|export\s*\{[^}]*\bdefault\b/s.test(source)) issues.push(`${local}: surface must default-export a component`);
    }
  };
  visit(directory);
  return issues;
}
