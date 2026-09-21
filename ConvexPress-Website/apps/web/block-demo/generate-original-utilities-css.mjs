import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const web = dirname(directory);
const require = createRequire(join(web, "package.json"));
const tailwind = require("tailwindcss");
const tailwindDirectory = dirname(require.resolve("tailwindcss/package.json"));
const registry = await fs.readFile(join(web, "src/lib/blocks/registry.tsx"), "utf8");
const start = registry.indexOf("function DividerRenderer(");
const end = registry.indexOf("function EmbedRenderer(", start);
assert(start >= 0 && end > start, "Original Divider/Spacer source boundaries changed");
const source = registry.slice(start, end);
const candidates = [...new Set([...source.matchAll(/"([^"\n]+)"/g)]
  .flatMap(match => match[1].split(/\s+/))
  .filter(token => /^(my-|border-|h-)/.test(token)))];
assert(candidates.length > 0, "Original utility classes were not found");
const theme = await fs.readFile(join(tailwindDirectory, "theme.css"), "utf8");
const preflight = await fs.readFile(join(tailwindDirectory, "preflight.css"), "utf8");
const compiler = await tailwind.compile(`${theme}\n${preflight}\n@theme inline { --color-border: var(--border); }\n@tailwind utilities;`);
const css = compiler.build(candidates).replaceAll(":root, :host", ":scope");
const hash = value => createHash("sha256").update(value).digest("hex");
const outputs = {
  "original-utilities.generated.css": `/* Actual original utility classes compiled with the pinned production Tailwind. */\n@scope ([data-original-view]) {\n${css}\n}\n`,
  "original-utilities.generated.json": `${JSON.stringify({
    candidates,
    version: require("tailwindcss/package.json").version,
    rendererSourceHash: hash(source),
    themeHash: hash(theme),
    preflightHash: hash(preflight),
    cssHash: hash(css),
  }, null, 2)}\n`,
};
for (const [name, content] of Object.entries(outputs)) {
  const path = join(directory, name);
  if (process.argv.includes("--check")) {
    assert.equal(await fs.readFile(path, "utf8"), content, `${name} is stale; run block-demo/generate-original-utilities-css.mjs`);
  } else {
    await fs.writeFile(path, content);
  }
}
console.log(`Original utility CSS ${process.argv.includes("--check") ? "is current" : "generated"}.`);
