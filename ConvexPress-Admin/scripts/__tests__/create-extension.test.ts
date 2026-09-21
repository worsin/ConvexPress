import { expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { extensionPlan, writeExtension } from "../create-extension.mjs";
test("scaffold generates all layers with unique API/table IDs and refuses overwrite", () => {
 const root=mkdtempSync(join(tmpdir(),"convexpress-extension-"));
 try { const plan=extensionPlan({id:"workshops",title:"Workshops",outputRoot:root}); const files=writeExtension(plan); expect(files.length).toBeGreaterThan(20);
 const mutation=readFileSync(join(root,"ConvexPress-Admin/packages/backend/convex/extensions/workshops/mutations.ts"),"utf8");
 expect(mutation).toContain('"extension_workshops"'); expect(mutation).toContain('../../events/constants'); expect(mutation).toContain('requirePluginEnabled(ctx, "workshops")');
 const route=readFileSync(join(root,"ConvexPress-Website/apps/web/src/routes/_marketing/workshops/index.tsx"),"utf8"); expect(route).toContain('@/extensions/workshops/api'); const api=readFileSync(join(root,'ConvexPress-Website/apps/web/src/extensions/workshops/api.ts'),'utf8'); expect(api).toContain('extensions/workshops/queries:upcoming'); expect(route).toContain('/_marketing/workshops/');
 expect(()=>extensionPlan({id:"workshops",title:"Again",outputRoot:root})).toThrow();
 } finally { rmSync(root,{recursive:true,force:true}); }
});
test("unsafe extension IDs fail before creating any files", () => {
 expect(()=>extensionPlan({id:"../escape",title:"Escape"})).toThrow();
 expect(()=>extensionPlan({id:"bad",title:"<script>"})).toThrow();
});
test("hyphenated IDs namespace pagination, navigation entries and settings", () => {
 const root=mkdtempSync(join(tmpdir(),"convexpress-extension-"));
 try {
  const plan=extensionPlan({id:"community-events",title:"Community Events",outputRoot:root});
  const text=(suffix:string)=>plan.changes.find((change:{path:string})=>change.path.endsWith(suffix))!.text;
  expect(text('/routes/_marketing/community-events/index.tsx')).toContain('@/extensions/community-events/window');
  expect(text('/extensions/community-events/window.ts')).toContain('/community-events?');
  expect(text('/extensions/community-events/nav.ts')).toContain('"community-events-all"');
  expect(text('/extensions/community_events/plugin.ts')).toContain('communityEventsEnabled');
  expect(text('/extensions/community_events/schema.ts')).toContain('extension_community_events');
 } finally { rmSync(root,{recursive:true,force:true}); }
});

const referenceRoot = resolve(import.meta.dir, "../../..");
const ownedRoots = [
 "ConvexPress-Admin/packages/backend/convex/extensions",
 "ConvexPress-Admin/apps/web/src/extensions",
 "ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin",
 "ConvexPress-Website/apps/web/src/extensions",
 "ConvexPress-Website/apps/web/src/routes/_marketing",
 "ConvexPress-Website/apps/web/src/dashboard/pages",
];
function sourceFiles(root: string): string[] {
 return readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
  ? sourceFiles(join(root, entry.name)) : /\.[cm]?[jt]sx?$/.test(entry.name) ? [join(root, entry.name)] : []);
}
test("scaffold retains every reference-owned module and its local import closure", () => {
 const root = mkdtempSync(join(tmpdir(), "convexpress-extension-closure-"));
 try {
  const plan = extensionPlan({ id: "community-events", title: "Community Events", outputRoot: root });
  const changes = new Map<string, string>(plan.changes.map((change: {path: string; text: string}) => [change.path, change.text]));
  for (const base of ownedRoots) {
   for (const original of sourceFiles(join(referenceRoot, base, "events"))) {
    const target = original.replace(referenceRoot, root).replace("/events/", base.includes("packages/backend/convex") ? "/community_events/" : "/community-events/");
    expect(changes.has(target)).toBe(true);
   }
  }
  for (const [path, text] of changes) {
   for (const match of text.matchAll(/(?:from\s*|import\s*\()(['"])(\.[^'"]+)\1/g)) {
    const target = resolve(dirname(path), match[2]);
    const candidates = [target, ...[".ts", ".tsx", ".d.ts", ".js", ".mjs", "/index.ts", "/index.tsx"].map(suffix => target + suffix)];
    const owned = target.includes("/community-events/") || target.includes("/community_events/") || /\/community-events\.(index|detail)$/.test(target);
    if (!candidates.some(candidate => changes.has(candidate) || (!owned && existsSync(candidate.replace(root, referenceRoot))))) throw new Error(`Missing generated dependency ${match[2]} from ${path.replace(root, "")}`);
   }
  }
 } finally { rmSync(root, { recursive: true, force: true }); }
});
test("scaffold isolates every event table and route policy while retaining shared audit infrastructure", () => {
 const root = mkdtempSync(join(tmpdir(), "convexpress-extension-namespace-"));
 try {
  const plan = extensionPlan({ id: "community-events", title: "Community Events", outputRoot: root });
  const text = (suffix: string) => plan.changes.find((change: {path: string}) => change.path.endsWith(suffix))?.text ?? "";
  const schema = text("/extensions/community_events/schema.ts");
  for (const name of ["extension_community_events", "extension_community_events_categories", ...["totals", "entries", "operations", "rate_limits"].map(suffix => `extension_community_events_rsvp_${suffix}`)]) expect(schema).toContain(name);
  const all = plan.changes.map((change: {text: string}) => change.text).join("\n");
  expect(all).not.toMatch(/\b(?:extension_events|extension_event_categories|event_rsvp_(?:totals|entries|operations|rate_limits))\b/);
  expect(text("/extensions/community_events/publicAccess.ts")).toMatch(/["']\/community-events["']/);
  expect(text("/extensions/community_events/mutations.ts")).toContain('../../events/constants');
  expect(text("/extensions/community_events/rsvp.ts")).toContain('internal.extensions.forms.spam');
  expect(text("/extensions/community_events/__tests__/rsvp.test.ts")).toContain('ctx.db.query("events")');
  expect(text("/extensions/community-events/nav.ts")).toContain('/community-events/categories');
 } finally { rmSync(root, { recursive: true, force: true }); }
});

test("event-prefixed slugs namespace table names once and numeric slug segments remain valid settings keys", () => {
 for (const id of ["events-pro", "events-2"]) {
  const root = mkdtempSync(join(tmpdir(), "convexpress-extension-prefix-"));
  try {
   const plan = extensionPlan({ id, title: "More Events", outputRoot: root });
   const schema = plan.changes.find((change: {path: string}) => change.path.endsWith(`/extensions/${id.replaceAll("-", "_")}/schema.ts`))!.text;
   const names = [...schema.matchAll(/(\w+): defineTable/g)].map(match => match[1]);
   const table = `extension_${id.replaceAll("-", "_")}`;
   expect(names.sort()).toEqual([table, `${table}_categories`, ...["totals", "entries", "operations", "rate_limits"].map(suffix => `${table}_rsvp_${suffix}`)].sort());
   const settings = plan.changes.find((change: {path: string}) => change.path.endsWith(`/extensions/${id.replaceAll("-", "_")}/plugin.ts`))!.text.match(/settingsKey: "([^"]+)"/)![1];
   expect(settings).toMatch(/^[a-zA-Z][a-zA-Z0-9]*$/);
  } finally { rmSync(root, { recursive: true, force: true }); }
 }
});


test("hyphenated generated surfaces survive the real template synchronization", () => {
 const root = mkdtempSync(join(tmpdir(), "convexpress-extension-templates-"));
 try {
  for (const relative of ["ConvexPress-Website/apps/web/src/templates", "ConvexPress-Website/scripts", "ConvexPress-Website/apps/web/src/extensions/sdk", "ConvexPress-Admin/apps/web/src/lib/templates"]) {
   mkdirSync(dirname(join(root, relative)), { recursive: true });
   cpSync(join(referenceRoot, relative), join(root, relative), { recursive: true });
  }
  writeExtension(extensionPlan({ id: "community-events", title: "Community Events", outputRoot: root }));
  const manifest = JSON.parse(readFileSync(join(root, "ConvexPress-Website/apps/web/src/templates/packs/core/template.json"), "utf8"));
  expect(manifest.surfaces).toContain("community-events.index");
  expect(manifest.surfaces).toContain("community-events.detail");
  expect(manifest.surfaces).toContain("dashboard.community-events");
  const check = spawnSync(process.execPath, [join(root, "ConvexPress-Website/scripts/check-template-packs.mjs")], { encoding: "utf8" });
  if (check.status !== 0) throw new Error(check.stdout + check.stderr);
  expect(readFileSync(join(root, "ConvexPress-Admin/apps/web/src/lib/templates/packs.ts"), "utf8")).toContain('"community-events.index"');
 } finally { rmSync(root, { recursive: true, force: true }); }
});


test("backend module paths and references are deployable for public hyphenated IDs", () => {
 const plan = extensionPlan({ id: "community-events", title: "Community Events", outputRoot: "/tmp/unwritten-extension-module-plan" });
 for (const change of plan.changes) {
  const relative = change.path.split("/packages/backend/convex/")[1];
  if (relative) for (const part of relative.split("/")) expect(part).toMatch(/^[a-zA-Z0-9_.]+$/);
 }
 const text=(suffix:string)=>plan.changes.find((change:{path:string})=>change.path.endsWith(suffix))!.text;
 expect(text("/extensions/community-events/api.ts")).toContain('"extensions/community_events/queries:upcoming"');
 expect(text("/extensions/community-events/EventEditor.tsx")).toContain('api.extensions["community_events"]');
 expect(text("/extensions/community_events/rsvp.ts")).toContain('"extensions/community_events/rsvp:prepareVerification"');
 expect(text("/extensions/community_events/plugin.ts")).toContain('id: "community-events"');
});
