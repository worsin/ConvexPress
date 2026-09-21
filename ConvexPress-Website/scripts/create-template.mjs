#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const websiteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Scaffold locally without overwriting another pack or changing a site's saved settings. */
export function createTemplate({ root = websiteRoot, id, name, from, dryRun = false }) {
  if (!SLUG.test(id ?? "")) throw new Error("Template id must be a lowercase slug (1–64 characters).");
  if (typeof name !== "string" || !name.trim()) throw new Error("Provide a template display name.");
  if (from !== undefined && !SLUG.test(from)) throw new Error("Source template must be a lowercase slug.");
  const packs = join(root, "apps/web/src/templates/packs");
  const target = join(packs, id);
  if (existsSync(target)) throw new Error(`Template '${id}' already exists; no files were changed.`);
  const source = from ? join(packs, from) : null;
  if (source && !existsSync(join(source, "template.json"))) throw new Error(`Source template '${from}' does not exist.`);
  const manifest = source ? JSON.parse(readFileSync(join(source, "template.json"), "utf8")) : {
    version: "1.0.0", sdk: "^1.0.0", tagline: "A new perspective", description: "A custom storefront template.",
    surfaces: ["home"], variants: {}, modules: ["colors", "typography", "layout", "header", "footer", "menuLayout", "shop"],
    defaults: {}, menuLocations: { primary: "header", secondary: "secondary", footer: "footer" },
  };
  Object.assign(manifest, { id, name: name.trim(), version: "1.0.0" });
  if (source) {
    const checkLinks = folder => {
      for (const entry of readdirSync(folder, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) throw new Error("Template sources must not contain symbolic links.");
        if (entry.isDirectory()) checkLinks(join(folder, entry.name));
      }
    };
    checkLinks(source);
  }
  if (dryRun) return { path: target, manifest, created: false };
  mkdirSync(packs, { recursive: true });
  if (source) {
    cpSync(source, target, { recursive: true, errorOnExist: true, force: false });
    const retarget = folder => {
      for (const entry of readdirSync(folder, { withFileTypes: true })) {
        const file = join(folder, entry.name);
        if (entry.isDirectory()) retarget(file);
        else if (/\.[jt]sx?$/.test(entry.name)) {
          const code = readFileSync(file, "utf8");
          writeFileSync(file, code.replaceAll(`@/templates/packs/${from}/`, `@/templates/packs/${id}/`));
        }
      }
    };
    retarget(target);
  }
  else {
    mkdirSync(join(target, "surfaces"), { recursive: true });
    writeFileSync(join(target, "surfaces/home.tsx"), `/** Start with the Core view model, then replace this composition. */\nimport CoreHome, { type HomeSurfaceData } from "../../core/surfaces/home";\nimport type { SurfaceProps } from "../../../sdk/types";\nexport default function Home({ data }: SurfaceProps<HomeSurfaceData>) {\n  return <CoreHome data={data} />;\n}\n`);
  }
  writeFileSync(join(target, "template.json"), JSON.stringify(manifest, null, 2) + "\n");
  writeFileSync(join(target, "DESIGN.md"), `# ${name.trim()}\n\nDefine the audience, visual direction, content hierarchy, typography and imagery here.\nKeep site names, photographs, prices, menus and copy in CMS data; this pack owns composition only.\n\nBase: ${from ?? "annotated Core home reference"}. See ../../../../../../template-kit/CONTRACT.md.\n`);
  return { path: target, manifest, created: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const value = flag => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; };
  if (args.includes("--help")) console.log("create:template --id <slug> --name <display name> [--from <existing pack>] [--dry-run]");
  else {
    try { const result = createTemplate({ id: value("--id"), name: value("--name"), from: value("--from"), dryRun: args.includes("--dry-run") }); console.log(`${result.created ? "Created" : "Preview"}: ${result.path}\nNext: implement surfaces, then bun run sync:templates && bun run check:templates in apps/web.`); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
