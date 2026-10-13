#!/usr/bin/env bun
/**
 * Offline equivalent of Convex `codegen.staticApi` for convex/_generated/api.d.ts.
 *
 * The default (dynamic) api.d.ts is `FilterApi<ApiFromModules<{ <every module>:
 * typeof import(...) }>>`. The first statement anywhere that touches `api` or
 * `internal` makes TypeScript resolve the exported function types of all
 * ~1,100 modules, which means re-checking every registration call inside that
 * single statement. That exceeds TypeScript's instantiation budget (TS2589),
 * and the errors land on whatever definitions were being resolved. ConvexPress
 * suppressed that 2,584 times.
 *
 * The static api states every function reference explicitly —
 * `FunctionReference<"query", "public", Args, Returns>` — built from each
 * function's own argument and return validators, exactly as the CLI's static
 * mode does (cli/codegen_templates/component_api.js: buildApiTree,
 * codegenApiTree, codegenFunctionReference). No inference, no cascade.
 * The CLI only produces it during a push; this produces it offline by loading
 * the modules and reading each registered function's exportArgs()/exportReturns().
 *
 * A function without a `returns` validator would get `any` as its return type.
 * This generator refuses that by default (--allow-missing-returns to report
 * instead), so a fully typed api requires every function to declare `returns`.
 *
 * Usage (from packages/backend): bun scripts/typing/generate-static-api.ts [--check] [--allow-missing-returns]
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";

const backendDir = resolve(import.meta.dir, "..", "..");
const convexDir = resolve(process.argv.find((a) => a.startsWith("--convex="))?.slice(9) ?? join(backendDir, "convex"));
const check = process.argv.includes("--check");
const allowMissingReturns = process.argv.includes("--allow-missing-returns");
const require = createRequire(join(convexDir, "..", "package.json"));
const convexPkgDir = dirname(dirname(dirname(dirname(require.resolve("convex/server")))));
const templates = join(convexPkgDir, "dist", "cjs", "cli", "codegen_templates");
const { validatorToType, parseValidator } = require(join(templates, "validator_helpers.js")) as {
  validatorToType: (validator: unknown, useIdType: boolean) => string;
  parseValidator: (validator: string | null) => { type: string } | null;
};
const { header, apiComment, compareStrings } = require(join(templates, "common.js")) as {
  header: (s: string) => string;
  apiComment: (apiName: string, type: string | undefined) => string;
  compareStrings: (a: string, b: string) => number;
};

// ─── Module discovery (Convex CLI bundler entryPoints rules) ─────────────────
const EXTENSIONS = [".js", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts", ".jsx"];
function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules") continue;
      if (full !== convexDir && existsSync(join(full, "convex.config.ts"))) continue;
      yield* walk(full);
    } else yield full;
  }
}
function modulePaths(): string[] {
  const out: string[] = [];
  for (const file of walk(convexDir)) {
    const rel = relative(convexDir, file);
    const base = file.split(sep).pop()!;
    const ext = EXTENSIONS.find((e) => rel.endsWith(e));
    if (!ext || rel.startsWith(`_generated${sep}`) || base.startsWith(".") || base.startsWith("#")) continue;
    if (base === "schema.ts" || base === "schema.js" || (base.match(/\./g) || []).length > 1 || rel.includes(" ")) continue;
    if ((ext === ".ts" || ext === ".tsx") && !/^\s{0,100}(import|export)/m.test(readFileSync(file, "utf8"))) continue;
    out.push(rel.split(sep).join("/"));
  }
  return out.sort();
}

// ─── Function analysis ───────────────────────────────────────────────────────
type Visibility = "public" | "internal";
type Analyzed = { name: string; udfType: "query" | "mutation" | "action"; visibility: Visibility; args: string; returns: string };
type RegisteredLike = {
  isQuery?: boolean; isMutation?: boolean; isAction?: boolean;
  isPublic?: boolean; isInternal?: boolean;
  exportArgs?: () => string; exportReturns?: () => string;
};

const functions = new Map<string, Analyzed[]>();
const missingReturns: string[] = [];
const missingArgs: string[] = [];
for (const modulePath of modulePaths()) {
  const mod = (await import(join(convexDir, modulePath))) as Record<string, unknown>;
  const list: Analyzed[] = [];
  for (const [name, value] of Object.entries(mod)) {
    const f = value as RegisteredLike | null;
    if (!f || (typeof f !== "object" && typeof f !== "function")) continue;
    const udfType = f.isQuery ? "query" : f.isMutation ? "mutation" : f.isAction ? "action" : null;
    if (!udfType || !f.exportArgs || !f.exportReturns) continue;
    const visibility: Visibility | null = f.isPublic ? "public" : f.isInternal ? "internal" : null;
    if (!visibility) continue;
    const args = f.exportArgs();
    const returns = f.exportReturns();
    const id = `${modulePath.replace(/\.[^.]+$/, "")}:${name}`;
    if (returns === "null") missingReturns.push(id);
    if (JSON.parse(args).type === "any") missingArgs.push(id);
    list.push({ name, udfType, visibility, args, returns });
  }
  if (list.length) functions.set(modulePath.replace(/\.[^.]+$/, ""), list);
}

if (missingReturns.length && !allowMissingReturns) {
  console.error(`${missingReturns.length} functions have no returns validator (their api type would be any):`);
  for (const id of missingReturns.slice(0, 50)) console.error(`  ${id}`);
  process.exit(1);
}

// ─── Emit (mirrors component_api.js codegenStaticApiObjects) ─────────────────
type Tree = { [key: string]: { type: "branch"; branch: Tree } | { type: "leaf"; leaf: Analyzed } };
function buildTree(visibility: Visibility): Tree {
  const root: Tree = {};
  for (const [modulePath, list] of functions) {
    for (const f of list) {
      if (f.visibility !== visibility) continue;
      let current = root;
      for (const part of modulePath.split("/")) {
        let next = current[part];
        if (!next) current[part] = next = { type: "branch", branch: {} };
        if (next.type === "leaf") throw new Error(`Ambiguous function name: ${f.name} in ${modulePath}`);
        current = next.branch;
      }
      if (current[f.name]) throw new Error(`Duplicate function name: ${f.name} in ${modulePath}`);
      current[f.name] = { type: "leaf", leaf: f };
    }
  }
  return root;
}
function reference(f: Analyzed): string {
  const argsValidator = parseValidator(f.args);
  const argsType = argsValidator ? validatorToType(argsValidator, true) : "any";
  const returnsValidator = parseValidator(f.returns);
  const returnsType = returnsValidator ? validatorToType(returnsValidator, true) : "any";
  return `FunctionReference<"${f.udfType}", "${f.visibility}", ${argsType}, ${returnsType}>`;
}
function* emitTree(tree: Tree): Generator<string> {
  yield "{";
  for (const [key, node] of Object.entries(tree).sort(([a], [b]) => compareStrings(a, b))) {
    if (node.type === "branch") {
      yield `"${key}":`;
      yield* emitTree(node.branch);
      yield ",";
    } else {
      yield `"${key}": ${reference(node.leaf)},`;
    }
  }
  yield "}";
}

const apiPath = join(convexDir, "_generated", "api.d.ts");
const existing = existsSync(apiPath) ? readFileSync(apiPath, "utf8") : "";
const componentsIdx = existing.indexOf("export declare const components");
const components = componentsIdx >= 0 ? existing.slice(componentsIdx).trimEnd() : "export declare const components: {};";
const lines = [
  header("Generated `api` utility."),
  `import type { FunctionReference } from "convex/server";`,
  `import type { GenericId as Id } from "convex/values";`,
  apiComment("api", "public"),
  "export declare const api:",
  ...emitTree(buildTree("public")),
  ";",
  apiComment("internal", "internal"),
  "export declare const internal:",
  ...emitTree(buildTree("internal")),
  ";",
  "",
  components,
  "",
];
const content = lines.join("\n");
const fnCount = [...functions.values()].reduce((n, l) => n + l.length, 0);
// The Convex CLI (codegen.staticApi) writes the same declarations formatted by
// prettier; compare independent of whitespace and trailing commas.
const normalize = (s: string) => s.replace(/\s+/g, "").replace(/,([}\]>)])/g, "$1");
if (check) {
  if (normalize(content) !== normalize(existing)) {
    console.error("static api.d.ts is stale — run bun scripts/typing/generate-static-api.ts");
    process.exit(1);
  }
  console.log(`static api.d.ts up to date (${fnCount} functions)`);
} else {
  writeFileSync(apiPath, content);
  console.log(JSON.stringify({ modules: functions.size, functions: fnCount, missingReturns: missingReturns.length, missingArgs: missingArgs.length }));
}
