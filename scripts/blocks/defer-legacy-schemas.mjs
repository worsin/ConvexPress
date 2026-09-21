import { createRequire } from "node:module";
const require = createRequire(
	new URL("../../ConvexPress-Admin/package.json", import.meta.url),
);
const ts = require("typescript");

// Preserve original validator expressions and refinements. Each closed bundle
// contains schema declarations and pure helpers only. Conservatively retain all
// top-level bindings referenced by the requested exports, including references
// inside refinements. Unrelated schemas must not allocate in a migration call.
export function deferLegacyModule(source, factory, expected) {
	const ast = ts.createSourceFile(
		"legacy.mjs",
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.JS,
	);
	const imports = [],
		bindings = new Map(),
		exports = [];
	for (const node of ast.statements) {
		if (ts.isImportDeclaration(node)) {
			if (
				node.moduleSpecifier.text !== "zod" ||
				node.importClause?.name ||
				!node.importClause?.namedBindings ||
				!ts.isNamedImports(node.importClause.namedBindings)
			)
				throw Error("Unexpected legacy runtime import");
			imports.push(
				`const {${node.importClause.namedBindings.elements.map((item) => `${item.propertyName?.text ?? item.name.text}:${item.name.text}`).join(",")}}=legacyZod;`,
			);
		} else if (ts.isExportDeclaration(node)) {
			if (
				node.moduleSpecifier ||
				!node.exportClause ||
				!ts.isNamedExports(node.exportClause)
			)
				throw Error("Unexpected legacy export");
			for (const item of node.exportClause.elements)
				exports.push([
					item.name.text,
					item.propertyName?.text ?? item.name.text,
				]);
		} else if (ts.isVariableStatement(node)) {
			for (const declaration of node.declarationList.declarations) {
				if (!ts.isIdentifier(declaration.name))
					throw Error("Unexpected destructured legacy declaration");
				bindings.set(declaration.name.text, {
					node: declaration.initializer,
					text: `var ${declaration.getText(ast)};`,
				});
			}
		} else if (ts.isFunctionDeclaration(node) && node.name) {
			bindings.set(node.name.text, { node, text: node.getText(ast) });
		} else
			throw Error(
				`Unexpected legacy initialization statement: ${node.getText(ast).slice(0, 80)}`,
			);
	}
	if (
		JSON.stringify(exports.map(([name]) => name).sort()) !==
		JSON.stringify(expected)
	)
		throw Error("Legacy export surface changed");
	const needed = new Set();
	function retain(name) {
		if (needed.has(name) || !bindings.has(name)) return;
		needed.add(name);
		function visit(node) {
			if (!node) return;
			if (ts.isIdentifier(node)) retain(node.text);
			ts.forEachChild(node, visit);
		}
		visit(bindings.get(name).node);
	}
	for (const [, name] of exports) {
		if (!bindings.has(name)) throw Error("Missing legacy export binding");
		retain(name);
	}
	const body = [...bindings]
		.filter(([name]) => needed.has(name))
		.map(([, item]) => item.text);
	return `let ${factory}Cache;\nfunction ${factory}(){if(${factory}Cache)return ${factory}Cache;\n${imports.join("\n")}\n${body.join("\n")}\nreturn ${factory}Cache={${exports.map(([name, value]) => `${name}:${value}`).join(",")}};}`;
}
