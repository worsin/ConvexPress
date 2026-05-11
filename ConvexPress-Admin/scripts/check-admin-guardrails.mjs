import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function fail(message) {
  console.error(`Guardrail failed: ${message}`);
  process.exitCode = 1;
}

function expectIncludes(path, needle, message) {
  if (!read(path).includes(needle)) {
    fail(`${message} (${path})`);
  }
}

function checkDesktopDevEntrypoint() {
  const rootPackage = readJson("package.json");
  if (rootPackage.scripts?.["dev:native"] !== "turbo -F @convexpress/desktop dev") {
    fail("dev:native must target @convexpress/desktop exactly");
  }

  const desktopPackage = readJson("packages/desktop/package.json");
  const dependencyBuckets = [
    desktopPackage.dependencies ?? {},
    desktopPackage.devDependencies ?? {},
    desktopPackage.optionalDependencies ?? {},
  ];
  if (dependencyBuckets.some((bucket) => Object.hasOwn(bucket, "electron-store"))) {
    fail("desktop package must not depend on electron-store in the main process");
  }

  expectIncludes(
    "packages/desktop/electron/window-manager.ts",
    'process.env.CONVEXPRESS_DESKTOP_DEV_URL ?? "http://localhost:4105"',
    "Electron dev URL must be stable and overrideable",
  );
  expectIncludes(
    "packages/desktop/electron/window-manager.ts",
    'path.join(__dirname, "preload.js")',
    "Electron preload must resolve from the compiled Electron bundle",
  );
}

function checkDevInternalsAreFailClosed() {
  const convexDir = join(root, "packages/backend/convex");
  const devFiles = readdirSync(convexDir)
    .filter((name) => /^_dev.*\.ts$/.test(name))
    .sort();

  if (devFiles.length === 0) {
    fail("expected at least one _dev*.ts Convex helper to guard");
    return;
  }

  for (const file of devFiles) {
    const relativePath = `packages/backend/convex/${file}`;
    const source = read(relativePath);
    if (!source.includes("CONVEXPRESS_ENABLE_DEV_INTERNALS")) {
      fail(`${relativePath} must check CONVEXPRESS_ENABLE_DEV_INTERNALS`);
    }

    const guardCalls = source.match(/assertDevInternalsEnabled\(\);/g) ?? [];
    if (guardCalls.length < 1) {
      fail(`${relativePath} must call assertDevInternalsEnabled inside exported handlers`);
    }
  }
}

function checkWebApiShimIsExplicit() {
  const tsconfig = readJson("apps/web/tsconfig.json");
  const paths = tsconfig.compilerOptions?.paths ?? {};
  const mapping = paths["@backend/convex/_generated/api"] ?? [];
  if (!mapping.includes("./src/test-types/convex-api-shim.d.ts")) {
    fail("web tsconfig must intentionally map Convex generated api imports to the local shim");
  }

  const shimPath = "apps/web/src/test-types/convex-api-shim.d.ts";
  if (!existsSync(join(root, shimPath))) {
    fail(`${shimPath} must exist`);
    return;
  }
  expectIncludes(shimPath, "export declare const api: any;", "Convex API shim must expose api");
  expectIncludes(shimPath, "export declare const internal: any;", "Convex API shim must expose internal");
}

function checkCommerceEventCatalog() {
  const constants = read("packages/backend/convex/events/constants.ts");
  for (const symbol of ["PRODUCT_EVENTS", "CART_EVENTS", "WISHLIST_EVENTS"]) {
    if (!constants.includes(`export const ${symbol}`)) {
      fail(`event catalog must define ${symbol}`);
    }
    if (!constants.includes(`...Object.values(${symbol})`)) {
      fail(`ALL_EVENT_CODES must include ${symbol}`);
    }
  }
}

checkDesktopDevEntrypoint();
checkDevInternalsAreFailClosed();
checkWebApiShimIsExplicit();
checkCommerceEventCatalog();

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("Admin guardrails passed.");
