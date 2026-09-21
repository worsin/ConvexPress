import { expect, test } from "bun:test";
import { buildExtensionRegistry, extensionEnabled } from "./registry-core";
import type { WebsiteExtensionManifest } from "./types";
const manifest = (id: string, parentId?: string): WebsiteExtensionManifest => ({ id, settingsKey: `${id}Enabled`, title: id, defaultEnabled: true, parentId, routePrefixes: [], surfaces: [], parts: [], dashboardNav: [], chromeParts: [] });
test("parents and cycles fail closed, unknown plugins stay disabled", () => {
 const registry = buildExtensionRegistry([manifest("parent"), manifest("child", "parent"), manifest("cycleA", "cycleB"), manifest("cycleB", "cycleA")]);
 expect(extensionEnabled(registry, "child", { parentEnabled: false, childEnabled: true })).toBe(false);
 expect(extensionEnabled(registry, "cycleA", {})).toBe(false);
 expect(extensionEnabled(registry, "unknown", {})).toBe(false);
 expect(extensionEnabled(registry, "child", {})).toBe(true);
});
test("duplicate manifest aliases are rejected", () => {
 expect(() => buildExtensionRegistry([manifest("first"), { ...manifest("second"), aliases: ["first"] }])).toThrow();
});
