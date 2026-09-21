/** Source coverage is conservative: unresolved database writers must use an explicit hook. */
import ts from "typescript";
const operations = new Set(["insert", "patch", "replace", "delete"]);
function unwrap(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node))) node = node.expression;
  return node;
}
function member(node) {
  node = unwrap(node);
  if (ts.isPropertyAccessExpression(node)) return { object: node.expression, name: node.name.text };
  if (ts.isElementAccessExpression(node)) return { object: node.expression, name: ts.isStringLiteral(node.argumentExpression) ? node.argumentExpression.text : null };
  return null;
}
function enclosingFunction(node) {
  let insideFunction = false;
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isArrowFunction(parent) || ts.isFunctionExpression(parent)) insideFunction = true;
    if (ts.isFunctionDeclaration(parent) && parent.name) return parent.name.text;
    if (insideFunction && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name) && parent.initializer && (ts.isCallExpression(parent.initializer) || ts.isArrowFunction(parent.initializer) || ts.isFunctionExpression(parent.initializer))) return parent.name.text;
  }
  return null;
}
export function inspectMediaWriters(source, { fileName, ownerTables, trustedFunctions = [] }) {
  const ast = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const aliases = new Set(["db"]);
  const owners = new Set(ownerTables), trusted = new Set(trustedFunctions);
  function isDatabase(node) {
    node = unwrap(node);
    if (!node) return false;
    if (ts.isIdentifier(node)) return aliases.has(node.text);
    return member(node)?.name === "db";
  }
  // Resolve chains without depending on declaration order. Shadowing may cause a
  // conservative refusal; it cannot hide a database operation.
  let changed;
  do {
    changed = false;
    function visit(node) {
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left) && isDatabase(node.right) && !aliases.has(node.left.text)) { aliases.add(node.left.text); changed = true; }
      if (ts.isVariableDeclaration(node) && node.initializer) {
        if (ts.isIdentifier(node.name) && isDatabase(node.initializer) && !aliases.has(node.name.text)) { aliases.add(node.name.text); changed = true; }
        if (ts.isObjectBindingPattern(node.name)) for (const element of node.name.elements) {
          const key = element.propertyName?.getText(ast) ?? element.name.getText(ast);
          if (key === "db" && ts.isIdentifier(element.name) && !aliases.has(element.name.text)) { aliases.add(element.name.text); changed = true; }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  } while (changed);
  const writes = [];
  function record(node, operation, table, reason) {
    const functionName = enclosingFunction(node);
    const isTrusted = trusted.has(functionName);
    writes.push({ fileName, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1, functionName, operation, table, reason: isTrusted ? null : reason, trusted: isTrusted, source: node.getText(ast) });
  }
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const callee = member(node.expression);
      if (callee && isDatabase(callee.object) && (callee.name === null || operations.has(callee.name))) {
        const operation = callee.name;
        const explicitTable = operation === "insert" || (operation === "delete" ? node.arguments.length === 2 : node.arguments.length === 3);
        const table = explicitTable && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) ? node.arguments[0].text : null;
        record(node, operation, table, operation === null ? "dynamic-database-method" : table === null ? "unresolved-database-write" : owners.has(table) ? "raw-owner-write" : null);
      }
    }
    const access = member(node);
    if (isDatabase(node)) {
      const parent = node.parent;
      const escapes = ts.isReturnStatement(parent) || ts.isSpreadAssignment(parent) || ts.isSpreadElement(parent) || ts.isYieldExpression(parent) || ts.isArrayLiteralExpression(parent) || ts.isPropertyAssignment(parent) && parent.initializer === node || ts.isCallExpression(parent) && parent.arguments.includes(node);
      if (escapes) record(node, null, null, "escaped-database-object");
    }
    if (access && isDatabase(access.object) && operations.has(access.name) && !(ts.isCallExpression(node.parent) && node.parent.expression === node)) {
      record(node, access.name, null, "captured-database-method");
    }
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && isDatabase(node.initializer)) {
      for (const element of node.name.elements) {
        const operation = element.propertyName?.getText(ast) ?? element.name.getText(ast);
        if (operations.has(operation)) record(element, operation, null, "captured-database-method");
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return { writes, violations: writes.filter(write => write.reason !== null) };
}
