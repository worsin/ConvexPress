// @ts-ignore Convex backend tsconfig does not include Bun test globals.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const adminRoot = resolve(here, "../../../../../..");
const backendFormsDir = resolve(here, "..");
const routesDir = join(
  adminRoot,
  "apps/web/src/routes/_authenticated/_admin/forms",
);
const uiFormsDir = join(adminRoot, "apps/web/src/extensions/forms");
const capabilitiesFile = join(
  adminRoot,
  "packages/backend/convex/types/capabilities.ts",
);
const rolesSeedFile = join(adminRoot, "packages/backend/convex/seed/roles.ts");

function filesUnder(dir: string, predicate: (path: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (name === "__tests__") continue;
      out.push(...filesUnder(path, predicate));
    } else if (predicate(path)) {
      out.push(path);
    }
  }
  return out.sort();
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function formCapsIn(source: string): string[] {
  const caps = new Set<string>();
  for (const pattern of [
    /formCap\(["'`](form\.[a-z_]+)["'`]\)/g,
    /useCan\(["'`](form\.[a-z_]+)["'`]\)/g,
    /requireCan\([^)]*["'`](form\.[a-z_]+)["'`]/g,
    /currentUserCan\([^)]*["'`](form\.[a-z_]+)["'`]/g,
  ]) {
    for (const match of source.matchAll(pattern)) {
      caps.add(match[1]!);
    }
  }
  return [...caps].sort();
}

describe("Forms RBAC/static route contract", () => {
  test("every form.* capability used by Forms code is registered", () => {
    const files = [
      ...filesUnder(backendFormsDir, (p) => p.endsWith(".ts")),
      ...filesUnder(routesDir, (p) => p.endsWith(".tsx")),
      ...filesUnder(uiFormsDir, (p) => p.endsWith(".tsx") || p.endsWith(".ts")),
    ];
    const usedCaps = new Set<string>();
    for (const file of files) {
      for (const cap of formCapsIn(read(file))) usedCaps.add(cap);
    }

    const registry = read(capabilitiesFile);
    const seed = read(rolesSeedFile);
    for (const cap of [...usedCaps].sort()) {
      expect(registry.includes(`"${cap}"`)).toBe(true);
      expect(seed.includes(`"${cap}"`)).toBe(true);
    }
  });

  test("all canonical Forms admin routes are wrapped in the Forms PluginGuard", () => {
    const routeFiles = filesUnder(routesDir, (p) => p.endsWith(".tsx"));
    expect(routeFiles.length > 0).toBe(true);
    for (const file of routeFiles) {
      const source = read(file);
      expect(source.includes("PluginGuard")).toBe(true);
      expect(source.includes('pluginId="forms"')).toBe(true);
    }
  });

  test("Forms route components gate privileged controls with useCan", () => {
    const routeFiles = filesUnder(routesDir, (p) => p.endsWith(".tsx"));
    const privilegedCaps = [
      "form.create",
      "form.update",
      "form.delete",
      "form.duplicate",
      "form.manage_notifications",
      "form.manage_confirmations",
      "form.manage_actions",
      "form.manage_security",
    ];
    const joined = routeFiles.map((file) => read(file)).join("\n");
    for (const cap of privilegedCaps) {
      expect(joined.includes(cap)).toBe(true);
    }
  });
});
