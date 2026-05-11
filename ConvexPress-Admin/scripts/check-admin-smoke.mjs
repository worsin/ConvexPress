import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function fail(message) {
  console.error(`Admin smoke failed: ${message}`);
  process.exitCode = 1;
}

function extractStringValues(source, key) {
  const values = new Set();
  const pattern = new RegExp(`${key}:\\s*["'\`]([^"'\`]+)["'\`]`, "g");
  for (const match of source.matchAll(pattern)) {
    values.add(match[1]);
  }
  return values;
}

function normalizePath(path) {
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

const routeTree = read("apps/web/src/routeTree.gen.ts");
const navConfig = read("apps/web/src/lib/admin-shell/nav-config.ts");
const pluginRegistry = read("apps/web/src/lib/plugins/registry.ts");

const routeFullPaths = new Set(
  [...extractStringValues(routeTree, "fullPath")].map(normalizePath),
);
const routeMapKeys = new Set(
  [...routeTree.matchAll(/['"`](\/[^'"`]+)['"`]:\s*typeof/g)].map((match) =>
    normalizePath(match[1]),
  ),
);
const routePaths = new Set([...routeFullPaths, ...routeMapKeys]);
const navTargets = new Set([
  ...extractStringValues(navConfig, "to"),
  ...extractStringValues(pluginRegistry, "to"),
]);

const staticNavTargets = [...navTargets]
  .filter((target) => target.startsWith("/"))
  .filter((target) => !target.includes("$"))
  .map(normalizePath)
  .sort((a, b) => a.localeCompare(b));

if (routePaths.size < 100) {
  fail(`route tree looks incomplete; found ${routePaths.size} route paths`);
}

for (const target of staticNavTargets) {
  if (!routePaths.has(target)) {
    fail(`navigation target ${target} is not present in generated route tree`);
  }
}

const requiredSmokePaths = [
  "/dashboard",
  "/posts",
  "/media",
  "/pages",
  "/commerce",
  "/commerce/products",
  "/commerce/orders",
  "/commerce/settings/shipping",
  "/commerce/subscriptions",
  "/membership",
  "/kb",
  "/tickets",
  "/settings",
  "/settings/email",
  "/tools",
];

for (const path of requiredSmokePaths) {
  if (!routePaths.has(normalizePath(path))) {
    fail(`required admin smoke path ${path} is missing from route tree`);
  }
}

const adminShellSource = read("apps/web/src/routes/_authenticated/_admin.tsx");
if (!adminShellSource.includes("AdminContentErrorBoundary")) {
  fail("admin shell must wrap routed content in AdminContentErrorBoundary");
}

const desktopMainSource = read("packages/desktop/electron/main.ts");
if (!desktopMainSource.includes("app.requestSingleInstanceLock()")) {
  fail("desktop main process must enforce a single-instance lock");
}

const windowManagerSource = read("packages/desktop/electron/window-manager.ts");
for (const expected of [
  'process.env.CONVEXPRESS_DESKTOP_DEV_URL ?? "http://localhost:4105"',
  'path.join(__dirname, "preload.js")',
  "did-fail-load",
  "render-process-gone",
]) {
  if (!windowManagerSource.includes(expected)) {
    fail(`desktop window manager is missing smoke hook: ${expected}`);
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(
  `Admin smoke passed: ${routePaths.size} generated routes and ${staticNavTargets.length} nav targets checked.`,
);
