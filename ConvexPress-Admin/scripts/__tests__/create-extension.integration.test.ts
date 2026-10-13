import { expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { extensionPlan, writeExtension } from "../create-extension.mjs";

const sourceRoot = resolve(import.meta.dir, "../../..");
test("generated publishing, categories, calendar, RSVP and search handlers operate on the new extension's own tables", () => {
  const root = mkdtempSync(join(tmpdir(), "convexpress-generated-handlers-"));
  const relative = "ConvexPress-Admin/packages/backend", source = join(sourceRoot, relative), backend = join(root, relative);
  try {
    mkdirSync(backend, { recursive: true });
    // Every backend source tree: the static API generator loads every module.
    for (const directory of ["convex", "canonical-blocks-foundation", "membership-policy-foundation", "lib", "scripts"]) {
      cpSync(join(source, directory), join(backend, directory), { recursive: true, filter: path => !["node_modules", "output"].includes(basename(path)) && !basename(path).startsWith(".env") });
    }
    cpSync(join(source, "package.json"), join(backend, "package.json"));
    // The backend's typing generators (table docs, static API) run during
    // scaffolding and need the backend's own dependencies.
    symlinkSync(join(source, "node_modules"), join(backend, "node_modules"), "dir");
    writeExtension(extensionPlan({ id: "community-events", title: "Community Events", outputRoot: root }));
    // Backend-only acceptance: frontend dependencies/routes are absent during
    // generation. No installed user app is modified.
    symlinkSync(join(sourceRoot, "ConvexPress-Admin/node_modules"), join(root, "ConvexPress-Admin/node_modules"), "dir");
    // The scaffold regenerated exact document validators and the static API,
    // so the backend typing drift gate holds for the new extension as-is.
    for (const generator of ["generate-table-docs.ts", "generate-static-api.ts"]) {
      const check = spawnSync(process.execPath, [`scripts/typing/${generator}`, "--check"], { cwd: backend, encoding: "utf8", timeout: 60_000 });
      if (check.status !== 0) throw new Error(`Scaffold left ${generator} stale:\n${check.stdout}\n${check.stderr}`, { cause: check.error });
    }
    expect(readFileSync(join(backend, "convex/extensions/community_events/queries.ts"), "utf8")).toContain("communityEventsExtensionDocs");
    const generated = "./convex/extensions/community_events/__tests__/";
    writeFileSync(join(backend, generated, "sibling-search.test.ts"), `import {test,expect} from 'bun:test';
import {convexTest} from 'convex-test';
import schema from '../../../schema';
import {createPublicSearchSourceReader} from '../../../search/publicSource';
import {listRsvpOptions} from '../../../canonicalDocuments/rsvpSources';
import {RequestReadLedger} from '../../../helpers/requestReadLedger';
import {enabledPluginIds} from '../../../helpers/plugins';
import {makeFunctionReference} from 'convex/server';
import {syncEventSearch} from '../search';
const modules={'./convex/_generated/server.js':()=>import('../../../_generated/server.js'),'./convex/extensions/dashboard/queries.ts':()=>import('../../dashboard/queries'),
 './convex/search/internals.ts':()=>import('../../../search/internals'),
 './convex/search/actions.ts':()=>import('../../../search/actions'),
 './convex/search/reindex.ts':()=>import('../../../search/reindex'),
 './convex/membership/policyReads.ts':()=>import('../../../membership/policyReads')};
test('generated search maintenance owns its source table through cleanup and full backfill',async()=>{
 const t=convexTest({schema,modules});
 const {user,event}=await t.run(async ctx=>{
  const role=await ctx.db.insert('roles',{name:'Indexer',slug:'indexer',description:'Fixture',level:80,type:'internal',status:'active',isDefault:false,isProtected:false,capabilities:['search.reindex'],pageAccess:[],createdAt:1,updatedAt:1});
  const user=await ctx.db.insert('users',{email:'maintenance@example.invalid',emailVerified:true,authSource:'local',roleId:role,status:'active',createdAt:1,updatedAt:1});
  const event=await ctx.db.insert('extension_community_events',{title:'Community workshop',slug:'community-workshop',description:'Authored prose',startsAt:100,endsAt:200,timeZone:'UTC',venue:'',venueAddress:'',status:'published',createdBy:user,createdAt:1,updatedAt:1});
  await syncEventSearch(ctx,event);return {user,event};
 });
 await t.mutation(makeFunctionReference('search/internals:cleanupOrphanedIndex'),{});
 expect((await t.run(ctx=>ctx.db.query('searchIndex').collect())).map(row=>row.contentId)).toEqual([event]);
 await t.run(async ctx=>{for(const row of await ctx.db.query('searchIndex').collect())await ctx.db.delete('searchIndex',row._id);});
 const client=t.withIdentity({subject:user,issuer:'https://convexpress-admin.local'});
 const result=await client.action(makeFunctionReference('search/actions:reindex'),{});
 expect(result.status).toBe('completed');expect(result.indexed.event).toBe(1);
 expect((await t.run(ctx=>ctx.db.query('searchIndex').collect())).map(row=>row.contentId)).toEqual([event]);
});
test('same-slug siblings keep table, route and plugin authority isolated',async()=>{
 const t=convexTest({schema,modules});
 const ids=await t.run(async ctx=>{
  const user=await ctx.db.insert('users',{authSource:'local',email:'isolated@example.invalid',emailVerified:true,status:'active',createdAt:1,updatedAt:1});
  const settings=await ctx.db.insert('settings',{section:'plugins',values:{eventsEnabled:true,communityEventsEnabled:true,formsEnabled:true},updatedBy:user,updatedAt:1});
  const fields={title:'Original event',slug:'same-slug',description:'Original public copy',startsAt:Date.now()+86400000,endsAt:Date.now()+90000000,rsvp:{mode:'guests',capacity:2,closesAt:null},timeZone:'UTC',venue:'Studio',venueAddress:'',status:'published',createdBy:user,createdAt:1,updatedAt:1};
  const original=await ctx.db.insert('extension_events',fields);
  const generated=await ctx.db.insert('extension_community_events',{...fields,title:'Generated event',description:'Generated public copy'});
  return {settings,original,generated};
 });
 const read=()=>t.run(async ctx=>{const reader=createPublicSearchSourceReader(ctx);return Promise.all([ids.original,ids.generated].map(contentId=>reader({contentType:'event',contentId})));});
 expect(await read()).toMatchObject([{title:'Original event',url:'/events/same-slug'},{title:'Generated event',url:'/community-events/same-slug'}]);
 const dashboard=()=>t.query(makeFunctionReference('extensions/dashboard/queries:registry'),{});
 expect((await dashboard()).pages).toContainEqual(expect.objectContaining({id:'community-events',path:'/community-events',pluginId:'community-events'}));
 const choices=(cursor=null)=>t.run(async ctx=>listRsvpOptions(ctx,{numItems:1,cursor,maximumRowsRead:256,maximumBytesRead:524288},await enabledPluginIds(ctx),new RequestReadLedger()));
 const first=await choices();expect(first.page).toMatchObject([{id:ids.generated,providerId:'community-events'}]);expect(first.isDone).toBe(false);
 const second=await choices(first.continueCursor);expect(second.page).toMatchObject([{id:ids.original,providerId:'events'}]);expect(second.isDone).toBe(true);
 await expect(choices(JSON.stringify({...JSON.parse(first.continueCursor),providerId:'unknown'}))).rejects.toThrow('cursor');

 await t.run(ctx=>ctx.db.patch(ids.settings,{values:{eventsEnabled:false,communityEventsEnabled:true,formsEnabled:true}}));
 await expect(choices(first.continueCursor)).rejects.toThrow('plugin');
 const [hidden,visible]=await read();expect(hidden).toBeNull();expect(visible?.title).toBe('Generated event');
 expect((await dashboard()).pages.some(page=>page.id==='events')).toBe(false);
 expect((await dashboard()).pages.some(page=>page.id==='community-events')).toBe(true);
 await t.run(ctx=>ctx.db.patch(ids.settings,{values:{eventsEnabled:true,communityEventsEnabled:false,formsEnabled:true}}));
 const [restored,revoked]=await read();expect(restored?.title).toBe('Original event');expect(revoked).toBeNull();
 expect((await dashboard()).pages.some(page=>page.id==='events')).toBe(true);
 expect((await dashboard()).pages.some(page=>page.id==='community-events')).toBe(false);
});`);
    // Run the complete generated backend reference suite, including RSVP. Bun's
    // console output omits passing test names in some environments (AI-agent
    // and CI modes), so read the outcome from its machine-readable report.
    const suites = ["handlers", "categories", "calendarIndex", "pagination", "search", "rsvp", "sibling-search"].map(name => `${generated}${name}.test.ts`);
    const report = join(root, "generated-tests.junit.xml");
    const result = spawnSync(process.execPath, ["test", "--reporter=junit", `--reporter-outfile=${report}`, ...suites], { cwd: backend, encoding: "utf8", timeout: 30_000 });
    if (result.status !== 0) throw new Error(`Generated handlers failed:\n${result.stdout}\n${result.stderr}`, { cause: result.error });
    const junit = readFileSync(report, "utf8");
    const attribute = (element: string, name: string) => {
      const value = new RegExp(`\\s${name}="([^"]*)"`).exec(element)?.[1];
      return value?.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
    };
    const totals = /<testsuites\b[^>]*>/.exec(junit)?.[0] ?? "";
    expect({ failures: attribute(totals, "failures"), skipped: attribute(totals, "skipped") }).toEqual({ failures: "0", skipped: "0" });
    expect([...junit.matchAll(/<testsuite\b[^>]*>/g)].map(([element]) => attribute(element, "file")).sort()).toEqual(suites.map(suite => suite.slice(2)).sort());
    // A self-closing <testcase/> has no <failure>/<skipped> child: it passed.
    const passed = [...junit.matchAll(/<testcase\b[^>]*\/>/g)].map(([element]) => attribute(element, "name"));
    expect(passed).toContain("generated search maintenance owns its source table through cleanup and full backfill");
    expect(passed).toContain("same-slug siblings keep table, route and plugin authority isolated");
    expect(readFileSync(join(backend, "convex/schema/_searchIndex.generated.ts"), "utf8")).toContain('../extensions/community_events/search');
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 60_000);
