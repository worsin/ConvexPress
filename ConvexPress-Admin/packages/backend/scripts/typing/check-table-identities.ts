#!/usr/bin/env bun
/**
 * Table identities must be typed as table names.
 *
 * A value that names a table (`"posts"`, `"commerce_products"`, ...) has to be
 * typed as `TableNames` from convex/_generated/dataModel or a narrower union of
 * table names. A host application that embeds ConvexPress under renamed tables
 * (for example `posts` -> `acme_posts`) renames the literals the type checker
 * proves are table names, and only those. A table identity carried as plain
 * `string` keeps the old name in the host build: comparisons silently never
 * match and table-keyed maps silently find nothing.
 *
 * This gate reports a string literal whose text is a schema table name when it
 * appears
 *   (a) as an operand of `===`, `!==`, `==`, `!=`, or as a `case` label, while
 *       the other side's DECLARED type admits arbitrary strings (`string`,
 *       `any`, `unknown`, or a union containing one of them). A closed literal
 *       union is fine: either it is a table union, or it explicitly declares a
 *       domain of kinds whose members merely share a word with a table;
 *   (b) as an argument to a parameter whose name matches /table/i and whose
 *       declared type admits arbitrary strings;
 *   (c) as the value of an object property whose name matches /table/i and
 *       whose declared type admits arbitrary strings;
 *   (d) as a key of an object literal whose keys are ALL table names (two or
 *       more) while the object has no contextual type or a contextual type
 *       with a string index signature (`Record<string, X>`). Give such maps a
 *       table-keyed type, e.g. `satisfies Partial<Record<TableNames, X>>`.
 *       Schema table maps (`{ posts: defineTable(...) }`) define TableNames
 *       and are exempt.
 *
 * Rules (b) and (c) apply to ConvexPress's own declarations; framework APIs
 * that take a table name as `string` (`v.id`, query option objects) are table
 * positions by convention. Tests and convex/_generated are not checked (a host
 * does not port them).
 *
 * Usage (from packages/backend): bun scripts/typing/check-table-identities.ts
 * (`--convex=<dir>` checks another Convex directory; its allowlist is empty).
 */
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

export type Rule = "comparison" | "argument" | "property" | "key";
export type Finding = { file: string; line: number; column: number; literal: string; rule: Rule; subject: string; detail: string };

