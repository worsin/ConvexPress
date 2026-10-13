#!/usr/bin/env bun
/**
 * Adds an exact `returns` validator to every exported Convex function that
 * lacks one, derived from the handler's real return type.
 *
 * Why: a function without `returns` gets its registered type inferred from its
 * handler body. Bodies that reference `api`/`internal` make the generated
 * ApiFromModules type depend on itself, which exceeds TypeScript's
 * instantiation depth (TS2589) — ConvexPress carried 2,584 suppressions for it.
 * Measured: 646 of 1,804 functions without `returns` hit TS2589; 2 of 113 with
 * `returns` did. Return validators also enforce the output shape at runtime.
 *
 * Passes:
 *   --pass=1  analyse with `_generated/api` replaced IN MEMORY by an untyped
 *             stub (breaks the circularity so handler types are inferable).
 *             Return types containing values produced by api/internal calls come
 *             out as `any` and are deferred.
 *   --pass=2  analyse with the real generated api (regenerate it first); most
 *             functions now carry explicit `returns`, so the remaining ones
 *             infer without circularity.
 *
 * Conversion is exact or refused. Types that a Convex validator cannot express
 * exactly (any/unknown, recursion, Date/Map/Set/functions, mixed index
 * signatures) are reported, never approximated.
 *
 * Usage (from packages/backend): bun scripts/typing/infer-return-validators.ts --pass=1 [--write] [--only=path/prefix]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";

const backendDir = resolve(import.meta.dir, "..", "..");
const convexDir = join(backendDir, "convex");
const require = createRequire(join(backendDir, "package.json"));
const ts = require("typescript") as typeof import("typescript");

const args = new Map(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v ?? "true"] as const;
}));
const PASS = Number(args.get("pass") ?? "1");
const WRITE = args.get("write") === "true";
const ONLY = args.get("only");

// ─── Schema facts (table → document field names) ─────────────────────────────
type FieldType = { type: string; value?: unknown; tableName?: string };
type TableExport = { tableName: string; documentType: FieldType };
const schemaModule = (await import(join(convexDir, "schema.ts"))) as { default: { export(): string } };
const schemaExport = JSON.parse(schemaModule.default.export()) as { tables: TableExport[] };
const docFields = new Map<string, Set<string>>();
for (const t of schemaExport.tables) {
  if (t.documentType.type !== "object") continue; // union-typed tables are expanded inline
  const fields = new Set(Object.keys(t.documentType.value as Record<string, unknown>));
  fields.add("_id");
  fields.add("_creationTime");
  docFields.set(t.tableName, fields);
}

// ─── Program ─────────────────────────────────────────────────────────────────
const configPath = join(convexDir, "tsconfig.json");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath));
const apiDts = join(convexDir, "_generated", "api.d.ts");
const API_STUB = `export declare const api: any;\nexport declare const internal: any;\nexport declare const components: any;\n`;
const host = ts.createCompilerHost(parsed.options);
if (PASS === 1) {
  const readFile = host.readFile.bind(host);
  host.readFile = (f) => (resolve(f) === apiDts ? API_STUB : readFile(f));
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (f, lang, onError, create) =>
    resolve(f) === apiDts ? ts.createSourceFile(f, API_STUB, lang) : getSourceFile(f, lang, onError, create);
}
const program = ts.createProgram(parsed.fileNames, parsed.options, host);
const checker = program.getTypeChecker();

// ─── Type → validator ────────────────────────────────────────────────────────
class Refusal extends Error {}
type Ctx = { needsPagination: boolean; tableDocs: Set<string>; stack: ts.Type[] };

const isIdent = (s: string) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s);
const indent = (s: string, n: number) => s.replace(/\n/g, `\n${" ".repeat(n)}`);

function literalSource(type: ts.LiteralType): string {
  if (type.flags & ts.TypeFlags.StringLiteral) return `v.literal(${JSON.stringify(type.value)})`;
  if (type.flags & ts.TypeFlags.NumberLiteral) return `v.literal(${type.value})`;
  if (type.flags & ts.TypeFlags.BigIntLiteral) {
    const b = type.value as ts.PseudoBigInt;
    return `v.literal(${b.negative ? "-" : ""}${b.base10Value}n)`;
  }
  throw new Refusal(`unsupported literal ${checker.typeToString(type)}`);
}

function idTable(type: ts.Type): string | null {
  // Convex GenericId<T> = string & { __tableName: T }
  if (!(type.flags & ts.TypeFlags.Intersection)) return null;
  const parts = (type as ts.IntersectionType).types;
  if (!parts.some((p) => p.flags & ts.TypeFlags.String)) return null;
  for (const p of parts) {
    const tn = p.getProperty("__tableName");
    if (!tn) continue;
    const t = checker.getTypeOfSymbol(tn);
    if (t.flags & ts.TypeFlags.StringLiteral) return (t as ts.StringLiteralType).value;
  }
  return null;
}

function convert(type: ts.Type, ctx: Ctx, where: string): string {
  const f = type.flags;
  if (f & ts.TypeFlags.Any) throw new Refusal(`any at ${where}`);
  if (f & ts.TypeFlags.Unknown) throw new Refusal(`unknown at ${where}`);
  if (f & ts.TypeFlags.Never) throw new Refusal(`never at ${where}`);
  if (f & (ts.TypeFlags.Undefined | ts.TypeFlags.Void | ts.TypeFlags.Null)) return "v.null()";
  if (f & ts.TypeFlags.BooleanLiteral) return `v.literal(${checker.typeToString(type)})`;
  if (f & ts.TypeFlags.Boolean) return "v.boolean()";
  if (f & (ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral | ts.TypeFlags.BigIntLiteral)) {
    return literalSource(type as ts.LiteralType);
  }
  if (f & (ts.TypeFlags.String | ts.TypeFlags.TemplateLiteral | ts.TypeFlags.StringMapping)) return "v.string()";
  if (f & ts.TypeFlags.Number) return "v.number()";
  if (f & ts.TypeFlags.BigInt) return "v.int64()";
  if (f & ts.TypeFlags.Union) return convertUnion(type as ts.UnionType, ctx, where);
  const table = idTable(type);
  if (table) return `v.id(${JSON.stringify(table)})`;
  if (f & ts.TypeFlags.Intersection) throw new Refusal(`intersection ${checker.typeToString(type)} at ${where}`);
  if (f & ts.TypeFlags.Object) return convertObject(type as ts.ObjectType, ctx, where);
  throw new Refusal(`unsupported type ${checker.typeToString(type)} at ${where}`);
}

function convertUnion(type: ts.UnionType, ctx: Ctx, where: string): string {
  let members = type.types.filter((t) => !(t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)));
  const hadUndefined = members.length !== type.types.length;
  const hasTrue = members.some((t) => t.flags & ts.TypeFlags.BooleanLiteral && checker.typeToString(t) === "true");
  const hasFalse = members.some((t) => t.flags & ts.TypeFlags.BooleanLiteral && checker.typeToString(t) === "false");
  const parts: string[] = [];
  if (hasTrue && hasFalse) {
    parts.push("v.boolean()");
    members = members.filter((t) => !(t.flags & ts.TypeFlags.BooleanLiteral));
  }
  for (const m of members) parts.push(convert(m, ctx, where));
  if (hadUndefined && !parts.includes("v.null()")) parts.push("v.null()"); // top-level undefined returns are delivered as null
  const unique = [...new Set(parts)];
  return unique.length === 1 ? unique[0] : `v.union(${unique.join(", ")})`;
}

function propertyType(sym: ts.Symbol, at: ts.Node): ts.Type {
  return checker.getTypeOfSymbolAtLocation(sym, at);
}

function convertObject(type: ts.ObjectType, ctx: Ctx, where: string): string {
  if (checker.isArrayType(type)) {
    const [elem] = checker.getTypeArguments(type as ts.TypeReference);
    return `v.array(${convert(elem, ctx, `${where}[]`)})`;
  }
  if (checker.isTupleType(type)) {
    const elems = checker.getTypeArguments(type as ts.TypeReference).map((e, i) => convert(e, ctx, `${where}[${i}]`));
    const unique = [...new Set(elems)];
    return `v.array(${unique.length === 1 ? unique[0] : `v.union(${unique.join(", ")})`})`;
  }
  const symName = type.getSymbol()?.getName();
  if (symName === "ArrayBuffer") return "v.bytes()";
  if (["Date", "Map", "Set", "Promise", "RegExp", "Error"].includes(symName ?? "")) {
    throw new Refusal(`${symName} is not a Convex value at ${where}`);
  }
  if (type.getCallSignatures().length || type.getConstructSignatures().length) {
    throw new Refusal(`function value at ${where}`);
  }
  if (ctx.stack.includes(type)) throw new Refusal(`recursive type ${checker.typeToString(type)} at ${where}`);
  ctx.stack.push(type);
  try {
    const props = checker.getPropertiesOfType(type);
    const stringIndex = checker.getIndexInfoOfType(type, ts.IndexKind.String);
    if (stringIndex) {
      if (props.length) throw new Refusal(`object mixes properties and an index signature at ${where}`);
      return `v.record(v.string(), ${convert(stringIndex.type, ctx, `${where}[key]`)})`;
    }
    const names = props.map((p) => p.getName());
    // Whole stored document → the table's document validator.
    const idProp = props.find((p) => p.getName() === "_id");
    if (idProp && names.includes("_creationTime")) {
      const table = idTable(propertyType(idProp, idProp.valueDeclaration ?? (type.getSymbol()?.declarations?.[0] as ts.Node)));
      const fields = table ? docFields.get(table) : undefined;
      if (table && fields && fields.size === names.length && names.every((n) => fields.has(n))) {
        ctx.tableDocs.add(table);
        return `tableDocs.${isIdent(table) ? table : `[${JSON.stringify(table)}]`}`;
      }
    }
    // Convex pagination result.
    const pageKeys = new Set(["page", "isDone", "continueCursor", "splitCursor", "pageStatus"]);
    if (names.includes("page") && names.includes("isDone") && names.includes("continueCursor") && names.every((n) => pageKeys.has(n))) {
      const page = props.find((p) => p.getName() === "page")!;
      const pageType = propertyType(page, page.valueDeclaration ?? (page.declarations?.[0] as ts.Node));
      if (checker.isArrayType(pageType)) {
        const [elem] = checker.getTypeArguments(pageType as ts.TypeReference);
        ctx.needsPagination = true;
        return `paginationResultValidator(${convert(elem, ctx, `${where}.page[]`)})`;
      }
    }
    const fields = props.map((p) => {
      const decl = p.valueDeclaration ?? p.declarations?.[0];
      const pt = decl ? propertyType(p, decl) : checker.getTypeOfSymbol(p);
      const optional = (p.flags & ts.SymbolFlags.Optional) !== 0;
      let inner = pt;
      let undefinedInUnion = false;
      if (pt.flags & ts.TypeFlags.Union) {
        const rest = (pt as ts.UnionType).types.filter((t) => !(t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)));
        undefinedInUnion = rest.length !== (pt as ts.UnionType).types.length;
        if (undefinedInUnion) inner = rest.length === 1 ? rest[0] : checker.getUnionType(rest);
      }
      const name = p.getName();
      if (name.startsWith("$")) throw new Refusal(`field ${name} is not a valid Convex field at ${where}`);
      const key = isIdent(name) ? name : JSON.stringify(name);
      const val = convert(inner, ctx, `${where}.${name}`);
      return `${key}: ${optional || undefinedInUnion ? `v.optional(${val})` : val}`;
    });
    if (!fields.length) return "v.object({})";
    const oneLine = `v.object({ ${fields.join(", ")} })`;
    if (oneLine.length <= 100) return oneLine;
    return `v.object({\n  ${fields.map((x) => indent(x, 2)).join(",\n  ")},\n})`;
  } finally {
    ctx.stack.pop();
  }
}

// ─── Discovery ───────────────────────────────────────────────────────────────
const BUILDERS = new Set(["query", "mutation", "action", "internalQuery", "internalMutation", "internalAction"]);
type Edit = { pos: number; text: string };
type FileWork = { edits: Edit[]; tableDocs: Set<string>; needsPagination: boolean; sf: ts.SourceFile };
const work = new Map<string, FileWork>();
const report = { functions: 0, withReturns: 0, generated: 0, refused: [] as string[] };

function handlerOf(obj: ts.ObjectLiteralExpression): ts.SignatureDeclaration | null {
  for (const p of obj.properties) {
    if (!p.name || p.name.getText() !== "handler") continue;
    if (ts.isMethodDeclaration(p)) return p;
    if (ts.isPropertyAssignment(p)) {
      const init = p.initializer;
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return init;
      const sym = checker.getSymbolAtLocation(init);
      const decl = sym?.valueDeclaration;
      if (decl && (ts.isFunctionDeclaration(decl) || (ts.isVariableDeclaration(decl) && decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))))) {
        return ts.isFunctionDeclaration(decl) ? decl : (decl.initializer as ts.ArrowFunction);
      }
    }
  }
  return null;
}

for (const sf of program.getSourceFiles()) {
  const file = resolve(sf.fileName);
  if (!file.startsWith(convexDir + "/") || file.includes("/_generated/") || file.includes("/node_modules/")) continue;
  if (/\.(test|spec)\.tsx?$/.test(file) || file.includes("/__tests__/")) continue;
  const rel = relative(convexDir, file);
  if (ONLY && !rel.startsWith(ONLY)) continue;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && BUILDERS.has(node.expression.text)) {
      const obj = node.arguments[0];
      if (obj && ts.isObjectLiteralExpression(obj)) {
        const names = obj.properties.map((p) => p.name?.getText());
        if (names.includes("handler")) {
          report.functions++;
          if (names.includes("returns")) {
            report.withReturns++;
          } else {
            const handler = handlerOf(obj);
            const owner = ts.isVariableDeclaration(node.parent) ? node.parent.name.getText() : "(anonymous)";
            const id = `${rel}:${owner}`;
            try {
              if (!handler) throw new Refusal("handler not found");
              const sig = checker.getSignatureFromDeclaration(handler);
              if (!sig) throw new Refusal("no signature");
              const ret = checker.getReturnTypeOfSignature(sig);
              const awaited = checker.getAwaitedType(ret) ?? ret;
              const ctx: Ctx = { needsPagination: false, tableDocs: new Set(), stack: [] };
              const src = convert(awaited, ctx, "return");
              const handlerProp = obj.properties.find((p) => p.name?.getText() === "handler")!;
              const lineStart = sf.text.lastIndexOf("\n", handlerProp.getStart(sf)) + 1;
              const pad = sf.text.slice(lineStart, handlerProp.getStart(sf));
              // Insert above any comments attached to `handler:` (e.g. a
              // @ts-expect-error that must keep applying to the handler line).
              const comments = ts.getLeadingCommentRanges(sf.text, handlerProp.getFullStart()) ?? [];
              const anchor = comments.length ? comments[0].pos : handlerProp.getStart(sf);
              const anchorLineStart = sf.text.lastIndexOf("\n", anchor) + 1;
              const insertAt = /^\s*$/.test(sf.text.slice(anchorLineStart, anchor)) ? anchorLineStart : anchor;
              const prefix = insertAt === anchorLineStart ? pad : "";
              const w = work.get(file) ?? { edits: [], tableDocs: new Set<string>(), needsPagination: false, sf };
              w.edits.push({ pos: insertAt, text: `${prefix}returns: ${indent(src, pad.length)},\n${insertAt === anchorLineStart ? "" : pad}` });
              for (const t of ctx.tableDocs) w.tableDocs.add(t);
              w.needsPagination ||= ctx.needsPagination;
              work.set(file, w);
              report.generated++;
            } catch (e) {
              if (!(e instanceof Refusal)) throw e;
              report.refused.push(`${id}: ${e.message}`);
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// ─── Apply ───────────────────────────────────────────────────────────────────
function ensureImports(text: string, file: string, w: FileWork): string {
  const additions: string[] = [];
  const hasV = /import\s*\{[^}]*\bv\b[^}]*\}\s*from\s*["']convex\/values["']/.test(text);
  if (!hasV) additions.push(`import { v } from "convex/values";`);
  if (w.needsPagination && !/\bpaginationResultValidator\b/.test(text.split("\n").filter((l) => l.startsWith("import")).join("\n"))) {
    additions.push(`import { paginationResultValidator } from "convex/server";`);
  }
  if (w.tableDocs.size && !/\btableDocs\b/.test(text.split("\n").filter((l) => l.startsWith("import")).join("\n"))) {
    let r = relative(dirname(file), join(convexDir, "schema", "tableDocs.generated")).split("\\").join("/");
    if (!r.startsWith(".")) r = `./${r}`;
    additions.push(`import { tableDocs } from "${r}";`);
  }
  if (!additions.length) return text;
  // After the last top-level import statement.
  const imports = [...text.matchAll(/^import[\s\S]*?from\s*["'][^"']+["'];?\s*$/gm)];
  const at = imports.length ? imports[imports.length - 1].index! + imports[imports.length - 1][0].length : 0;
  return `${text.slice(0, at)}\n${additions.join("\n")}${text.slice(at)}`;
}

if (WRITE) {
  for (const [file, w] of work) {
    let text = w.sf.text;
    for (const e of [...w.edits].sort((a, b) => b.pos - a.pos)) text = text.slice(0, e.pos) + e.text + text.slice(e.pos);
    text = ensureImports(text, file, w);
    writeFileSync(file, text);
  }
}

const refusalKinds = new Map<string, number>();
for (const r of report.refused) {
  const kind = r.replace(/^[^:]+:[^:]+: /, "").replace(/ at .*$/, "").replace(/\s.*$/, "");
  refusalKinds.set(kind, (refusalKinds.get(kind) ?? 0) + 1);
}
console.log(JSON.stringify({
  pass: PASS,
  write: WRITE,
  functions: report.functions,
  alreadyHadReturns: report.withReturns,
  generated: report.generated,
  refused: report.refused.length,
  refusalKinds: Object.fromEntries([...refusalKinds].sort((a, b) => b[1] - a[1])),
  tableDocsUsed: [...new Set([...work.values()].flatMap((w) => [...w.tableDocs]))].length,
}, null, 2));
writeFileSync(join(backendDir, "scripts", "typing", `refused-pass${PASS}.txt`), `${report.refused.join("\n")}\n`);
