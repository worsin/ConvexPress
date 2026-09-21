import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../schema";
const reference = (name: string, kind: "query" | "mutation" = "query") =>
	makeFunctionReference<any, any, any>(`canonicalDocuments:${name}`);
const modules = {
 "./convex/_generated/api.js": () => import("../../_generated/api.js"),
 "./convex/_generated/server.js": () => import("../../_generated/server.js"),
 "./convex/canonicalDocuments.ts": () => import("../../canonicalDocuments"),
};
async function fixture() {
	const t = convexTest({ schema, modules });
	const ids = await t.run(async (ctx) => {
		const role = await ctx.db.insert("roles", {
			name: "Editor",
			slug: "editor",
			description: "Fixture",
			level: 80,
			type: "internal",
			isDefault: false,
			isProtected: false,
			capabilities: ["page.update", "post.update", "revision.restore"],
			pageAccess: [],
			status: "active",
			createdAt: 1,
			updatedAt: 1,
		});
		const user = await ctx.db.insert("users", {
			authSource: "local",
			email: "fixture@example.invalid",
			emailVerified: true,
			roleId: role,
			status: "active",
			createdAt: 1,
			updatedAt: 1,
		});
		const denied = await ctx.db.insert("users", {
			authSource: "local",
			email: "denied@example.invalid",
			emailVerified: true,
			status: "active",
			createdAt: 1,
			updatedAt: 1,
		});
		await ctx.db.insert("convexpress_siteIdentity", {
			identityKey: "site-identity",
			websiteKey: "fixture",
			instanceKey: "fixture-stage",
			environmentKind: "staging",
			deploymentOrigin: "https://fixture.convex.cloud",
			managementOrigin: "https://fixture.convex.site",
			siteOrigin: "https://fixture.example.invalid",
			siteContractVersion: "1",
			schemaVersion: "1",
			engineVersion: "1",
			managementCapabilities: [],
			initializedAt: 1,
			updatedAt: 1,
		});
		await ctx.db.insert("settings", {
			section: "plugins",
			values: { membershipEnabled: false },
			updatedAt: 1,
			updatedBy: user,
		});
		await ctx.db.insert("settings", {
			section: "appearance.template",
			values: { active: "core", overrides: {}, variants: {}, settings: {} },
			legacyAppearanceMigration: { version: 2, migratedAt: 1 },
			updatedAt: 1,
			updatedBy: user,
		});
		const post = await ctx.db.insert("posts", {
			type: "page",
			title: "Disposable draft",
			slug: "draft",
			path: "/draft",
			content: "",
			status: "draft",
			visibility: "public",
			authorId: user,
			commentStatus: "closed",
			createdAt: 1,
			updatedAt: 1,
		});
		return { user, denied, post };
	});
	const as = (id: typeof ids.user) =>
		t.withIdentity({
			subject: id,
			tokenIdentifier: `https://convexpress-admin.local|${id}`,
		});
	return { t, ids, as, client: as(ids.user) };
}

test("mailing list choices enforce document access, active installation ownership and bounded private projections",async()=>{
 const f=await fixture();
 const seeded=await f.t.run(async ctx=>{
  const setting=await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","plugins")).unique();
  await ctx.db.patch(setting!._id,{values:{formsEnabled:true,membershipEnabled:false}});
  const base={websiteKey:"fixture",instanceKey:"fixture-stage",description:"PRIVATE_DESCRIPTION",consentText:"PRIVATE_CONSENT",privacyUrl:"/privacy",revision:1,createdBy:f.ids.user,updatedBy:f.ids.user,createdAt:1,updatedAt:1};
  const ids=[];
  for(let i=0;i<23;i++)ids.push(await ctx.db.insert("mailingLists",{...base,name:`Readers ${String(i).padStart(2,"0")}`,status:"active"}));
  for(const patch of [{status:"draft" as const},{status:"archived" as const},{instanceKey:"production"},{websiteKey:"another-site"}])await ctx.db.insert("mailingLists",{...base,name:"PRIVATE_OTHER_LIST",status:"active",...patch});
  return {ids,setting:setting!._id};
 });
 const query=reference("mailingListOptions"),args={postId:f.ids.post,paginationOpts:{numItems:20,cursor:null}};
 for(const actor of [f.t,f.as(f.ids.denied)])await expect(actor.query(query,args)).rejects.toThrow();
 const first=await f.client.query(query,args),second=await f.client.query(query,{...args,paginationOpts:{numItems:20,cursor:first.continueCursor}});
 expect(first.page).toHaveLength(20);expect(second.page).toHaveLength(3);expect(second.isDone).toBe(true);
 expect([...first.page,...second.page].map((row:{id:string})=>row.id)).toEqual(seeded.ids);
 expect(Object.keys(first.page[0]).sort()).toEqual(["id","name"]);expect(JSON.stringify([first,second])).not.toContain("PRIVATE");
 for(const numItems of [0,21,1.5])await expect(f.client.query(query,{...args,paginationOpts:{numItems,cursor:null}})).rejects.toThrow();
 await f.t.run(ctx=>ctx.db.patch(seeded.ids[0]!,{status:"archived"}));expect((await f.client.query(query,args)).page.some((row:{id:string})=>row.id===seeded.ids[0])).toBe(false);
 await f.t.run(ctx=>ctx.db.patch(seeded.setting,{values:{formsEnabled:false}}));await expect(f.client.query(query,args)).rejects.toThrow("Enable Forms");
 await f.t.run(async ctx=>{await ctx.db.patch(seeded.setting,{values:{formsEnabled:true}});await ctx.db.patch(f.ids.post,{status:"trash"});});await expect(f.client.query(query,args)).rejects.toThrow("Trash");
 await f.t.run(async ctx=>{await ctx.db.patch(f.ids.post,{status:"draft"});await ctx.db.patch(f.ids.user,{status:"banned"});});await expect(f.client.query(query,args)).rejects.toThrow();
});
test("mailing list choices disappear when an installation identity is replaced",async()=>{
 const f=await fixture();await f.t.run(async ctx=>{
  const setting=await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","plugins")).unique();await ctx.db.patch(setting!._id,{values:{formsEnabled:true}});
  await ctx.db.insert("mailingLists",{websiteKey:"fixture",instanceKey:"fixture-stage",name:"Original readers",description:"",consentText:"Send updates",privacyUrl:"/privacy",status:"active",revision:1,createdBy:f.ids.user,updatedBy:f.ids.user,createdAt:1,updatedAt:1});
 });
 const args={postId:f.ids.post,paginationOpts:{numItems:20,cursor:null}};
 expect((await f.client.query(reference("mailingListOptions"),args)).page).toHaveLength(1);
 await f.t.run(async ctx=>{const identity=await ctx.db.query("convexpress_siteIdentity").unique();await ctx.db.patch(identity!._id,{instanceKey:"replaced"});});
 expect((await f.client.query(reference("mailingListOptions"),args)).page).toEqual([]);
});
