import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { PLUGIN_DEFAULTS, PLUGIN_SETTINGS_KEY, isPluginEnabledFromValues } from "../../ConvexPress-Admin/packages/backend/convex/plugins/registry";
import { getDefaults } from "../../ConvexPress-Admin/packages/backend/convex/settings/defaults";
import { WEBSITE_EXTENSIONS } from "../../ConvexPress-Website/apps/web/src/extensions/sdk/registry";
import { extensionEnabled } from "../../ConvexPress-Website/apps/web/src/extensions/sdk/registry-core";

const require = createRequire(new URL("../../ConvexPress-Admin/packages/backend/package.json", import.meta.url));
const ts = require("typescript");
// Inspect the real Admin declaration without executing its Vite-only scanner.
const adminSource = ts.createSourceFile("registry.ts", readFileSync(new URL("../../ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const adminDefaults: Record<string, boolean> = {};
for (const statement of adminSource.statements) {
  if (!ts.isVariableStatement(statement)) continue;
  for (const declaration of statement.declarationList.declarations) {
    if (declaration.name.getText(adminSource) !== "PLATFORM_DEFAULT_SETTINGS") continue;
    if (!declaration.initializer || !ts.isObjectLiteralExpression(declaration.initializer)) throw Error("Admin defaults must be a declared object");
    for (const property of declaration.initializer.properties) {
      if (!ts.isPropertyAssignment(property) || ![ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword].includes(property.initializer.kind)) throw Error("Expected a boolean Admin default");
      adminDefaults[property.name.getText(adminSource)] = property.initializer.kind === ts.SyntaxKind.TrueKeyword;
    }
  }
}
const manifests = [...new Set(WEBSITE_EXTENSIONS.values())];

test("installed Website defaults and dependency decisions match backend authority", () => {
  expect(manifests.length).toBeGreaterThan(0);
  for (const manifest of manifests) {
    expect(PLUGIN_SETTINGS_KEY[manifest.id]).toBe(manifest.settingsKey);
    expect(manifest.defaultEnabled ?? false).toBe(PLUGIN_DEFAULTS[manifest.id]);
    const key = manifest.settingsKey;
    const cases: Record<string, boolean>[] = [{}, { [key]: false }, { [key]: true }];
    if (manifest.parentId) cases.push({ [key]: true, [PLUGIN_SETTINGS_KEY[manifest.parentId]]: false }, { [key]: true, [PLUGIN_SETTINGS_KEY[manifest.parentId]]: true });
    for (const values of cases) expect(extensionEnabled(WEBSITE_EXTENSIONS, manifest.id, values)).toBe(isPluginEnabledFromValues(manifest.id, values));
  }
});

test("Admin and public settings retain backend defaults including Admin-only Custom Fields", () => {
  expect(Object.keys(adminDefaults).length).toBeGreaterThan(0);
  const merged = getDefaults("plugins") as Record<string, unknown>;
  for (const [id, key] of Object.entries(PLUGIN_SETTINGS_KEY)) {
    expect(merged[key]).toBe(PLUGIN_DEFAULTS[id]);
    if (Object.hasOwn(adminDefaults, key)) expect(adminDefaults[key]).toBe(PLUGIN_DEFAULTS[id]);
  }
  expect(adminDefaults.customFieldsEnabled).toBe(true);
  expect(WEBSITE_EXTENSIONS.has("customFields")).toBe(false);
});

test("explicit disabled flags win over defaults and aliases", () => {
  for (const manifest of manifests) {
    const values = { ...getDefaults("plugins"), [manifest.settingsKey]: false } as Record<string, boolean>;
    for (const key of manifest.legacySettingsKeys ?? []) values[key] = true;
    for (const id of [manifest.id, ...manifest.aliases ?? []]) expect(extensionEnabled(WEBSITE_EXTENSIONS, id, values)).toBe(false);
    expect(isPluginEnabledFromValues(manifest.id, values)).toBe(false);
  }
});
