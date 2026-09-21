#!/usr/bin/env node
/** Scaffold the complete Events reference into a new, isolated extension. Never deploys. */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
const referenceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export function extensionPlan({ id, title, outputRoot = referenceRoot }) {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id) || id.length > 48) throw new Error("Use a lowercase extension slug, such as community-events.");
  if (!/^[A-Za-z][A-Za-z0-9 -]{0,79}$/.test(title)) throw new Error("Use a short title containing letters, numbers, spaces or hyphens.");
  if (["events", "dashboard", "auth", "core", "sdk"].includes(id)) throw new Error("This extension ID is reserved.");
  const settingsKey = id.replace(/-([a-z0-9])/g, (_, letter) => letter.toUpperCase()) + "Enabled";
  const moduleId = id.replaceAll("-", "_");
  const table = `extension_${moduleId}`;
  const pairs = [];
  // Copy the owned source trees, including regression tests. A fixed list drifted
  // as the reference gained pagination, categories and attendance support.
  const addTree = (base, relative = "") => {
    const directory = join(referenceRoot, base, "events", relative);
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") addTree(base, file);
      else if (entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name)) pairs.push([`${base}/events/${file}`, `${base}/${base.includes("packages/backend/convex") ? moduleId : id}/${file}`]);
    }
  };
  for (const base of [
    "ConvexPress-Admin/packages/backend/convex/extensions",
    "ConvexPress-Admin/apps/web/src/extensions",
    "ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin",
    "ConvexPress-Website/apps/web/src/extensions",
    "ConvexPress-Website/apps/web/src/routes/_marketing",
    "ConvexPress-Website/apps/web/src/dashboard/pages",
  ]) addTree(base);
  pairs.push(["ConvexPress-Website/apps/web/src/routes/dashboard/events.tsx", `ConvexPress-Website/apps/web/src/routes/dashboard/${id}.tsx`]);
  for (const surface of ["events.index", "events.detail", "dashboard.events"]) pairs.push([`ConvexPress-Website/apps/web/src/templates/packs/core/surfaces/${surface}.tsx`, `ConvexPress-Website/apps/web/src/templates/packs/core/surfaces/${surface.replace("events",id)}.tsx`]);
  for (const base of ["ConvexPress-Admin/packages/backend/convex/extensions", "ConvexPress-Admin/apps/web/src/extensions", "ConvexPress-Website/apps/web/src/extensions"]) if (existsSync(join(outputRoot,base,base.includes("packages/backend/convex") ? moduleId : id))) throw new Error(`Extension directory already exists: ${base}/${id}`);
  const changes = pairs.map(([from,to]) => {
    const path = join(outputRoot,to); if (existsSync(path)) throw new Error(`Refusing to overwrite ${to}`);
    let text = readFileSync(join(referenceRoot,from),"utf8");
    text = text
      .replace(/\b(extension_events|extension_event_categories|event_rsvp_(?:totals|entries|operations|rate_limits))\b/g, name =>
        name === "extension_events" ? table : name === "extension_event_categories" ? `${table}_categories` : `${table}_rsvp_${name.slice("event_rsvp_".length)}`).replaceAll("eventsEnabled",settingsKey).replaceAll("internal.extensions.events", `internal.extensions[${JSON.stringify(moduleId)}]`).replaceAll("api.extensions.events",`api.extensions[${JSON.stringify(moduleId)}]`).replaceAll('"events-', `"${id}-`).replaceAll('"events"',JSON.stringify(id)).replaceAll("'events'",JSON.stringify(id)).replaceAll("/events/",`/${id}/`).replaceAll("/events?",`/${id}?`).replaceAll("'/events'",JSON.stringify(`/${id}`)).replaceAll('"/events"',JSON.stringify(`/${id}`)).replaceAll('"/dashboard/events"',JSON.stringify(`/dashboard/${id}`)).replaceAll("events.index",`${id}.index`).replaceAll("events.detail",`${id}.detail`).replaceAll("events.card",`${id}.card`).replaceAll("dashboard.events",`dashboard.${id}`).replaceAll('title="Events"',`title=${JSON.stringify(title)}`).replaceAll('label: "Events"',`label: ${JSON.stringify(title)}`).replaceAll('title: "Events"',`title: ${JSON.stringify(title)}`).replaceAll('"title": "Events"',`"title": ${JSON.stringify(title)}`);
    // Public IDs/routes may contain hyphens; deployed Convex module paths may not.
    // Only backend module references are rewritten, never frontend import paths.
    if (from.startsWith("ConvexPress-Admin/packages/backend/convex/")) {
      text = text.replaceAll(`extensions/${id}/`, `extensions/${moduleId}/`);
    } else {
      for (const quote of ['"', "'", "`"])
        text = text.replaceAll(`${quote}extensions/${id}/`, `${quote}extensions/${moduleId}/`);
    }
    // Shared audit event infrastructure is not the extension's own namespace.
    text = text.replaceAll(`../../${id}/constants`,"../../events/constants");
    text = text.replace(new RegExp(`(\\.db\\.(?:query|insert|get|patch|replace|delete|normalizeId)\\(\\s*)(['"])${id}\\2`, "g"), (_, call, quote) => `${call}${quote}events${quote}`);
    return { path, text };
  });
  for (const relative of ["ConvexPress-Website/apps/web/src/templates/sdk/catalog.ts","ConvexPress-Admin/apps/web/src/lib/templates/catalog.ts"]) {
    const path = join(outputRoot,relative); if (!existsSync(path)) continue;
    let text = readFileSync(path,"utf8");
    if (text.includes(`id: "${id}"`) || text.includes(`S("${id}.`)) throw new Error(`Extension ID already exists in ${relative}`);
    if (!text.includes('  { id: "dashboard",') || !text.includes("  // Auth\n")) throw new Error(`Catalog format changed: ${relative}`);
    text = text.replace('  { id: "dashboard",',`  { id: ${JSON.stringify(id)}, title: ${JSON.stringify(title)}, plugin: ${JSON.stringify(id)} },\n  { id: "dashboard",`);
    text = text.replace("  // Auth\n",`  S("${id}.index", ${JSON.stringify(title)}, "${id}", { plugin: "${id}" }),\n  S("${id}.detail", ${JSON.stringify(`${title} details`)}, "${id}", { plugin: "${id}" }),\n  S("dashboard.${id}", ${JSON.stringify(title)}, "dashboard", { plugin: "${id}" }),\n  // Auth\n`);
    changes.push({path,text});
  }
  const readmePath = join(outputRoot,"ConvexPress-Admin/extension-kit/generated",`${id}.md`);
  if (existsSync(readmePath)) throw new Error("Generated extension guide already exists.");
  changes.push({path:readmePath,text:`# ${title}\n\nComplete event-publishing starter extension, generated from Events. The plugin starts disabled. Adapt its fields for your domain, run the generated backend tests, and enable it through Extensions after deployment.\n\nAPI: api.extensions[${JSON.stringify(moduleId)}].queries / mutations\nBackend modules: extensions/${moduleId}\nTable: ${table}\nFlag: ${settingsKey}\nPublic routes: /${id}, /${id}/<slug>\nAdmin: /${id}\nDashboard registry ID: ${id}\n\nDo not remove capability checks, public projections, plugin gates, optimistic editor checks or soft archive behavior.\n`});
  return {id,moduleId,outputRoot,changes};
}
export function writeExtension(plan) {
  for (const change of plan.changes) { mkdirSync(dirname(change.path),{recursive:true}); writeFileSync(change.path,change.text); }
  for (const relative of ["ConvexPress-Admin/packages/backend/scripts/generate-extension-index.mjs","ConvexPress-Website/scripts/sync-extension-manifests.mjs","ConvexPress-Website/scripts/sync-template-packs.mjs"]) {
    const path=join(plan.outputRoot,relative); if (!existsSync(path)) continue;
    const result=spawnSync(process.execPath,[path],{stdio:"inherit"}); if(result.status!==0) throw new Error(`Generated files need attention: ${relative}`);
  }
  for (const project of ["ConvexPress-Admin", "ConvexPress-Website"]) {
    const cwd = join(plan.outputRoot, project, "apps/web");
    const bunModules = join(plan.outputRoot, project, "node_modules/.bun");
    if (!existsSync(bunModules)) continue; // Standalone dry fixtures do not install dependencies.
    const entry = readdirSync(bunModules).find(name => name.startsWith("@tanstack+router-generator@"));
    if (!entry) throw new Error(`Install dependencies to generate ${project} routes.`);
    const modulePath = join(bunModules, entry, "node_modules/@tanstack/router-generator/dist/esm/index.js");
    const source = `import { Generator, getConfig } from ${JSON.stringify(pathToFileURL(modulePath).href)}; const root = process.cwd(); await new Generator({ root, config: getConfig({}, root) }).run();`;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", source], { cwd, stdio: "inherit" });
    if (result.status !== 0) throw new Error(`Route generation needs attention: ${project}`);
  }
  // Admin consumes checked, source-derived API declarations. Installing new
  // handlers must refresh those declarations before the generated UI can typecheck.
  const contracts = join(plan.outputRoot, "scripts/admin/generate-site-contracts.mjs");
  if (existsSync(contracts) && existsSync(join(plan.outputRoot, "ConvexPress-Admin/node_modules"))) {
    const result = spawnSync(process.execPath, [contracts], { cwd: plan.outputRoot, stdio: "inherit" });
    if (result.status !== 0) throw new Error("Generated site API contracts need attention.");
  }
  return plan.changes.map(change=>change.path);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2); const get=(name)=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
  const id=get("--id")??args.find(arg=>!arg.startsWith("-"));
  if (!id || args.includes("--help")) { console.log("create:extension <slug> [--title 'Display title'] [--dry-run] [--output-root /path]"); process.exit(args.includes("--help")?0:1); }
  try { const title=get("--title")??id.split("-").map(word=>word[0].toUpperCase()+word.slice(1)).join(" "); const plan=extensionPlan({id,title,outputRoot:get("--output-root")}); if(args.includes("--dry-run")) console.log(plan.changes.map(change=>change.path).join("\n")); else { const files=writeExtension(plan); console.log(`Created ${id}: ${files.length} files. Indexes and installed route trees regenerated. Run the generated extension tests before deploying.`); } }
  catch(error) { console.error(error.message); process.exit(1); }
}
