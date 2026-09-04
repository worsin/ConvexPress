// Merge every surfaces/*.tsx file into packs/core/template.json → surfaces (sorted, catalog order),
// and mirror the list into the admin's lib/templates/packs.ts (replacing "*").
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const site = "/Users/worsin/Development/ConvexPress/ConvexPress-Website/apps/web/src/templates";
const adminPacks = "/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/lib/templates/packs.ts";

const catalogOrder = [...readFileSync(`${site}/sdk/catalog.ts`, "utf8").matchAll(/S\("([a-zA-Z0-9.]+)",/g)].map((m) => m[1]);
const files = readdirSync(`${site}/packs/core/surfaces`).filter((f) => f.endsWith(".tsx")).map((f) => f.replace(/\.tsx$/, ""));
const unknown = files.filter((f) => !catalogOrder.includes(f));
if (unknown.length) throw new Error(`surfaces not in catalog: ${unknown.join(", ")}`);
const surfaces = catalogOrder.filter((id) => files.includes(id));

const manifestPath = `${site}/packs/core/template.json`;
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.surfaces = surfaces;
manifest.variants = { ...(manifest.variants ?? {}) };
if (surfaces.includes("page")) manifest.variants.page = ["default", "sidebar-left", "full-width", "no-sidebar", "landing", "blank"];
for (const key of Object.keys(manifest.variants)) if (!surfaces.includes(key)) delete manifest.variants[key];
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

let admin = readFileSync(adminPacks, "utf8");
const list = surfaces.map((s) => `      "${s}",`).join("\n");
admin = admin.replace(/    \/\/ Core renders every surface[^\n]*\n    surfaces: \["\*"\],/, `    surfaces: [\n${list}\n    ],`);
admin = admin.replace(/    surfaces: \[\n(?:      "[^"]+",\n)+    \],/, `    surfaces: [\n${list}\n    ],`);
if (surfaces.includes("page") && !/\n      page: \[/.test(admin)) {
  admin = admin.replace(/    variants: \{\n/, `    variants: {\n      page: ["default", "sidebar-left", "full-width", "no-sidebar", "landing", "blank"],\n`);
}
writeFileSync(adminPacks, admin);
console.log(`core manifest: ${surfaces.length}/${catalogOrder.length} surfaces; missing: ${catalogOrder.filter((id) => !surfaces.includes(id)).join(", ") || "none"}`);
