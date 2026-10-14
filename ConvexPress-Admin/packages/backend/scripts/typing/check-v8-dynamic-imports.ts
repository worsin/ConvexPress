/**
 * Gate: no runtime dynamic `import()` in Convex modules that run in the default
 * V8 runtime (every module without "use node"). The V8 runtime refuses dynamic
 * imports at call time ("dynamic module import unsupported"), while unit tests
 * (Bun) allow them, so such code passes tests and fails on a deployment. Type
 * positions (`import("x").T`) are erased and allowed; "use node" modules run
 * in Node and may import dynamically.
 *
 * Usage: bun scripts/typing/check-v8-dynamic-imports.ts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = join(import.meta.dir, "../../convex");
const EXCLUDED = /(?:^|\/)(?:__tests__|_generated)(?:\/|$)|\.test\.ts$|\.d\.ts$/;

function* modules(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "node_modules") yield* modules(path);
    } else if (/\.(ts|tsx|mts)$/.test(name) && !EXCLUDED.test(relative(ROOT, path))) {
      yield path;
    }
  }
}

function usesNodeRuntime(source: ts.SourceFile): boolean {
  const first = source.statements[0];
  return Boolean(first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === "use node");
}

const findings: string[] = [];
for (const path of modules(ROOT)) {
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  if (usesNodeRuntime(source)) continue;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
      findings.push(`${relative(ROOT, path)}:${line + 1}:${character + 1} dynamic import() in a V8 module`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

if (findings.length > 0) {
  console.error(`check-v8-dynamic-imports: ${findings.length} finding(s). Use a static import, or move the code to a "use node" module.`);
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}
console.log("check-v8-dynamic-imports: no runtime dynamic imports in V8 modules");
