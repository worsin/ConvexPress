import { createRequire } from "node:module";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const require = createRequire(import.meta.url);
const output = mkdtempSync(join(tmpdir(), "cp-authoring-preview-"));
try {
	symlinkSync(
		fileURLToPath(new URL("../node_modules", import.meta.url)),
		join(output, "node_modules"),
		"dir",
	);
	const result = await Bun.build({
		entrypoints: [
			fileURLToPath(new URL("./authoring-preview.cases.jsx", import.meta.url)),
		],
		outdir: output,
		target: "bun",
		format: "esm",
		external: ["bun:test"],
		plugins: [
			{
				name: "one-website-runtime",
				setup(build) {
					build.onResolve(
						{ filter: /^(react(?:-dom)?(?:\/.*)?|zod|jsdom)$/ },
						(args) => ({
							path: require.resolve(args.path),
							external: args.path !== "zod",
						}),
					);
					build.onLoad({ filter: /\.css$/ }, () => ({
						contents: "",
						loader: "js",
					}));
				},
			},
		],
	});
	if (!result.success) throw Error(result.logs.join("\n"));
	const tests = spawnSync(
		process.execPath,
		["test", result.outputs.find((item) => item.path.endsWith(".js")).path],
		{ encoding: "utf8" },
	);
	process.stdout.write(tests.stdout);
	process.stderr.write(tests.stderr);
	process.exitCode = tests.status ?? 1;
} finally {
	rmSync(output, { recursive: true, force: true });
}
