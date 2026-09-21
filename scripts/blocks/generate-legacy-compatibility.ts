/** Build-time-only schema preservation. No legacy renderer/registry enters the
 * deployed graph, and no schema refinement is translated or dropped. */
import { readFile, readdir, mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { legacyInventory, ROOT } from "./migrate-existing";
import { deferLegacyModule } from "./defer-legacy-schemas.mjs";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const output = path.join(
	ROOT,
	"ConvexPress-Admin/packages/backend/canonical-blocks-foundation/compatibility",
);
export async function buildLegacyCompatibility() {
	const inventory = (await legacyInventory()).sort((a, b) =>
		a.name.localeCompare(b.name),
	);
	const catalog = "ConvexPress-Admin/packages/blocks-catalog/src/generated";
	const allowed = new Set(
		(await readdir(path.join(ROOT, catalog)))
			.filter((name) => name.endsWith(".ts"))
			.map((name) => path.join(ROOT, catalog, name)),
	);
	const sectionSource =
		"ConvexPress-Website/apps/web/src/lib/blocks/page-sections.ts";
	allowed.add(path.join(ROOT, sectionSource));
	const linkSource = "ConvexPress-Website/apps/web/src/lib/security/url.ts";
	allowed.add(path.join(ROOT, linkSource));
	const descriptors: Record<string, unknown> = {},
		hashes: Record<string, string> = {};
	const loaded = new Set<string>(),
		factories: string[] = [],
		entries: string[] = [];
	const catalogExports: Array<{ file: string; name: string; value: unknown }> =
		[];
	for (const file of allowed) {
		if (
			!file.startsWith(path.join(ROOT, catalog)) ||
			file.endsWith("/definitions.ts")
		)
			continue;
		const symbols = await import(pathToFileURL(file).href);
		for (const [name, value] of Object.entries(symbols))
			catalogExports.push({ file, name, value });
	}
	async function bundle(source: string, factory: string, expected: string[]) {
		const entry = path.join(
			ROOT,
			`scripts/blocks/.legacy-compatibility-${factory}.ts`,
		);
		await writeFile(entry, source, { flag: "wx" });
		try {
			const build = await Bun.build({
				entrypoints: [entry],
				target: "browser",
				format: "esm",
				external: ["zod"],
				minify: false,
				sourcemap: "none",
				plugins: [
					{
						name: "closed-legacy-schema-inputs",
						setup(builder) {
							builder.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async (args) => {
								if (args.path !== entry && !allowed.has(args.path))
									throw Error(
										`Legacy compatibility attempted an undeclared module: ${path.relative(ROOT, args.path)}`,
									);
								if (args.path !== entry) loaded.add(args.path);
								if (args.path === entry) return undefined;
								return undefined;
							});
						},
					},
				],
			});
			if (!build.success || build.outputs.length !== 1)
				throw Error(
					build.logs.map((log) => log.message).join("\n") ||
						"Legacy schema bundle failed",
				);
			return deferLegacyModule(
				await build.outputs[0].text(),
				factory,
				expected,
			);
		} finally {
			await unlink(entry);
		}
	}
	for (const block of inventory) {
		const websitePath = block.source.replace(
			/^ConvexPress-Admin\//,
			"ConvexPress-Website/",
		);
		const symbols = Object.entries(
			await import(pathToFileURL(path.join(ROOT, websitePath)).href),
		)
			.filter(([, value]) => value === block.websiteSchema)
			.map(([name]) => name);
		const saved = catalogExports.filter((item) => item.value === block.schema);
		if (!block.websiteSchema || symbols.length !== 1 || saved.length !== 1)
			throw Error(`No unique actual schema pair for ${block.name}`);
		allowed.add(path.join(ROOT, websitePath));
		const specPath = `blocks/${block.name}/block.json`,
			spec = JSON.parse(await readFile(path.join(ROOT, specPath), "utf8"));
		if (
			!Number.isSafeInteger(block.metadata?.version) ||
			(spec.migration?.fromVersion ?? spec.version) !== block.metadata.version
		)
			throw Error(`Undeclared legacy version transition: ${block.name}`);
		const descriptor = {
			name: block.name,
			fromVersion: block.metadata.version,
			toVersion: spec.version,
			transforms: spec.migration?.transforms ?? [],
			treatments: (spec.treatments ?? []).map((item: any) => ({
				name: item.name,
				axes: item.axes.map((axis: any) => axis.id),
			})),
		};
		descriptors[block.name] = descriptor;
		const factory = `loadSchemas${factories.length}`;
		factories.push(
			await bundle(
				`export {${saved[0].name} as savedSchema} from ${JSON.stringify(saved[0].file)};\nexport {${symbols[0]} as renderedSchema} from ${JSON.stringify(path.join(ROOT, websitePath))};`,
				factory,
				["renderedSchema", "savedSchema"],
			),
		);
		entries.push(
			`${JSON.stringify(block.name)}:{...${JSON.stringify(descriptor)},get savedSchema(){return ${factory}().savedSchema;},get renderedSchema(){return ${factory}().renderedSchema;}}`,
		);
		for (const file of [block.source, websitePath, specPath])
			hashes[file] = sha(await readFile(path.join(ROOT, file), "utf8"));
	}
	factories.push(
		await bundle(
			`export { sanitizeHref as legacySanitizeHref, isExternalUrl as legacyIsExternalUrl } from "../../${linkSource}";export { pageSectionsToBlocks } from "../../${sectionSource}";`,
			"loadHelpers",
			["legacyIsExternalUrl", "legacySanitizeHref", "pageSectionsToBlocks"],
		),
	);
	for (const file of [...allowed].sort())
		hashes[path.relative(ROOT, file)] = sha(await readFile(file, "utf8"));
	let code = `import * as legacyZod from 'zod';\n${factories.join("\n")}\nexport const legacyCompatibility={${entries.join(",\n")}};\nexport function legacySanitizeHref(...args){return loadHelpers().legacySanitizeHref(...args); }\nexport function legacyIsExternalUrl(...args){return loadHelpers().legacyIsExternalUrl(...args); }\nexport function pageSectionsToBlocks(...args){return loadHelpers().pageSectionsToBlocks(...args); }\n`;
	// Bundler comments may identify source files but may not make the artifact
	// depend on a particular checkout's absolute pathname.
	code = code
		.split("\n")
		.map((line) =>
			line.startsWith("// ") ? line.replaceAll(ROOT + path.sep, "") : line,
		)
		.join("\n");
	for (const match of code.matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/g))
		if (match[1] !== "zod")
			throw Error(`Nonportable legacy schema import: ${match[1]}`);
	if (/\b(?:eval|Function|require)\s*\(|\b(?:process|Bun)\s*[.\[]/.test(code))
		throw Error(
			"Legacy compatibility bundle contains a runtime evaluator or host dependency",
		);
	const declaration = `// Generated; schemas retain their original Zod refinements and defaults.\nimport type { z } from "zod";\nexport type LegacyTransform = {kind:"empty-to-null"|"pack-treatment";path:readonly string[]} | {kind:"text-to-richtext";path:readonly string[];mode:"plain-prose"|"markdown-prose"|"plain-inline"|"markdown-inline"};\nexport type LegacyCompatibility = {name:string;fromVersion:number;toVersion:number;transforms:readonly LegacyTransform[];treatments:readonly {name:string;axes:readonly string[]}[];savedSchema:z.ZodType;renderedSchema:z.ZodType};\nexport const legacyCompatibility: Readonly<Record<string, LegacyCompatibility>>;\nexport function legacySanitizeHref(value: string | null | undefined): string | undefined;\nexport function legacyIsExternalUrl(href: string): boolean;\nexport function pageSectionsToBlocks(sections: Array<{id:string;type:string;data:Record<string,unknown>}>): unknown[];\n`;
	const richText = await readFile(
		path.join(ROOT, "scripts/blocks/legacy-richtext.mjs"),
		"utf8",
	);
	hashes["scripts/blocks/legacy-richtext.mjs"] = sha(richText);
	const files = {
		"rich_text.mjs": richText,
		"rich_text.d.mts":
			"export function legacyTextToRichText(value: unknown, mode: string): unknown;\n",
		"legacy_schemas.mjs": `// Generated by generate-legacy-compatibility.ts; do not edit.\n${code}`,
		"legacy_schemas.d.mts": declaration,
	};
	const manifest = {
		sourceCount: inventory.length,
		inputs: Object.fromEntries(Object.entries(hashes).sort()),
		bundledInputs: [...loaded].map((file) => path.relative(ROOT, file)).sort(),
		files: Object.fromEntries(
			Object.entries(files).map(([name, value]) => [name, sha(value)]),
		),
		descriptors,
	};
	return {
		files: {
			...files,
			"manifest.json": JSON.stringify(manifest, null, 2) + "\n",
		},
		manifest,
	};
}
export async function syncLegacyCompatibility(check = false) {
	const result = await buildLegacyCompatibility();
	const changed: string[] = [];
	for (const [name, expected] of Object.entries(result.files)) {
		let actual: string | undefined;
		try {
			actual = await readFile(path.join(output, name), "utf8");
		} catch (error: any) {
			if (error.code !== "ENOENT") throw error;
		}
		if (actual !== expected) {
			changed.push(name);
			if (!check) {
				await mkdir(output, { recursive: true });
				await writeFile(path.join(output, name), expected);
			}
		}
	}
	if (check && changed.length)
		throw Error(`Legacy compatibility drift: ${changed.join(", ")}`);
	return { blocks: result.manifest.sourceCount, changed };
}
if (import.meta.main) {
	if (process.argv.slice(2).some((arg) => arg !== "--check"))
		throw Error("Use --check or no arguments");
	const result = await syncLegacyCompatibility(
		process.argv.includes("--check"),
	);
	console.log(
		`Pure legacy compatibility: ${result.blocks} discovered schemas; ${result.changed.length} changes.`,
	);
}
