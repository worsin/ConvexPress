import { build } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { fileURLToPath } from "node:url";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
const rootUrl = new URL("../../../../", import.meta.url);
const root = fileURLToPath(rootUrl);
const local = (path) =>
	fileURLToPath(new URL(path, rootUrl));
const moduleGraph = new Map();
const result = await build({
	configFile: false,
	root,
	logLevel: "error",
	plugins: [tsconfigPaths({ projects: [local("tsconfig.json")] }), react(), {
    name: "capture-renderer-module-graph",
    generateBundle() {
      for (const id of this.getModuleIds()) moduleGraph.set(id, this.getModuleInfo(id));
    },
  }],
	resolve: {
		alias: {
			react: local("node_modules/react"),
			"react-dom": local("node_modules/react-dom"),
			zod: local("node_modules/zod"),
		},
		dedupe: ["react", "react-dom", "zod"],
	},
	build: {
		write: false,
		minify: false,
		lib: {
			entry: fileURLToPath(
				new URL(process.argv.includes("--embedded") ? "./EmbeddedDocumentPreview.tsx" : "./CanonicalDocumentView.tsx", import.meta.url),
			),
			formats: ["es"],
			name: "CanonicalDocumentView",
		},
	},
});
const outputs = (Array.isArray(result) ? result : [result]).flatMap(
	(value) => value.output ?? [],
);
const modules = [
	...new Set(
		outputs.flatMap((output) =>
			output.type === "chunk" ? Object.keys(output.modules) : [],
		),
	),
];
const forbidden = modules.filter((path) =>
	/\/block-demo\/|\/demo-channel\.|\/packages\/backend\/convex\/|\/canonical-blocks-foundation\/server\.|\/sourceBudget\.|node:/.test(
		path,
	),
);
if (forbidden.length)
	throw new Error(
		`Forbidden production preview dependencies: ${forbidden.join(", ")}`,
	);
const renderers = modules.filter((path) =>
	/\/blocks\/[^/]+\/[^/]+\/render\.tsx$/.test(path),
);
const blockRoot = local("../../../blocks");
const expected = readdirSync(blockRoot, { withFileTypes: true })
	.filter((dir) => dir.isDirectory() && !dir.name.startsWith("."))
	.flatMap((namespace) =>
		readdirSync(join(blockRoot, namespace.name), { withFileTypes: true })
			.filter(
				(dir) =>
					dir.isDirectory() &&
					existsSync(join(blockRoot, namespace.name, dir.name, "render.tsx")),
			)
			.map((dir) => `${namespace.name}/${dir.name}`),
	)
	.sort();
const actual = renderers
	.map((path) => path.match(/\/blocks\/([^/]+\/[^/]+)\/render\.tsx$/)[1])
	.sort();
// Rollup may remove a pure re-export facade. Count it only when the compiler
// traversed that exact canonical entry and its sole target remains emitted.
const optimizedFacades = expected.filter(name => !actual.includes(name)).filter(name => {
  const path = join(blockRoot, name, "render.tsx"), info = moduleGraph.get(path);
  const source = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").trim();
  return /^export\s*\{\s*default\s*\}\s*from\s*["'][^"']+["'];?$/.test(source)
    && info?.exports.length === 1 && info.exports[0] === "default"
    && info.importedIds.length === 1 && modules.includes(info.importedIds[0]);
});
const discovered = [...actual, ...optimizedFacades].sort();
if (JSON.stringify(expected) !== JSON.stringify(discovered))
	throw new Error(
		`Production renderer module discovery differs from canonical filesystem source: ${JSON.stringify({ missing: expected.filter(name => !discovered.includes(name)), unexpected: discovered.filter(name => !expected.includes(name)), expectedCount: expected.length, actualCount: actual.length })}`,
	);
if (!modules.some((path) => path.endsWith("/installed-page-data.ts")))
	throw new Error("Shared production data installation missing");
for (const id of ["journal", "depot"])
	if (
		!modules.some((path) => path.endsWith(`/packs/${id}/parts/primitives.tsx`))
	)
		throw new Error(`Pack parts missing: ${id}`);
console.log(
	JSON.stringify({
		rendererModules: discovered.length,
    emittedRendererFacades: renderers.length,
    optimizedReexports: optimizedFacades,
		forbiddenImports: forbidden.length,
		outputWritten: false,
	}),
);
