import { test, expect } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../schema";
import { readLocaleDestinations } from "../../localization/model";
import { localeResultSchema } from "../foundation/localeContracts";
const query = (name: string) => makeFunctionReference<"query">(`localization:${name}`);
const mutation = (name: string) => makeFunctionReference<"mutation">(`localization:${name}`);
const modules = {"./convex/localization.ts": () => import("../../localization"), "./convex/_generated/api.js": () => import("../../_generated/api.js"), "./convex/_generated/server.js": () => import("../../_generated/server.js"), "./convex/membership/policyReads.ts": () => import("../../membership/policyReads")};
async function fixture() {
 const t = convexTest({schema, modules});
 const ids = await t.run(async ctx => {
  const role = await ctx.db.insert("roles", {name:"Language admin",slug:"language-admin",description:"Fixture",level:80,type:"internal",isDefault:false,isProtected:false,capabilities:["settings.update_general"],pageAccess:[],status:"active",createdAt:1,updatedAt:1});
  const user = await ctx.db.insert("users",{authSource:"local",email:"locale@example.invalid",emailVerified:true,roleId:role,status:"active",createdAt:1,updatedAt:1});
  const denied = await ctx.db.insert("users",{authSource:"local",email:"denied@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1});
  const plugins = await ctx.db.insert("settings",{section:"plugins",values:{membershipEnabled:false},updatedBy:user,updatedAt:1});
  await ctx.db.insert("convexpress_siteIdentity",{identityKey:"site-identity",websiteKey:"locale",instanceKey:"locale-stage",environmentKind:"staging",deploymentOrigin:"https://locale.convex.cloud",managementOrigin:"https://locale.convex.site",siteOrigin:"https://locale.example.invalid",siteContractVersion:"1",schemaVersion:"1",engineVersion:"1",managementCapabilities:[],initializedAt:1,updatedAt:1});
  const documents=[];
  for(const slug of ["home-en","home-es","home-ar","story-en","story-es","story-ar","untranslated"])
   documents.push(await ctx.db.insert("posts",{type:"page",title:slug,slug,path:`/${slug}`,content:"PRIVATE BODY MUST NEVER LEAVE SOURCE",status:"publish",visibility:"public",authorId:user,publishedAt:1,commentStatus:"closed",createdAt:1,updatedAt:1}));
  return {user,denied,role,plugins,documents};
 });
 const client=t.withIdentity({subject:ids.user,tokenIdentifier:`https://convexpress-admin.local|${ids.user}`});
 const locales=[{code:"en",label:"English",direction:"ltr",landingPageId:ids.documents[0]!},{code:"es",label:"Español",direction:"ltr",landingPageId:ids.documents[1]!},{code:"ar",label:"العربية",direction:"rtl",landingPageId:ids.documents[2]!}];
 const configure=(expectedRevision=0,enabled=true,values=locales)=>client.mutation(mutation("saveConfiguration"),{instanceKey:"locale-stage",expectedRevision,enabled,locales:values});
 const translations=locales.map((locale,index)=>({code:locale.code,documentId:ids.documents[index+3]!}));
 const save=(key="story",expectedRevision=0,values=translations,configurationRevision=1)=>client.mutation(mutation("saveTranslations"),{instanceKey:"locale-stage",key,expectedRevision,configurationRevision,translations:values});
 const read=(index=3)=>t.run(async ctx=>readLocaleDestinations(ctx,(await ctx.db.get("posts",ids.documents[index]!))!));
 return {t,ids,client,locales,configure,translations,save,read};
}
test("unconfigured and disabled routing exposes no invented destinations",async()=>{
 const f=await fixture();expect(await f.read()).toEqual({enabled:false,currentLocale:null,items:[]});await f.configure(0,false);expect((await f.read()).items).toEqual([]);
});
test("translation groups resolve native labels and direction to real routes and reopen",async()=>{
 const f=await fixture();await f.configure();await f.save();const result=await f.read();expect(result.currentLocale).toBe("en");
 expect(result.items.map(i=>[i.code,i.href,i.current,i.destination])).toEqual([["en","/page/story-en",true,"translation"],["es","/page/story-es",false,"translation"],["ar","/page/story-ar",false,"translation"]]);
 expect(result.items[2]!.direction).toBe("rtl");expect(result.items[2]!.label).toBe("العربية");expect(JSON.stringify(result)).not.toContain("PRIVATE BODY");expect(JSON.stringify(result)).not.toContain(f.ids.user);expect((await f.read(4)).currentLocale).toBe("es");
 const reopened=await f.client.query(query("translationGroup"),{instanceKey:"locale-stage",documentId:f.ids.documents[4]});expect(reopened.key).toBe("story");expect(reopened.revision).toBe(1);expect(reopened.translations).toEqual(f.translations);
});
test("untranslated documents offer explicitly marked language landing pages",async()=>{
 const f=await fixture();await f.configure();await f.save();const result=await f.read(6);expect(result.currentLocale).toBeNull();expect(result.items.map(i=>i.destination)).toEqual(["landing","landing","landing"]);expect(result.items.map(i=>i.href)).toEqual(["/page/home-en","/page/home-es","/page/home-ar"]);expect((await f.read(1)).items.find(i=>i.code==="es")?.current).toBe(true);
});
test("stable identities survive rename and do not follow another page reusing the old path",async()=>{
 const f=await fixture();await f.configure();await f.save();await f.t.run(async ctx=>{await ctx.db.patch(f.ids.documents[4]!,{slug:"new-es",path:"/new-es"});await ctx.db.patch(f.ids.documents[6]!,{path:"/story-es"});});expect((await f.read()).items[1]!.href).toBe("/page/new-es");expect((await f.read(6)).items.every(i=>i.destination==="landing")).toBe(true);
});
test("private, password, draft, future, trash and deleted translations are omitted without fallback",async()=>{
 const f=await fixture();await f.configure();await f.save();
 for(const patch of [{visibility:"private" as const},{visibility:"password" as const},{status:"draft" as const},{status:"trash" as const},{publishedAt:Date.now()+86400000}]){await f.t.run(ctx=>ctx.db.patch(f.ids.documents[4]!,{visibility:"public",status:"publish",publishedAt:1,...patch}));expect((await f.read()).items.map(i=>i.code)).toEqual(["en","ar"]);}
 await f.t.run(ctx=>ctx.db.delete(f.ids.documents[4]!));expect((await f.read()).items.map(i=>i.code)).toEqual(["en","ar"]);
});
test("route membership is rechecked on every public resolution",async()=>{
 const f=await fixture();await f.configure();await f.save();const rule=await f.t.run(async ctx=>{await ctx.db.patch(f.ids.plugins,{values:{membershipEnabled:true}});return ctx.db.insert("membership_restriction_rules",{resourceType:"route",resourceIdOrKey:"/page/story-es",ruleMode:"allow_only",planIds:[],teaserMode:"hide",loginRequired:true,createdAt:1,updatedAt:1});});expect((await f.read()).items.map(i=>i.code)).toEqual(["en","ar"]);await f.t.run(ctx=>ctx.db.delete(rule));expect((await f.read()).items.map(i=>i.code)).toEqual(["en","es","ar"]);
});
test("configuration and mapping administration enforce authority and environment",async()=>{
 const f=await fixture();await f.configure();await expect(f.t.query(query("configuration"),{instanceKey:"locale-stage"})).rejects.toThrow();await expect(f.client.query(query("configuration"),{instanceKey:"other"})).rejects.toThrow("another site");await expect(f.t.mutation(mutation("saveTranslations"),{instanceKey:"locale-stage",key:"story",expectedRevision:0,configurationRevision:1,translations:f.translations})).rejects.toThrow();
 const denied=f.t.withIdentity({subject:f.ids.denied,tokenIdentifier:`https://convexpress-admin.local|${f.ids.denied}`});await expect(denied.query(query("translationGroup"),{instanceKey:"locale-stage",documentId:f.ids.documents[3]})).rejects.toThrow();await f.t.run(ctx=>ctx.db.patch(f.ids.user,{status:"inactive"}));await expect(f.save()).rejects.toThrow();
});
test("stale configuration or mapping revisions cannot overwrite or resurrect newer state",async()=>{
 const f=await fixture();await f.configure();await f.save();await expect(f.configure()).rejects.toThrow("another session");await expect(f.save()).rejects.toThrow("another session");await f.configure(1,false);await expect(f.save("story",1)).rejects.toThrow("configuration changed");await f.save("story",1,[],2);await expect(f.save("story",1,f.translations,2)).rejects.toThrow("another session");expect(await f.client.query(query("translationGroup"),{instanceKey:"locale-stage",documentId:f.ids.documents[3]})).toBeNull();
});
test("language and document uniqueness prevent ambiguous routes and cross-group reassignment",async()=>{
 const f=await fixture();await expect(f.configure(0,true,[f.locales[0]!,f.locales[0]!])).rejects.toThrow("distinct");await expect(f.configure(0,true,[{...f.locales[0]!,code:"EN<script>"},f.locales[1]!])).rejects.toThrow("language tag");await f.configure();await f.save();await expect(f.save("other")).rejects.toThrow("another translation group");await expect(f.save("story",1,[{code:"fr",documentId:f.ids.documents[3]!}])).rejects.toThrow("Configure each language");await expect(f.save("story",1,[{code:"es",documentId:f.ids.documents[0]!}])).rejects.toThrow("another language");
});
test("draft translations can be prepared before publication and appear only when published",async()=>{
 const f=await fixture();await f.configure();await f.t.run(ctx=>ctx.db.patch(f.ids.documents[4]!,{status:"draft"}));await f.save();expect((await f.read()).items).toHaveLength(2);await f.t.run(ctx=>ctx.db.patch(f.ids.documents[4]!,{status:"publish"}));expect((await f.read()).items).toHaveLength(3);
});
test("public contract rejects unsafe links and inconsistent current-language flags",()=>{
 const item={code:"en",label:"English",direction:"ltr",href:"/page/home",current:true,destination:"translation"};expect(localeResultSchema.safeParse({enabled:true,currentLocale:"en",items:[item]}).success).toBe(true);for(const href of ["https://external.invalid","//external.invalid","javascript:alert(1)","/admin","/page/a\n"])expect(localeResultSchema.safeParse({enabled:true,currentLocale:"en",items:[{...item,href}]}).success).toBe(false);expect(localeResultSchema.safeParse({enabled:true,currentLocale:"es",items:[item]}).success).toBe(false);
});

test("empty groups retain a readable revision for explicit recovery without stale resurrection",async()=>{
 const f=await fixture();await f.configure();await f.save();await f.save("story",1,[]);
 const group=await f.client.query(query("translationGroup"),{instanceKey:"locale-stage",key:"story"});expect(group.revision).toBe(2);expect(group.translations).toEqual([]);
 await f.save("story",group.revision);expect((await f.read()).items.every(i=>i.destination==="translation")).toBe(true);
 await expect(f.client.query(query("translationGroup"),{instanceKey:"locale-stage"})).rejects.toThrow("Choose a document");
});
test("stored path, served path, resource and homepage rules all protect language destinations",async()=>{
 const f=await fixture();await f.configure();await f.save();await f.t.run(ctx=>ctx.db.patch(f.ids.plugins,{values:{membershipEnabled:true}}));
 for(const resource of [{resourceType:"route" as const,resourceIdOrKey:"/story-es"},{resourceType:"route" as const,resourceIdOrKey:"/page/story-es"},{resourceType:"page" as const,resourceIdOrKey:String(f.ids.documents[4]!)}]){
  const id=await f.t.run(ctx=>ctx.db.insert("membership_restriction_rules",{...resource,ruleMode:"allow_only",planIds:[],teaserMode:"hide",loginRequired:true,createdAt:1,updatedAt:1}));expect((await f.read()).items.map(i=>i.code)).toEqual(["en","ar"]);await f.t.run(ctx=>ctx.db.delete(id));
 }
 await f.t.run(async ctx=>{await ctx.db.insert("settings",{section:"reading",values:{homepageDisplays:"static_page",homepageId:f.ids.documents[1]!},updatedBy:f.ids.user,updatedAt:1});await ctx.db.insert("membership_restriction_rules",{resourceType:"route",resourceIdOrKey:"/",ruleMode:"allow_only",planIds:[],teaserMode:"hide",loginRequired:true,createdAt:1,updatedAt:1});});expect((await f.read(6)).items.map(i=>i.code)).toEqual(["en","ar"]);
});
test("native picker paginates title search and never returns source bodies",async()=>{
 const f=await fixture();let cursor:string|null=null;const found:string[]=[];
 do{const page=await f.client.query(query("documents"),{instanceKey:"locale-stage",type:"page",search:"",cursor});expect(JSON.stringify(page)).not.toContain("PRIVATE BODY");found.push(...page.items.map((item:{id:string})=>item.id));cursor=page.cursor;}while(cursor);
 expect(new Set(found).size).toBe(7);const result=await f.client.query(query("documents"),{instanceKey:"locale-stage",type:"page",search:"untranslated",cursor:null});expect(result.items.map((i:{id:string})=>i.id)).toEqual([f.ids.documents[6]!]);
 await expect(f.client.query(query("documents"),{instanceKey:"elsewhere",type:"page",search:"",cursor:null})).rejects.toThrow();
});
test("native picker separates public discovery from private editorial authority",async()=>{
 const f=await fixture();await f.t.run(ctx=>ctx.db.patch(f.ids.documents[4]!,{visibility:"private"}));const args={instanceKey:"locale-stage",documentId:f.ids.documents[4]!};expect(await f.client.query(query("document"),args)).toBeNull();
 await f.t.run(ctx=>ctx.db.patch(f.ids.role,{capabilities:["settings.update_general","page.update"]}));expect((await f.client.query(query("document"),args)).id).toBe(f.ids.documents[4]!);
 await f.t.run(ctx=>ctx.db.patch(f.ids.user,{status:"inactive"}));await expect(f.client.query(query("document"),args)).rejects.toThrow();
});
