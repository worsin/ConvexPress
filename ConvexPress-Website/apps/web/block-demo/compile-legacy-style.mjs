import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { relative } from "node:path";
import { createHash } from "node:crypto";
import { compile } from "tailwindcss";
/** Compile actual legacy utilities in a scope that cannot restyle the gallery.
 * No guessed declaration values: Tailwind and existing production theme own them. */
const base = new URL("../", import.meta.url);
const files = {
	view: new URL("src/blocks/field-guide/View.tsx", base),
	theme: new URL("node_modules/tailwindcss/theme.css", base),
	preflight: new URL("node_modules/tailwindcss/preflight.css", base),
	app: new URL("src/index.css", base),
	tokens: new URL("src/styles/theme.css", base),
	brand: new URL("src/components/layout/ThemeStyleInjector.tsx", base),
};
const source = Object.fromEntries(
	await Promise.all(
		Object.entries(files).map(async ([key, url]) => [
			key,
			await readFile(url, "utf8"),
		]),
	),
);
// Static literal tokens cover every branch of the actual finite View, including
// template literals, single-quoted enum mappings and the nine gap candidates.
const candidates = [
	...new Set(source.view.match(/[A-Za-z][A-Za-z0-9_:[\]./-]*/gu) ?? []),
];
const themes = [source.app, source.tokens]
	.flatMap((css) => css.match(/@theme\s+inline\s*\{[^}]*\}/gu) ?? [])
	.join("\n");
const brandRule = source.brand.match(
	/`(h1, h2, h3, \.font-display \{[^}]+\})`/u,
)?.[1];
if (!brandRule)
	throw new Error(
		"Production brand typography selector changed; review legacy fixture closure",
	);
const compiler = await compile(
	`${source.theme}\n${themes}\n${source.preflight}\n${brandRule}\n@tailwind utilities;`,
);
const utilities = compiler
	.build(candidates)
	.replace(/:root,\s*:host/g, ":scope");
const output = `/* Generated from actual FieldGuideView, pinned Tailwind and production theme. Do not edit. */\n@scope ([data-treatment-original]) {\n${utilities}\n}\n`;
const destination = new URL(
	"./legacy-field-guide.generated.css",
	import.meta.url,
);
const receipt = {
	files: Object.fromEntries(
		Object.entries(source).map(([key, text]) => [
			relative(fileURLToPath(base), fileURLToPath(files[key])).replaceAll("\\", "/"),
			createHash("sha256").update(text).digest("hex"),
		]),
	),
	candidates,
	sha256: createHash("sha256").update(output).digest("hex"),
};
if (process.argv.includes("--check")) {
	if ((await readFile(destination, "utf8")) !== output)
		throw new Error("Legacy treatment stylesheet stale");
} else {
	await writeFile(destination, output);
	await writeFile(
		new URL("./legacy-field-guide.generated.json", import.meta.url),
		JSON.stringify(receipt, null, 2) + "\n",
	);
}
console.log(
	`Legacy style closure: ${candidates.length} discovered tokens, ${Object.keys(source).length} actual source files; scoped original only.`,
);
