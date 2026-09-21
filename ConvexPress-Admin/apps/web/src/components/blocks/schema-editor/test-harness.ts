import { createRequire } from "node:module";
import { mkdtemp, readdir, rmdir, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const require = createRequire(import.meta.url);
interface BuildResolver {
	onResolve(
		options: { filter: RegExp },
		resolve: (args: { path: string }) => { path: string; external?: boolean },
	): void;
}
const runtime = (
	globalThis as unknown as {
		Bun: {
			build(options: {
				entrypoints: string[];
				outdir: string;
				target: string;
				format: string;
				external: string[];
				plugins: { name: string; setup: (build: BuildResolver) => void }[];
			}): Promise<{
				success: boolean;
				logs: unknown[];
				outputs: { path: string }[];
			}>;
		};
	}
).Bun;
/** Resolve the staged root-generated contract through the existing pinned Admin
 * dependency, without installing root dependencies or mocking its validators. */
export async function loadStaged(entry: string) {
	const output = await mkdtemp(
		fileURLToPath(new URL("../../../../.block-editor-test-", import.meta.url)),
	);
	const result = await runtime.build({
		entrypoints: [fileURLToPath(new URL(entry, import.meta.url))],
		outdir: output,
		target: "bun",
		format: "esm",
		external: [],
		plugins: [
			{
				name: "pinned-admin-zod",
				setup(build) {
					// The app's compiler-only shim has no runtime exports. DOM fixtures
					// use the real generated references, without executing any backend.
					build.onResolve({ filter: /^@backend\/convex\/_generated\/api$/ }, () => ({
						path: fileURLToPath(new URL("../../../../../../packages/backend/convex/_generated/api.js", import.meta.url)),
					}));
					build.onResolve({ filter: /^zod$/ }, () => ({
						path: require.resolve("zod"),
					}));
					build.onResolve({ filter: /^react(?:-dom)?(?:\/.*)?$/ }, (args) => ({
						path: require.resolve(args.path),
						external: true,
					}));
				},
			},
		],
	});
	if (!result.success) throw new Error(result.logs.map(String).join("\n"));
	const module = await import(result.outputs[0].path);
	return {
		module,
		cleanup: async () => {
			for (const name of await readdir(output))
				await unlink(path.join(output, name));
			await rmdir(output);
		},
	};
}