/** Every table-name literal at an untyped table position under `convexDir` (before the allowlist). */
export function findUntypedTableIdentities(convexDir: string): { tables: number; findings: Finding[] } {
  const configPath = join(convexDir, "tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath));
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const checker = program.getTypeChecker();

  /** The schema's table names, read from the generated data model's `TableNames`. */
  function schemaTableNames(): Set<string> {
    const dataModel = program.getSourceFile(join(convexDir, "_generated", "dataModel.d.ts"));
    if (!dataModel) throw new Error("convex/_generated/dataModel.d.ts is not part of the program; run Convex codegen.");
    const moduleSymbol = checker.getSymbolAtLocation(dataModel);
    const symbol = moduleSymbol && checker.getExportsOfModule(moduleSymbol).find((s) => s.name === "TableNames");
    if (!symbol) throw new Error("convex/_generated/dataModel.d.ts does not export TableNames.");
    const type = checker.getDeclaredTypeOfSymbol(symbol);
    const names = (type.isUnion() ? type.types : [type]).flatMap((t) => (t.isStringLiteral() ? [t.value] : []));
    if (names.length < 2) throw new Error(`TableNames resolved to ${names.length} literal(s); the data model is not readable.`);
    return new Set(names);
  }
  const tables = schemaTableNames();

  /** True when values of this type are not limited to a closed set of string literals. */
  function admitsArbitraryString(type: ts.Type, depth = 0): boolean {
    if (depth > 6) return false;
    if (type.flags & (ts.TypeFlags.String | ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TemplateLiteral | ts.TypeFlags.StringMapping)) return true;
    if (type.flags & ts.TypeFlags.TypeParameter) {
      // The DECLARED constraint: `T extends TableNamesInDataModel<DataModel>` is a
      // table position even though its base constraint widens to `string`.
      const declaration = type.symbol?.declarations?.find(ts.isTypeParameterDeclaration);
      return !declaration?.constraint || admitsArbitraryString(checker.getTypeFromTypeNode(declaration.constraint), depth + 1);
    }
    if (type.isUnionOrIntersection()) return type.isUnion() ? type.types.some((t) => admitsArbitraryString(t, depth + 1)) : type.types.every((t) => admitsArbitraryString(t, depth + 1));
    return false;
  }

  /** The declared (not flow-narrowed) type of a comparison operand. */
  function declaredTypeOf(expression: ts.Expression): ts.Type {
    let target: ts.Expression = expression;
    while (ts.isParenthesizedExpression(target) || ts.isNonNullExpression(target) || ts.isAsExpression(target) || ts.isSatisfiesExpression(target)) target = target.expression;
    if (ts.isPropertyAccessExpression(target)) {
      const symbol = checker.getSymbolAtLocation(target.name);
      if (symbol) return checker.getTypeOfSymbol(symbol);
    } else if (ts.isIdentifier(target)) {
      const symbol = checker.getSymbolAtLocation(target);
      const declaration = symbol?.valueDeclaration;
      if (declaration && (ts.isParameter(declaration) || ts.isVariableDeclaration(declaration) || ts.isPropertyDeclaration(declaration)) && declaration.type) return checker.getTypeFromTypeNode(declaration.type);
      if (symbol) return checker.getTypeOfSymbol(symbol);
    }
    return checker.getTypeAtLocation(expression);
  }

  const ownSource = (node: ts.Node) => node.getSourceFile().fileName.startsWith(`${convexDir}/`);

  /** The parameter declaration (name and declared type) an argument binds to. */
  function declaredParameter(argument: ts.Expression, call: ts.CallExpression | ts.NewExpression): { name: string; type: ts.Type } | null {
    const index = call.arguments?.indexOf(argument) ?? -1;
    if (index < 0) return null;
    const declaration = checker.getResolvedSignature(call)?.declaration;
    // Only ConvexPress's own functions. Framework APIs that take a table name
    // (`v.id(tableName: string)`, ...) are table positions by convention.
    if (!declaration || ts.isJSDocSignature(declaration) || !declaration.parameters.length || !ownSource(declaration)) return null;
    const parameter = declaration.parameters[Math.min(index, declaration.parameters.length - 1)];
    if (!parameter || (index >= declaration.parameters.length && !parameter.dotDotDotToken)) return null;
    const name = ts.isIdentifier(parameter.name) ? parameter.name.text : null;
    if (!name) return null;
    if (!parameter.type) return { name, type: checker.getTypeAtLocation(parameter) };
    const typeNode = parameter.dotDotDotToken && ts.isArrayTypeNode(parameter.type) ? parameter.type.elementType : parameter.type;
    return { name, type: checker.getTypeFromTypeNode(typeNode) };
  }

  /**
   * Declared types of a property across every member of the object's contextual
   * type; null when the property belongs to a framework API's option object
   * (`{ table: "posts" }`), which is a table position by convention.
   */
  function declaredPropertyTypes(object: ts.ObjectLiteralExpression, name: string): ts.Type[] | null {
    const contextual = checker.getContextualType(object);
    if (!contextual) return [];
    const types: ts.Type[] = [];
    for (const part of contextual.isUnion() ? contextual.types : [contextual]) {
      const property = checker.getPropertyOfType(part, name);
      if (property) {
        const declaration = property.declarations?.[0];
        if (declaration && !ownSource(declaration)) return null;
        types.push(declaration && (ts.isPropertySignature(declaration) || ts.isPropertyDeclaration(declaration)) && declaration.type ? checker.getTypeFromTypeNode(declaration.type) : checker.getTypeOfSymbol(property));
      } else {
        const index = checker.getIndexInfoOfType(part, ts.IndexKind.String);
        if (index) types.push(index.type);
      }
    }
    return types;
  }

  function propertyKey(name: ts.PropertyName): string | null {
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name) || ts.isNumericLiteral(name)) return name.text;
    return null;
  }

  /**
   * A schema table map (`{ posts: defineTable(...), ... }`) defines the table
   * names; every value is a Convex TableDefinition. Its keys are table names by
   * construction (TableNames is derived from them), so they cannot be typed further.
   */
  function isTableDefinitionMap(object: ts.ObjectLiteralExpression): boolean {
    return object.properties.every((property) => {
      if (!ts.isPropertyAssignment(property)) return false;
      const symbol = checker.getTypeAtLocation(property.initializer).getSymbol();
      return symbol?.getName() === "TableDefinition" && !!symbol.declarations?.some((declaration) => !ownSource(declaration));
    });
  }

  /** Whether the keys of an object literal are constrained by a closed (non-index) type. */
  function hasClosedKeyType(object: ts.ObjectLiteralExpression): boolean {
    const contextual = checker.getContextualType(object);
    if (!contextual) return false;
    const parts = (contextual.isUnion() ? contextual.types : [contextual]).filter((t) => !(t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)));
    return parts.length > 0 && parts.every((part) => !(part.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) && !checker.getIndexInfoOfType(part, ts.IndexKind.String));
  }

  const isTest = (file: string) => /\.(test|spec)\.tsx?$/.test(file) || /\.test-support\.tsx?$/.test(file) || file.includes("/__tests__/");
  const findings: Finding[] = [];
  const describe = (type: ts.Type) => checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation).slice(0, 120);

  for (const sourceFile of program.getSourceFiles()) {
    const fileName = sourceFile.fileName;
    if (!fileName.startsWith(`${convexDir}/`) || fileName.includes("/_generated/") || fileName.includes("/node_modules/") || isTest(fileName)) continue;
    const file = relative(convexDir, fileName);
    const report = (node: ts.Node, literal: string, rule: Rule, subject: string, detail: string) => {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      findings.push({ file, line: line + 1, column: character + 1, literal, rule, subject, detail });
    };
    const visit = (node: ts.Node): void => {
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && tables.has(node.text)) {
        const parent = node.parent;
        if (ts.isBinaryExpression(parent) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(parent.operatorToken.kind)) {
          const other = parent.left === node ? parent.right : parent.left;
          const type = declaredTypeOf(other);
          if (!ts.isStringLiteralLike(other) && admitsArbitraryString(type)) report(node, node.text, "comparison", other.getText(sourceFile), `compared with \`${other.getText(sourceFile).slice(0, 60)}\` declared as ${describe(type)}`);
        } else if (ts.isCaseClause(parent) && parent.expression === node) {
          const subject = parent.parent.parent.expression;
          const type = declaredTypeOf(subject);
          if (admitsArbitraryString(type)) report(node, node.text, "comparison", subject.getText(sourceFile), `case of \`switch (${subject.getText(sourceFile).slice(0, 60)})\` declared as ${describe(type)}`);
        } else if ((ts.isCallExpression(parent) || ts.isNewExpression(parent)) && parent.arguments?.includes(node)) {
          const parameter = declaredParameter(node, parent);
          if (parameter && /table/i.test(parameter.name) && admitsArbitraryString(parameter.type)) report(node, node.text, "argument", parameter.name, `passed to parameter \`${parameter.name}\` declared as ${describe(parameter.type)}`);
        } else if (ts.isPropertyAssignment(parent) && parent.initializer === node && ts.isObjectLiteralExpression(parent.parent)) {
          const name = propertyKey(parent.name);
          if (name && /table/i.test(name)) {
            const types = declaredPropertyTypes(parent.parent, name);
            if (types && (!types.length || types.some((type) => admitsArbitraryString(type)))) report(node, node.text, "property", name, `property \`${name}\` declared as ${types.length ? types.map(describe).join(" | ") : "(no contextual type)"}`);
          }
        }
      } else if (ts.isObjectLiteralExpression(node)) {
        const keyed = node.properties.filter((p) => ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p) || ts.isMethodDeclaration(p));
        const tableKeys = keyed.flatMap((property) => {
          const key = property.name ? propertyKey(property.name) : null;
          return key !== null && tables.has(key) ? [{ node: property, key }] : [];
        });
        if (tableKeys.length >= 2 && tableKeys.length === keyed.length && !hasClosedKeyType(node) && !isTableDefinitionMap(node)) {
          const contextual = checker.getContextualType(node);
          for (const { node: property, key } of tableKeys) report(property, key, "key", key, `key of an object whose keys are all table names, typed ${contextual ? describe(contextual) : "(no contextual type)"}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return { tables: tables.size, findings };
}

/**
 * Literals that are deliberately NOT table identities although their text is a
 * table name. Prefer giving such values a closed literal type of their own (a
 * union of kinds is not reported); list them here only when the value is a
 * genuinely open string. Each entry matches the literal in that file under the
 * named rule; an entry that matches nothing fails the gate, so this list cannot
 * go stale.
 */
type AllowlistEntry = {
  file: string;
  literal: string;
  rule: Rule;
  /** The other operand / switch subject (comparison), parameter (argument) or property name. */
  subject: string;
  reason: string;
};
const allowlist: readonly AllowlistEntry[] = [
  {
    file: "contentPromotion/exporter.ts", literal: "roles", rule: "comparison", subject: "field",
    reason: "an authored record's field name (a list of role slugs), iterated from Object.entries; not the roles table",
  },
  {
    file: "extensions/forms/mergeTags.ts", literal: "settings", rule: "comparison", subject: "namespace",
    reason: "the `{settings:...}` merge-tag namespace parsed from an email template; not the settings table",
  },
];

if (import.meta.main) {
  const backendDir = resolve(import.meta.dir, "..", "..");
  const defaultDir = join(backendDir, "convex");
  const convexDir = resolve(process.argv.find((a) => a.startsWith("--convex="))?.slice(9) ?? defaultDir);
  const entries = convexDir === defaultDir ? allowlist : [];
  const { tables, findings } = findUntypedTableIdentities(convexDir);
  const used = new Set<number>();
  const unallowed = findings.filter((finding) => {
    const index = entries.findIndex((entry) => entry.file === finding.file && entry.literal === finding.literal && entry.rule === finding.rule && entry.subject === finding.subject);
    if (index < 0) return true;
    used.add(index);
    return false;
  });
  const stale = entries.filter((_, index) => !used.has(index));
  for (const finding of unallowed) console.error(`${finding.file}:${finding.line}:${finding.column}: "${finding.literal}" (${finding.rule}) ${finding.detail}`);
  for (const entry of stale) console.error(`check-table-identities: allowlist entry matches nothing; remove it: ${entry.file} "${entry.literal}" (${entry.rule})`);
  if (unallowed.length || stale.length) {
    console.error(`\ncheck-table-identities: ${unallowed.length} table-name literal(s) at untyped table positions${stale.length ? `, ${stale.length} stale allowlist entr${stale.length === 1 ? "y" : "ies"}` : ""}.`);
    console.error("Type each table identity as TableNames (convex/_generated/dataModel) or a narrower union of table names; see the header of scripts/typing/check-table-identities.ts.");
    process.exit(1);
  }
  console.log(`check-table-identities: ${tables} tables; every table-name literal is at a typed table position (${entries.length} allowlisted).`);
}
