import { beginCategoryDeletion } from "../../kb/categoryDeletion";
import { beginTermCountRepair, advanceTermCountRepair } from "../../helpers/termCounts";
import {eventIntervalBucket} from "../../canonicalDocuments/foundation/eventIntervalIndex";
import { test, expect } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../schema";
import { beginAuthorPostCountRepair, advanceAuthorPostCountRepair } from "../../helpers/authorPostCounts";
import { insertTermRelationship } from "../../helpers/postDiscovery";
import { insertWithMediaReferences, patchWithMediaReferences } from "../../media/attachmentGuard";
import type { ContentPromotionManifest } from "@convexpress/site-contract/content-promotion";
const modules = {
 "./convex/settings/mutations.ts": () => import("../../settings/mutations"),
 "./convex/settings/templateDrafts.ts": () => import("../../settings/templateDrafts"),
 "./convex/syncedBlocks/refresh.ts": () => import('../../syncedBlocks/refresh'),
 "./convex/syncedBlocks/content.ts": () => import('../../syncedBlocks/content'),
 "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
 "./convex/canonicalDocuments/promotion.ts": () => import("../../canonicalDocuments/promotion"),
 "./convex/canonicalDocuments.ts": () => import("../../canonicalDocuments"),
 "./convex/posts/internals.ts": () => import("../../posts/internals"),
 "./convex/posts/authorCounts.ts": () => import("../../posts/authorCounts"),
 "./convex/contentPromotion/mediaUploads.ts": () => import("../mediaUploads"),
	"./convex/_generated/server.js": () =>
		import("../../_generated/server.js"),
	"./convex/contentPromotion/operations.ts": () => import("../operations"),
};
const fn = (name: string) =>
	makeFunctionReference<"mutation">(`contentPromotion/operations:${name}`);

test("expired promotion retirement is durable, scoped and prevents delayed applies", async () => {
 const f = await fixture();
 const review = await f.authed.mutation(fn("dryRun"), { manifest: manifest(), mediaBindings: [], dependencyBindings: [] });
 const args = { receiptId: review.receiptId, expectedDigest: review.digest };
 await expect(f.authed.mutation(fn("retireExpiredReview"), args)).rejects.toThrow();
 await f.t.run(ctx => ctx.db.patch(review.receiptId, { expiresAt: 1 }));
 await expect(f.t.mutation(fn("retireExpiredReview"), args)).rejects.toThrow();
 await expect(f.authed.mutation(fn("retireExpiredReview"), { ...args, expectedDigest: "0".repeat(64) })).rejects.toThrow();
 const retired = await f.authed.mutation(fn("retireExpiredReview"), args);
 expect(retired.status).toBe("retired"); expect(retired.digest).toBe(review.digest);
 expect(await f.authed.mutation(fn("retireExpiredReview"), args)).toEqual(retired);
 // Even a deadline extended by later code must not resurrect a fenced receipt.
 await f.t.run(ctx => ctx.db.patch(review.receiptId, { expiresAt: Date.now() + 60_000 }));
 await expect(f.authed.mutation(fn("apply"), { ...args, confirmLive: true })).rejects.toThrow();
 expect(await f.t.run(ctx => ctx.db.query("posts").collect())).toHaveLength(0);
 expect((await f.authed.query(makeFunctionReference<"query">("contentPromotion/operations:receiptStatus"), { receiptId: args.receiptId })).status).toBe("retired");
});

test("retiring an already committed promotion reports the committed outcome", async () => {
 const f = await fixture();
 const review = await f.authed.mutation(fn("dryRun"), { manifest: manifest(), mediaBindings: [], dependencyBindings: [] });
 const args = { receiptId: review.receiptId, expectedDigest: review.digest };
 await f.authed.mutation(fn("apply"), { ...args, confirmLive: true });
 expect((await f.authed.mutation(fn("retireExpiredReview"), args)).status).toBe("applied");
 expect(await f.t.run(ctx => ctx.db.query("posts").collect())).toHaveLength(1);
});
const target = {
	websiteKey: "site",
	instanceKey: "site:live",
	deploymentOrigin: "https://target.convex.cloud",
	siteOrigin: "https://target.example.test",
	environmentKind: "live" as const,
	schemaVersion: "1",
};
function manifest(): ContentPromotionManifest {
	return {
		version: 1,
		source: {
			...target,
			instanceKey: "site:staging",
			environmentKind: "staging",
			deploymentOrigin: "https://source.convex.cloud",
			siteOrigin: "https://source.example.test",
		},
		target: { ...target },
		selection: {
			pageIds: ["source-page"],
			postIds: [],
			mediaIds: [],
			menuIds: [],
			eventIds: [],
			includePresentation: false,
		},
		records: [
			{
				key: "page:source-page",
				kind: "page",
				sourceRevision: "source-revision",
				data: {
					title: "Welcome",
					slug: "welcome",
					path: "/welcome",
					depth: 0,
					status: "publish",
					visibility: "public",
					commentStatus: "closed",
					contentMode: "blocks",
					blocks: [
						{
							id: "block-one",
							name: "core/paragraph",
							version: 1,
							attrs: { text: "Hello target" },
						},
					],
				},
			},
		],
		dependencies: [],
		issues: [],
	};
}
async function fixture() {
	const t = convexTest({ schema, modules });
	const ids = await t.run(async (ctx) => {
		const roleId = await ctx.db.insert("roles", {
			name: "Administrator",
			slug: "administrator",
			description: "Fixture",
			level: 100,
			type: "internal",
			status: "active",
			isDefault: false,
			isProtected: true,
			capabilities: [
				"manage_options",
				"page.create",
				"page.update",
				"page.publish",
				"page.set_parent",
				"page.read",
				"page.read_private",
				"post.create",
				"post.update",
				"post.publish",
				"post.read",
				"media.read",
				"media.upload",
				"media.update",
				"menu.create",
				"menu.update",
				"menu.add_item",
				"menu.update_item",
				"menu.assign_location",
				"taxonomy.assign",
				"taxonomy.create_category",
				"taxonomy.create_tag",
				"taxonomy.update_category",
				"taxonomy.update_tag",
			],
			pageAccess: [],
			createdAt: 1,
			updatedAt: 1,
		});
		const userId = await ctx.db.insert("users", {
			email: "operator@example.test",
			emailVerified: true,
			status: "active",
			authSource: "local",
			roleId,
			createdAt: 1,
			updatedAt: 1,
		});
		await ctx.db.insert("convexpress_siteIdentity", {
			...target,
			identityKey: "site-identity",
			managementOrigin: "https://agency.example.test",
			siteContractVersion: "1",
			engineVersion: "1",
			managementCapabilities: [],
			initializedAt: 1,
			updatedAt: 1,
		});
		await ctx.db.insert("settings", {
			section: "plugins",
			values: { eventsEnabled: true },
			updatedAt: 1,
			updatedBy: userId,
		});
		await ctx.db.insert("settings", {
			section: "general",
			values: {
				siteUrl: target.siteOrigin,
				homeUrl: target.siteOrigin,
				siteTitle: "Live",
			},
			updatedAt: 1,
			updatedBy: userId,
		});
		return { userId };
	});
	return {
		t,
		authed: t.withIdentity({
			subject: ids.userId,
			issuer: "https://convexpress-admin.local",
		}),
		...ids,
	};
}
const bindings = { mediaBindings: [], dependencyBindings: [] };
async function reusableExportFixture(){
 const source=await fixture();
 const {syncedContentDigest}=await import('../../canonicalDocuments/foundation/syncedContent');
 const scope={websiteKey:'site',instanceKey:'site:staging',deploymentOrigin:'https://source.convex.cloud'};
 const shared=(id:string,syncedBlock:string,revision:number|'latest')=>({id,name:'core/synced',version:1,attrs:{syncedBlock,revisionPolicy:revision==='latest'?'latest':'pinned',...(revision==='latest'?{}:{revision})}});
 const ids=await source.t.run(async ctx=>{
  const identity=await ctx.db.query('convexpress_siteIdentity').withIndex('by_identity_key',q=>q.eq('identityKey','site-identity')).unique();
  await ctx.db.patch('convexpress_siteIdentity',identity!._id,{...manifest().source});
  const makeSource=async(title:string,bodies:any[])=>{
   const id=await ctx.db.insert('syncedBlocks',{...scope,title,generation:2,lastRevision:bodies.length,publishedRevision:bodies.length,createdBy:source.userId,updatedBy:source.userId,createdAt:1,updatedAt:1});
   for(let i=0;i<bodies.length;i++)await ctx.db.insert('syncedBlockRevisions',{syncedBlockId:id,revision:i+1,title,blocks:bodies[i],digest:syncedContentDigest(title,bodies[i]),createdBy:source.userId,createdAt:1,publishedAt:1});
   return id;
  };
  const page=async(slug:string,blocks:any[])=>ctx.db.insert('posts',{type:'page',title:slug,slug,path:'/'+slug,status:'publish',visibility:'public',content:'',contentMode:'blocks',blocksVersion:2,blocksRevision:1,blocks,authorId:source.userId,commentStatus:'closed',createdAt:1,updatedAt:1});
  const third=await makeSource('Third source',[[{id:'text',name:'core/paragraph',version:2,attrs:{}}]]);
  const featured=await page('featured-reusable',[shared('third',third,'latest')]);
  const inner=await makeSource('Inner source',[[{id:'featured',name:'core/featured-page',version:1,attrs:{page:featured}}],[{id:'text',name:'core/paragraph',version:2,attrs:{}}]]);
  const parent=await makeSource('Parent source',[[shared('latest',inner,'latest'),shared('pinned',inner,1)]]);
  const root=await page('reusable-root',[shared('collection',parent,'latest')]);
  return{root,inner,parent,third,featured};
 });
 const exported=await source.authed.query(makeFunctionReference<'query'>('contentPromotion/operations:exportManifest'),{target,selection:{...manifest().selection,pageIds:[ids.root]}});
 return{source,ids,exported};
}
test('promotion export carries nested reusable revisions and closes over referenced canonical pages',async()=>{
 const {source,ids,exported}=await reusableExportFixture();const m=exported.manifest;
 expect(m.synced.sources).toHaveLength(3);expect(m.synced.sources.reduce((n:number,s:any)=>n+s.revisions.length,0)).toBe(4);
 expect(m.records.filter((r:any)=>r.kind==='page').map((r:any)=>r.key).sort()).toEqual([`page:${ids.root}`,`page:${ids.featured}`].sort());
 expect(m.synced.sources.find((s:any)=>s.key===`@promotion:synced:${ids.inner}`).revisions.map((v:any)=>v.revision)).toEqual([1,2]);
 expect(JSON.stringify(m.synced)).not.toContain(String(source.userId));
 expect((await source.t.run(ctx=>ctx.db.query('syncedBlockRevisions').take(10)))).toHaveLength(4);
});
test('reusable promotion manifests reject missing pins, foreign scope and missing nested ordinary resources',async()=>{
 const {exported,ids}=await reusableExportFixture();const {validateManifest}=await import('../shared');
 const badScope=structuredClone(exported.manifest);badScope.synced.scope.instanceKey='foreign';expect(()=>validateManifest(badScope)).toThrow();
 const missingPin=structuredClone(exported.manifest);const inner=missingPin.synced.sources.find((s:any)=>s.key===`@promotion:synced:${ids.inner}`);inner.revisions=inner.revisions.filter((v:any)=>v.revision!==1);expect(()=>validateManifest(missingPin)).toThrow();
 const missingResource=structuredClone(exported.manifest);missingResource.records=missingResource.records.filter((r:any)=>r.key!==`page:${ids.featured}`);missingResource.synced.sources=missingResource.synced.sources.filter((s:any)=>s.key!==`@promotion:synced:${ids.third}`);expect(()=>validateManifest(missingResource)).toThrow("Canonical dependency is missing");
 const stripped=structuredClone(exported.manifest);delete stripped.synced;expect(()=>validateManifest(stripped)).toThrow();
});
async function reusableTargetFixture(){
 const f=await fixture();const {consumerIndexGeneration}=await import('../../syncedBlocks/consumerIndexState');
 await f.t.run(async ctx=>{
  const user=(await ctx.db.get('users',f.userId))!,role=(await ctx.db.get('roles',user.roleId!))!;
  await ctx.db.patch('roles',role._id,{capabilities:[...role.capabilities,'post.restore','post.unpublish','revision.restore','form.create','form.update']});
  await ctx.db.insert('settings',{section:'appearance.template',values:{active:'core',overrides:{},variants:{},settings:{}},legacyAppearanceMigration:{version:2,migratedAt:1},updatedAt:1,updatedBy:f.userId});
  await ctx.db.insert('syncedBlockConsumerIndex',{key:'active',generation:consumerIndexGeneration()!,websiteKey:target.websiteKey,instanceKey:target.instanceKey,deploymentOrigin:target.deploymentOrigin,phase:'ready',cursor:null,sequence:0,documents:0,updatedAt:1});
 });return f;
}
test('registered promotion transfers nested reusable sources and referenced canonical pages with idempotent receipts',async()=>{
 const previousEpoch=process.env.MEDIA_REFERENCE_INDEX_EPOCH;process.env.MEDIA_REFERENCE_INDEX_EPOCH='synced_promotion_flow_test_0001';
 try{
  const {exported,ids}=await reusableExportFixture(),f=await reusableTargetFixture();
  const review=await f.authed.mutation(fn('dryRun'),{manifest:exported.manifest,...bindings});
  expect(review.ready).toBe(true);expect(review.changes.filter((c:any)=>c.kind==='syncedBlock')).toHaveLength(3);
  expect(await f.t.run(ctx=>ctx.db.query('posts').take(10))).toHaveLength(0);
  const args=receiptArgs(review),applied=await f.authed.mutation(fn('apply'),args);
  expect(applied.mappings).toHaveLength(5);
  const readState=()=>f.t.run(async ctx=>({posts:await ctx.db.query('posts').take(10),sources:await ctx.db.query('syncedBlocks').take(10),versions:await ctx.db.query('syncedBlockRevisions').take(20),backups:await ctx.db.query('contentPromotion_backups').take(20)}));
  const state=await readState();expect(state.posts).toHaveLength(2);expect(state.versions).toHaveLength(4);expect(state.backups).toHaveLength(5);expect(state.backups.every(b=>b.kind!=='canonicalAllocation')).toBe(true);
  expect(state.posts.every(p=>p.blocksVersion===2&&p.blocksRevision===1&&p.status==='publish')).toBe(true);
  const featuredId=applied.mappings.find((m:any)=>m.key===`page:${ids.featured}`).targetId;
  const featuredVersion=state.versions.find(v=>v.blocks[0].name==='core/featured-page')!;expect(featuredVersion.blocks[0].attrs.page).toBe(featuredId);
  expect(await f.authed.mutation(fn('apply'),args)).toEqual(applied);expect(await readState()).toEqual(state);
  await expect(f.authed.mutation(fn('rollback'),args)).rejects.toThrow('created records');
 }finally{if(previousEpoch===undefined)delete process.env.MEDIA_REFERENCE_INDEX_EPOCH;else process.env.MEDIA_REFERENCE_INDEX_EPOCH=previousEpoch;}
});
test('registered reusable update and rollback retain production drafts and immutable history',async()=>{
 const previousEpoch=process.env.MEDIA_REFERENCE_INDEX_EPOCH;process.env.MEDIA_REFERENCE_INDEX_EPOCH='synced_promotion_flow_test_0002';
 try{
  const {exported}=await reusableExportFixture(),f=await reusableTargetFixture();
  const first=await f.authed.mutation(fn('dryRun'),{manifest:exported.manifest,...bindings});await f.authed.mutation(fn('apply'),receiptArgs(first));
  const source=(await f.t.run(ctx=>ctx.db.query('syncedBlocks').take(10)))[0];
  await f.authed.mutation(makeFunctionReference<'mutation'>('syncedBlocks/content:save'),{id:source._id,expectedGeneration:source.generation,title:'Production draft to retain',blocks:[{id:'draft',name:'core/paragraph',version:2,attrs:{}}]});
  const versionsBefore=await f.t.run(ctx=>ctx.db.query('syncedBlockRevisions').take(20));
  exported.manifest.selection.includePresentation=true;
  exported.manifest.records.push({key:'template',kind:'presentation',sourceRevision:'template-revision',data:{section:'appearance.template',values:{active:'aster-house',overrides:{},variants:{},settings:{}}}});
  const second=await f.authed.mutation(fn('dryRun'),{manifest:exported.manifest,...bindings});expect(second.ready).toBe(true);
  await f.authed.mutation(fn('apply'),receiptArgs(second));
  expect((await f.t.run(ctx=>ctx.db.query('settings').withIndex('by_section',q=>q.eq('section','appearance.template')).unique()))!.values.active).toBe('aster-house');
  await f.authed.mutation(fn('rollback'),receiptArgs(second));
  expect((await f.t.run(ctx=>ctx.db.query('settings').withIndex('by_section',q=>q.eq('section','appearance.template')).unique()))!.values.active).toBe('core');
  const restored=await f.t.run(ctx=>ctx.db.get('syncedBlocks',source._id));expect(restored!.title).toBe('Production draft to retain');expect(restored!.publishedRevision).toBe(source.publishedRevision);
  const versionsAfter=await f.t.run(ctx=>ctx.db.query('syncedBlockRevisions').take(30));for(const prior of versionsBefore)expect(versionsAfter.find(v=>v._id===prior._id)).toEqual(prior);
  expect((await f.t.run(ctx=>ctx.db.query('posts').take(10))).every(p=>p.blocksVersion===2&&p.blocksRevision===3)).toBe(true);
 }finally{if(previousEpoch===undefined)delete process.env.MEDIA_REFERENCE_INDEX_EPOCH;else process.env.MEDIA_REFERENCE_INDEX_EPOCH=previousEpoch;}
});
test('nested reusable Forms are reviewed by placement and late projection failure rolls back allocations and source history',async()=>{
 const previousEpoch=process.env.MEDIA_REFERENCE_INDEX_EPOCH;process.env.MEDIA_REFERENCE_INDEX_EPOCH='synced_promotion_flow_test_0003';
 try{
  const {exported,ids}=await reusableExportFixture(),f=await reusableTargetFixture();
  const {exportCanonicalPromotionTree}=await import('../../canonicalDocuments/foundation/promotionTree');
  exported.manifest.synced.sources.find((s:any)=>s.key===`@promotion:synced:${ids.third}`).revisions[0].tree=await exportCanonicalPromotionTree([{id:'contact',name:'core/contact-form',version:2,attrs:{fields:[{name:'email',label:'Email',type:'email',required:true}]}}],async()=>{throw Error('Unexpected dependency');});
  const roleId=await f.t.run(async ctx=>{const user=(await ctx.db.get('users',f.userId))!;const role=(await ctx.db.get('roles',user.roleId!))!;await ctx.db.patch('roles',role._id,{capabilities:role.capabilities.filter(c=>c!=='form.create')});const plugins=(await ctx.db.query('settings').withIndex('by_section',q=>q.eq('section','plugins')).unique())!;await ctx.db.patch('settings',plugins._id,{values:{...plugins.values,formsEnabled:true}});return role._id;});
  const denied=await f.authed.mutation(fn('dryRun'),{manifest:exported.manifest,...bindings});expect(denied.ready).toBe(false);expect(denied.issues.some((i:any)=>i.code==='TARGET_CONTACT_PERMISSION')).toBe(true);
  await f.t.run(async ctx=>{const role=(await ctx.db.get('roles',roleId))!;await ctx.db.patch('roles',roleId,{capabilities:[...role.capabilities,'form.create']});});
  const first=await f.authed.mutation(fn('dryRun'),{manifest:exported.manifest,...bindings});expect(first.ready).toBe(true);await f.authed.mutation(fn('apply'),receiptArgs(first));
  const forms=await f.t.run(ctx=>ctx.db.query('forms').take(10));expect(forms).toHaveLength(1);expect(forms[0].contactBlockId).toStartWith('synced_');
  const extra=structuredClone(exported.manifest.records.find((r:any)=>r.key===`page:${ids.featured}`));extra.key='page:extra-contact';extra.data.slug='extra-contact';extra.data.path='/extra-contact';exported.manifest.records.push(extra);
  const second=await f.authed.mutation(fn('dryRun'),{manifest:exported.manifest,...bindings});expect(second.ready).toBe(true);
  await f.t.run(ctx=>ctx.db.delete('fieldGroups',forms[0].fieldGroupId!));
  const readState=()=>f.t.run(async ctx=>({posts:await ctx.db.query('posts').take(20),sources:await ctx.db.query('syncedBlocks').take(20),versions:await ctx.db.query('syncedBlockRevisions').take(40),backups:await ctx.db.query('contentPromotion_backups').take(40),forms:await ctx.db.query('forms').take(20),jobs:await ctx.db.query('syncedBlockRefreshJobs').take(20)}));
  const before=await readState();await expect(f.authed.mutation(fn('apply'),receiptArgs(second))).rejects.toThrow('field group is missing');expect(await readState()).toEqual(before);
 }finally{if(previousEpoch===undefined)delete process.env.MEDIA_REFERENCE_INDEX_EPOCH;else process.env.MEDIA_REFERENCE_INDEX_EPOCH=previousEpoch;}
});
test('brokered promotion updates three reusable contact forms within the canonical read budget',async()=>{
 const previousEpoch=process.env.MEDIA_REFERENCE_INDEX_EPOCH;process.env.MEDIA_REFERENCE_INDEX_EPOCH='synced_promotion_management_test_01';
 try{
  const {exported,ids}=await reusableExportFixture(),f=await reusableTargetFixture();
  const {exportCanonicalPromotionTree}=await import('../../canonicalDocuments/foundation/promotionTree');
  exported.manifest.synced.sources.find((s:any)=>s.key===`@promotion:synced:${ids.third}`).revisions[0].tree=await exportCanonicalPromotionTree([0,1,2].map(i=>({id:`contact-${i}`,name:'core/contact-form',version:2,attrs:{fields:[{name:'email',label:'Email',type:'email',required:true},{name:'message',label:'Message',type:'textarea',required:false}]}})),async()=>{throw Error('Unexpected dependency');});
  const sessionId=await f.t.run(async ctx=>{
   const user=(await ctx.db.get('users',f.userId))!,role=(await ctx.db.get('roles',user.roleId!))!;
   const plugins=(await ctx.db.query('settings').withIndex('by_section',q=>q.eq('section','plugins')).unique())!;
   await ctx.db.patch('settings',plugins._id,{values:{...plugins.values,formsEnabled:true}});
   const now=Date.now();
   const managed=await ctx.db.insert('users',{email:'broker@example.invalid',emailVerified:true,status:'active',authSource:'management',roleId:role._id,createdAt:now,updatedAt:now});
   const authorityId=await ctx.db.insert('convexpress_managementAuthorities',{controllerId:'test-controller',keyId:'key',publicKeyPem:'fixture',fingerprintSha256:'fixture',websiteKey:target.websiteKey,instanceKey:target.instanceKey,capabilities:[],capabilityRevision:1,status:'active',notBefore:now-1000,enrolledAt:now,updatedAt:now});
   const bindingId=await ctx.db.insert('convexpress_managementBindings',{authorityId,controllerId:'test-controller',syntheticOperatorId:'broker',userId:managed,capabilityRevision:1,status:'active',createdAt:now,updatedAt:now});
   return ctx.db.insert('convexpress_managementSessions',{authorityId,bindingId,userId:managed,tokenHash:'fixture',websiteKey:target.websiteKey,instanceKey:target.instanceKey,capabilities:[],siteRoleSlug:'administrator',siteCapabilities:role.capabilities,capabilityRevision:1,expiresAt:now+60_000,status:'active',createdAt:now});
  });
  const initial=await f.authed.mutation(fn('dryRun'),{manifest:exported.manifest,...bindings});expect(initial.ready).toBe(true);
  await f.authed.mutation(fn('apply'),receiptArgs(initial));
  const forms=await f.t.run(ctx=>ctx.db.query('forms').take(10));expect(forms).toHaveLength(3);
  const broker=f.t.withIdentity({subject:sessionId,issuer:'https://convexpress-management.local'});
  const review=await broker.mutation(fn('dryRun'),{manifest:exported.manifest,...bindings});expect(review.ready).toBe(true);
  const applied=await broker.mutation(fn('apply'),receiptArgs(review));expect(applied.status).toBe('applied');
  const after=await f.t.run(ctx=>ctx.db.query('forms').take(10));expect(after.map(r=>r._id)).toEqual(forms.map(r=>r._id));
  expect((await f.t.run(ctx=>ctx.db.query('posts').take(10))).every(p=>p.blocksRevision===2)).toBe(true);
 }finally{if(previousEpoch===undefined)delete process.env.MEDIA_REFERENCE_INDEX_EPOCH;else process.env.MEDIA_REFERENCE_INDEX_EPOCH=previousEpoch;}
});
test('new canonical page allocation preserves create-only permissions and rejects forged allocation receipts',async()=>{
 const previousEpoch=process.env.MEDIA_REFERENCE_INDEX_EPOCH;process.env.MEDIA_REFERENCE_INDEX_EPOCH='synced_promotion_flow_test_0004';
 try{
  const {exported}=await reusableExportFixture(),f=await reusableTargetFixture();
  await f.t.run(async ctx=>{const user=(await ctx.db.get('users',f.userId))!,role=(await ctx.db.get('roles',user.roleId!))!;await ctx.db.patch('roles',role._id,{capabilities:role.capabilities.filter(c=>c!=='page.update')});});
  const review=await f.authed.mutation(fn('dryRun'),{manifest:exported.manifest,...bindings});expect(review.ready).toBe(true);
  await f.authed.mutation(fn('apply'),receiptArgs(review));
  const page=(await f.t.run(ctx=>ctx.db.query('posts').take(10)))[0];
  const {consumeCanonicalPromotionAllocation}=await import('../canonicalAllocation');
  await expect(f.authed.run(ctx=>consumeCanonicalPromotionAllocation(ctx,{receiptId:review.receiptId,key:exported.manifest.records[0].key},page,'page'))).rejects.toThrow('current promotion receipt');
 }finally{if(previousEpoch===undefined)delete process.env.MEDIA_REFERENCE_INDEX_EPOCH;else process.env.MEDIA_REFERENCE_INDEX_EPOCH=previousEpoch;}
});
test('reserving canonical identities does not bypass structural parent-cycle refusal',async()=>{
 const previousEpoch=process.env.MEDIA_REFERENCE_INDEX_EPOCH;process.env.MEDIA_REFERENCE_INDEX_EPOCH='synced_promotion_flow_test_0005';
 try{
  const {exported}=await reusableExportFixture(),f=await reusableTargetFixture(),pages=exported.manifest.records.filter((r:any)=>r.kind==='page');
  pages[0].data.parentId=`@promotion:${pages[1].key}`;pages[1].data.parentId=`@promotion:${pages[0].key}`;
  await expect(f.authed.mutation(fn('dryRun'),{manifest:exported.manifest,...bindings})).rejects.toThrow('PROMOTION_REFERENCE_CYCLE');
  expect(await f.t.run(ctx=>ctx.db.query('posts').take(10))).toHaveLength(0);
 }finally{if(previousEpoch===undefined)delete process.env.MEDIA_REFERENCE_INDEX_EPOCH;else process.env.MEDIA_REFERENCE_INDEX_EPOCH=previousEpoch;}
});
test("promotion rejects anonymous review and source/target identity substitution", async () => {
	const { t, authed } = await fixture();
	await expect(
		t.mutation(fn("dryRun"), { manifest: manifest(), ...bindings }),
	).rejects.toBeDefined();
	const m = manifest();
	m.target.instanceKey = "another-client";
	await expect(
		authed.mutation(fn("dryRun"), { manifest: m, ...bindings }),
	).rejects.toBeDefined();
	expect(await t.run((ctx) => ctx.db.query("posts").collect())).toHaveLength(0);
});
test("strict manifest rejects runtime fields and unremapped dependency IDs", async () => {
	const { authed } = await fixture();
	for (const data of [
		{ ...manifest().records[0].data, authorId: "source-user" },
		{ ...manifest().records[0].data, featuredImageId: "source-media" },
	]) {
		const m = manifest();
		m.records[0].data = data;
		await expect(
			authed.mutation(fn("dryRun"), { manifest: m, ...bindings }),
		).rejects.toBeDefined();
	}
	const m = manifest();
	m.records = [
		{
			key: "presentation:general",
			kind: "presentation",
			sourceRevision: "r",
			data: {
				section: "general",
				values: { siteUrl: "https://attacker.test" },
			},
		},
	];
	await expect(
		authed.mutation(fn("dryRun"), { manifest: m, ...bindings }),
	).rejects.toBeDefined();
});
test("review is write-free for content, apply is confirmed and retry idempotent", async () => {
	const { t, authed, userId } = await fixture();
	const review = await authed.mutation(fn("dryRun"), {
		manifest: manifest(),
		...bindings,
	});
	expect(review.ready).toBe(true);
	expect(await t.run((ctx) => ctx.db.query("posts").collect())).toHaveLength(0);
	await expect(
		authed.mutation(fn("apply"), {
			receiptId: review.receiptId,
			expectedDigest: review.digest,
			confirmLive: false,
		}),
	).rejects.toBeDefined();
	const applied = await authed.mutation(fn("apply"), {
		receiptId: review.receiptId,
		expectedDigest: review.digest,
		confirmLive: true,
	});
	expect(
		await authed.mutation(fn("apply"), {
			receiptId: review.receiptId,
			expectedDigest: review.digest,
			confirmLive: true,
		}),
	).toEqual(applied);
	const posts = await t.run((ctx) => ctx.db.query("posts").collect());
	expect(posts).toHaveLength(1);
	expect(posts[0].authorId).toBe(userId);
	expect(
		(
			await t.run((ctx) =>
				ctx.db
					.query("settings")
					.withIndex("by_section", (q) => q.eq("section", "general"))
					.unique(),
			)
		)?.values.siteUrl,
	).toBe(target.siteOrigin);
});
test("concurrent target edit blocks the entire atomic apply", async () => {
	const { t, authed, userId } = await fixture();
	const id = await t.run((ctx) =>
		ctx.db.insert("posts", {
			type: "page",
			title: "Live",
			slug: "welcome",
			path: "/welcome",
			status: "publish",
			visibility: "public",
			commentStatus: "closed",
			authorId: userId,
			createdAt: 1,
			updatedAt: 1,
		}),
	);
	const review = await authed.mutation(fn("dryRun"), {
		manifest: manifest(),
		...bindings,
	});
	await t.run((ctx) => ctx.db.patch(id, { title: "Concurrent live edit" }));
	await expect(
		authed.mutation(fn("apply"), {
			receiptId: review.receiptId,
			expectedDigest: review.digest,
			confirmLive: true,
		}),
	).rejects.toBeDefined();
	expect((await t.run((ctx) => ctx.db.get(id)))?.title).toBe(
		"Concurrent live edit",
	);
	expect(
		await t.run((ctx) => ctx.db.query("contentPromotion_backups").collect()),
	).toHaveLength(0);
});
test("unsupported catalogs return actionable dry-run issues without a ready receipt", async () => {
	const { t, authed } = await fixture();
	const m = manifest();
	m.dependencies = [
		{
			key: "catalog:products",
			kind: "catalog",
			sourceId: "products",
			requiredBy: ["page:source-page"],
		},
	];
	const result = await authed.mutation(fn("dryRun"), {
		manifest: m,
		...bindings,
	});
	expect(result.ready).toBe(false);
	expect(result.issues[0].code).toBe("CATALOG_ADAPTER_REQUIRED");
	expect(
		await t.run((ctx) => ctx.db.query("contentPromotion_receipts").collect()),
	).toHaveLength(0);
});
test("media bytes, block attrs, homepage and menu links map only to target IDs", async () => {
	const { t, authed } = await fixture();
	const storageId = await t.run((ctx) =>
		ctx.storage.store(new Blob(["image-bytes"], { type: "image/png" })),
	);
	const storage = await t.run((ctx) => ctx.db.system.get(storageId));
	const m = manifest();
	m.records[0].data.featuredImageId = "@promotion:media:source-image";
	m.records[0].data.blocks = [
		{
			id: "picture",
			name: "core/image",
			version: 1,
			attrs: {
				mediaId: "@promotion:media:source-image",
				href: "@promotion-url:media:source-image",
				alt: "Retreat",
			},
		},
	];
	m.records.push(
		{
			key: "media:source-image",
			kind: "media",
			sourceRevision: "m1",
			data: {
				title: "Retreat",
				fileName: "retreat.png",
				slug: "retreat",
				mimeType: "image/png",
				fileSize: storage!.size,
				sha256: storage!.sha256,
				mediaType: "image",
			},
		},
		{
			key: "menu:source-main",
			kind: "menu",
			sourceRevision: "n1",
			data: { name: "Main", slug: "main" },
		},
		{
			key: "item:source-home",
			kind: "menuItem",
			sourceRevision: "i1",
			data: {
				menuId: "@promotion:menu:source-main",
				itemType: "page",
				objectId: "@promotion:page:source-page",
				label: "Home",
				position: 0,
			},
		},
		{
			key: "presentation:reading",
			kind: "presentation",
			sourceRevision: "s1",
			data: {
				section: "reading",
				values: {
					homepageDisplays: "static_page",
					homepageId: "@promotion:page:source-page",
				},
			},
		},
	);
	const reviewed = await authed.mutation(fn("dryRun"), {
		manifest: m,
		mediaBindings: [{ key: "media:source-image", storageId }],
		dependencyBindings: [],
	});
	expect(reviewed.issues).toEqual([]);
	const applied = await authed.mutation(fn("apply"), {
		receiptId: reviewed.receiptId,
		expectedDigest: reviewed.digest,
		confirmLive: true,
	});
	const pageId = applied.mappings.find(
		(row: any) => row.key === "page:source-page",
	).targetId;
	const state = await t.run(async (ctx) => ({
		page: await ctx.db.get(pageId),
		media: await ctx.db.query("media").unique(),
		item: await ctx.db.query("menuItems").unique(),
		reading: await ctx.db
			.query("settings")
			.withIndex("by_section", (q) => q.eq("section", "reading"))
			.unique(),
	}));
	expect(state.page.featuredImageId).toBe(state.media!._id);
	expect(state.item!.objectId).toBe(pageId);
	expect(state.reading!.values.homepageId).toBe(pageId);
	expect(state.page.blocks[0].attrs.href).toBe(state.media!.url);
	expect(state.media!.storageId).toBe(storageId);
});
test("unverified media and duplicate target dependency bindings never become ready", async () => {
	const { authed } = await fixture();
	const m = manifest();
	m.records.push({
		key: "media:unverified",
		kind: "media",
		sourceRevision: "m",
		data: {
			title: "Image",
			fileName: "image.png",
			slug: "image",
			mimeType: "image/png",
			fileSize: 100,
			sha256: "bad-hash",
			mediaType: "image",
		},
	});
	const review = await authed.mutation(fn("dryRun"), {
		manifest: m,
		...bindings,
	});
	expect(review.ready).toBe(false);
	expect(
		review.issues.some(
			(issue: any) => issue.code === "TARGET_MEDIA_UPLOAD_REQUIRED",
		),
	).toBe(true);
	await expect(
		authed.mutation(fn("dryRun"), {
			manifest: manifest(),
			mediaBindings: [],
			dependencyBindings: [{ key: "outside", targetId: "one" }],
		}),
	).rejects.toBeDefined();
});
test("a changed persisted review plan is rejected before content writes", async () => {
	const { t, authed } = await fixture();
	const m = manifest();
	m.records.push({
		key: "event:late",
		kind: "event",
		sourceRevision: "r",
		data: {
			title: "Late",
			slug: "late",
			description: "",
			startsAt: 1,
			endsAt: 2,
			timeZone: "UTC",
			venue: "",
			venueAddress: "",
			status: "published",
		},
	});
	m.dependencies = [];
	const review = await authed.mutation(fn("dryRun"), {
		manifest: m,
		...bindings,
	});
	await t.run(async (ctx) => {
		const id = ctx.db.normalizeId(
			"contentPromotion_receipts",
			review.receiptId,
		)!;
		const receipt = await ctx.db.get(id);
		const saved = JSON.parse(receipt!.planJson);
		saved.plan.changes[1].kind = "invalid";
		await ctx.db.patch(id, { planJson: JSON.stringify(saved) });
	});
	await expect(
		authed.mutation(fn("apply"), {
			receiptId: review.receiptId,
			expectedDigest: review.digest,
			confirmLive: true,
		}),
	).rejects.toBeDefined();
	expect(await t.run((ctx) => ctx.db.query("posts").collect())).toHaveLength(0);
});
test("source export discovers page/media/event dependencies without users or target origins", async () => {
	const { t, authed, userId } = await fixture();
	const source = {
		...target,
		environmentKind: "staging" as const,
		instanceKey: "site:staging",
		deploymentOrigin: "https://source.convex.cloud",
		siteOrigin: "https://source.example.test",
	};
	const selected = await t.run(async (ctx) => {
		const site = await ctx.db.query("convexpress_siteIdentity").unique();
		await ctx.db.patch(site!._id, source);
		const storageId = await ctx.storage.store(new Blob(["export-image"]));
		const url = await ctx.storage.getUrl(storageId);
		const mediaId = await ctx.db.insert("media", {
			title: "Image",
			fileName: "image.png",
			slug: "image",
			mimeType: "image/png",
			mediaType: "image",
			fileSize: 12,
			storageId,
			url: url!,
			status: "active",
			uploadedBy: userId,
			createdAt: 1,
			updatedAt: 1,
		});
		const pageId = await ctx.db.insert("posts", {
			type: "page",
			title: "Export me",
			slug: "export-me",
			status: "publish",
			visibility: "public",
			commentStatus: "closed",
			authorId: userId,
			featuredImageId: mediaId,
			contentMode: "blocks",
			blocks: [
				{ id: "source-events", name: "events/upcoming", version: 1, attrs: {} },
			],
			createdAt: 1,
			updatedAt: 1,
		});
		const eventId = await ctx.db.insert("extension_events", {
			title: "Morning",
			slug: "morning",
			description: "Mountain morning",
			startsAt: Date.now() + 1000,
			endsAt: Date.now() + 2000,
			timeZone: "UTC",
			venue: "House",
			venueAddress: "",
			status: "published",
			createdBy: userId,
			createdAt: 1,
			updatedAt: 1,
		});
		return { pageId, mediaId, eventId };
	});
	const exported = await authed.query(
		makeFunctionReference<"query">(
			"contentPromotion/operations:exportManifest",
		),
		{
			target,
			selection: {
				pageIds: [selected.pageId],
				postIds: [],
				menuIds: [],
				mediaIds: [],
				eventIds: [],
				includePresentation: false,
			},
		},
	);
	expect(exported.manifest.issues).toEqual([]);
	expect(exported.manifest.records.map((row: any) => row.kind).sort()).toEqual([
		"event",
		"media",
		"page",
	]);
	const page = exported.manifest.records.find(
		(row: any) => row.kind === "page",
	);
	expect(page.data.authorId).toBeUndefined();
	expect(page.data.featuredImageId).toBe(
		`@promotion:media:${selected.mediaId}`,
	);
	expect(page.data.blocks[0].id).not.toBe("source-events");
	expect(exported.downloadUrls[0].url).toContain("/api/storage/");
	expect(JSON.stringify(exported.manifest.records)).not.toContain(
		"/api/storage/",
	);
	expect(
		(await t.run((ctx) => ctx.db.get(selected.pageId)))!.blocks![0].id,
	).toBe("source-events");
});
test("promotion and rollback update the author's published-post total with the source transaction", async () => {
  const { t, authed, userId } = await fixture();
  await t.run(async ctx => {
    const initial = await beginAuthorPostCountRepair(ctx, userId);
    const complete = await advanceAuthorPostCountRepair(ctx, initial.next!);
    await patchWithMediaReferences(ctx, "users", userId, { postCount: complete.update!.count, postCountReady: true });
    const postId = await insertWithMediaReferences(ctx, "posts", { type: "post", title: "Live post", slug: "welcome", status: "publish",
      visibility: "public", commentStatus: "closed", authorId: userId, publishedAt: 100, createdAt: 1, updatedAt: 1 });
    const termId = await ctx.db.insert("terms", { name: "Field", slug: "field", taxonomy: "category", count: 1, isDefault: false, createdAt: 1, updatedAt: 1 });
    await insertTermRelationship(ctx, { postId, termId });
  });
  const repairTerms = () => t.run(async ctx => {
    const term = (await ctx.db.query("terms").first())!;
    let task = await beginTermCountRepair(ctx, term._id, true);
    while (task) task = await advanceTermCountRepair(ctx, task);
    return (await ctx.db.get(term._id))!.count;
  });
  expect(await repairTerms()).toBe(1);
  const draft = manifest();
  draft.selection.pageIds = []; draft.selection.postIds = ["source-post"];
  draft.records = [{ key: "post:source-post", kind: "post", sourceRevision: "source-revision",
    data: { title: "Updated post", slug: "welcome", status: "draft", visibility: "public", commentStatus: "closed" } }];
  draft.records.push(
    { key: "term:field", kind: "term", sourceRevision: "1", data: { name: "Field", slug: "field", taxonomy: "category" } },
    { key: "termRelationship:field", kind: "termRelationship", sourceRevision: "1", data: { postId: "@promotion:post:source-post", termId: "@promotion:term:field" } },
  );
  const review = await authed.mutation(fn("dryRun"), { manifest: draft, ...bindings });
  expect(review.issues).toEqual([]);
  const args = { receiptId: review.receiptId, expectedDigest: review.digest, confirmLive: true };
  expect((await t.run(ctx => ctx.db.get(userId)))?.postCount).toBe(1);
  const discovery = () => t.run(async ctx => (await ctx.db.query("termRelationships").first())?.discoveryEligible);
  expect(await discovery()).toBe(true);
  expect(await repairTerms()).toBe(1); // Review must survive an unchanged count rebuild.
  await authed.mutation(fn("apply"), args);
  expect((await t.run(ctx => ctx.db.get(userId)))?.postCount).toBe(0);
  expect(await discovery()).toBe(false);
  expect(await repairTerms()).toBe(0); // Recovery must not look like a conflicting editorial edit.
  await authed.mutation(fn("rollback"), args);
  expect(await repairTerms()).toBe(1);
  expect((await t.run(ctx => ctx.db.get(userId)))?.postCount).toBe(1);
  expect(await discovery()).toBe(true);
  await authed.mutation(fn("rollback"), args);
  expect((await t.run(ctx => ctx.db.get(userId)))?.postCount).toBe(1);
  expect(await discovery()).toBe(true);
});

test("update-only rollback restores the exact backed-up target and refuses later edits", async () => {
	const { t, authed, userId } = await fixture();
	const id = await t.run((ctx) =>
		ctx.db.insert("posts", {
			type: "page",
			title: "Original live",
			slug: "welcome",
			path: "/welcome",
			status: "publish",
			visibility: "public",
			commentStatus: "closed",
			authorId: userId,
			createdAt: 1,
			updatedAt: 1,
		}),
	);
	const before = await t.run((ctx) => ctx.db.get(id));
	const review = await authed.mutation(fn("dryRun"), {
		manifest: manifest(),
		...bindings,
	});
	const args = {
		receiptId: review.receiptId,
		expectedDigest: review.digest,
		confirmLive: true,
	};
	await authed.mutation(fn("apply"), args);
	await authed.mutation(fn("rollback"), args);
	expect(await t.run((ctx) => ctx.db.get(id))).toEqual(before);
	expect(await authed.mutation(fn("rollback"), args)).toEqual({
		receiptId: review.receiptId,
		status: "rolled-back",
	});
	const next = await authed.mutation(fn("dryRun"), {
		manifest: manifest(),
		...bindings,
	});
	const nextArgs = {
		receiptId: next.receiptId,
		expectedDigest: next.digest,
		confirmLive: true,
	};
	await authed.mutation(fn("apply"), nextArgs);
	await t.run((ctx) => ctx.db.patch(id, { title: "Later live edit" }));
	await expect(authed.mutation(fn("rollback"), nextArgs)).rejects.toBeDefined();
	expect((await t.run((ctx) => ctx.db.get(id)))!.title).toBe("Later live edit");
});
test("rollback never deletes created content with potentially new external references", async () => {
	const { t, authed } = await fixture();
	const review = await authed.mutation(fn("dryRun"), {
		manifest: manifest(),
		...bindings,
	});
	const args = {
		receiptId: review.receiptId,
		expectedDigest: review.digest,
		confirmLive: true,
	};
	await authed.mutation(fn("apply"), args);
	await expect(authed.mutation(fn("rollback"), args)).rejects.toBeDefined();
	expect(await t.run((ctx) => ctx.db.query("posts").collect())).toHaveLength(1);
});
test("apply rechecks operator authorization and receipts cannot cross operators", async () => {
	const { t, authed, userId } = await fixture();
	const review = await authed.mutation(fn("dryRun"), {
		manifest: manifest(),
		...bindings,
	});
	const operator = await t.run((ctx) => ctx.db.get(userId));
	const otherId = await t.run((ctx) =>
		ctx.db.insert("users", {
			email: "other@example.test",
			emailVerified: true,
			status: "active",
			authSource: "local",
			roleId: operator!.roleId,
			createdAt: 1,
			updatedAt: 1,
		}),
	);
	const other = t.withIdentity({
		subject: otherId,
		issuer: "https://convexpress-admin.local",
	});
	const args = {
		receiptId: review.receiptId,
		expectedDigest: review.digest,
		confirmLive: true,
	};
	await expect(other.mutation(fn("apply"), args)).rejects.toBeDefined();
	await t.run((ctx) => ctx.db.patch(operator!.roleId!, { status: "inactive" }));
	await expect(authed.mutation(fn("apply"), args)).rejects.toBeDefined();
	expect(await t.run((ctx) => ctx.db.query("posts").collect())).toHaveLength(0);
});
test("malformed reading/template values and dependency kind substitutions are rejected", async () => {
	const { authed } = await fixture();
	for (const values of [{ homepageDisplays: "static" }, { postsPerPage: -1 }]) {
		const m = manifest();
		m.records.push({
			key: "reading",
			kind: "presentation",
			sourceRevision: "v",
			data: { section: "reading", values },
		});
		await expect(
			authed.mutation(fn("dryRun"), { manifest: m, ...bindings }),
		).rejects.toBeDefined();
	}
	const m = manifest();
	m.records.push({
		key: "template",
		kind: "presentation",
		sourceRevision: "v",
		data: {
			section: "appearance.template",
			values: {
				active: "core",
				overrides: {},
				variants: {},
				settings: { core: { header: [] } },
			},
		},
	});
	await expect(
		authed.mutation(fn("dryRun"), { manifest: m, ...bindings }),
	).rejects.toBeDefined();
	const wrong = manifest();
	wrong.records[0].data.featuredImageId = "@promotion:page:source-page";
	await expect(
		authed.mutation(fn("dryRun"), { manifest: wrong, ...bindings }),
	).rejects.toBeDefined();
});
test("settings management alone cannot bypass content authoring capabilities", async () => {
	const { t, authed, userId } = await fixture();
	const user = await t.run((ctx) => ctx.db.get(userId));
	await t.run((ctx) =>
		ctx.db.patch(user!.roleId!, { capabilities: ["manage_options"] }),
	);
	await expect(
		authed.mutation(fn("dryRun"), { manifest: manifest(), ...bindings }),
	).rejects.toBeDefined();
	expect(
		await t.run((ctx) => ctx.db.query("contentPromotion_receipts").collect()),
	).toHaveLength(0);
});

test("canonical activation preserves schema-version and future block-contract refusal", async () => {
  const { t, authed } = await fixture();
  const mixed = manifest();
  mixed.source.schemaVersion = "future-content-model";
  await expect(authed.mutation(fn("dryRun"), { manifest: mixed, ...bindings })).rejects.toThrow("Source and target schema versions differ");
  const future = manifest();
  future.records[0].data.blocks = [{ id: "future", name: "core/paragraph", version: 1, attrs: { text: "Future" }, children: [] }];
  await expect(authed.mutation(fn("dryRun"), { manifest: future, ...bindings })).rejects.toThrow("unified children tree");
  expect(await t.run((ctx) => ctx.db.query("contentPromotion_receipts").collect())).toHaveLength(0);
  expect(await t.run((ctx) => ctx.db.query("posts").collect())).toHaveLength(0);
});

test("canonical review enforces atomic record and UTF-8 byte bounds before receipts", async () => {
  const { t, authed } = await fixture();
  const excessive = manifest();
  excessive.records = Array.from({ length: 101 }, (_, index) => ({ ...manifest().records[0], key: `page:${index}`, data: { ...manifest().records[0].data, slug: `page-${index}`, blocks: [] } }));
  await expect(authed.mutation(fn("dryRun"), { manifest: excessive, ...bindings })).rejects.toBeDefined();
  const oversized = manifest();
  oversized.records[0].data.content = "界".repeat(170_000);
  await expect(authed.mutation(fn("dryRun"), { manifest: oversized, ...bindings })).rejects.toThrow("500KB atomic promotion limit");
  expect(await t.run((ctx) => ctx.db.query("contentPromotion_receipts").collect())).toHaveLength(0);
  expect(await t.run((ctx) => ctx.db.query("posts").collect())).toHaveLength(0);
});

test("expired canonical receipts cannot apply or create mappings", async () => {
  const { t, authed } = await fixture();
  const review = await authed.mutation(fn("dryRun"), { manifest: manifest(), ...bindings });
  await t.run(async (ctx) => {
    const receiptId = ctx.db.normalizeId("contentPromotion_receipts", review.receiptId);
    if (!receiptId) throw new Error("Expected persisted canonical receipt");
    await ctx.db.patch(receiptId, { expiresAt: Date.now() - 1 });
  });
  await expect(authed.mutation(fn("apply"), { receiptId: review.receiptId, expectedDigest: review.digest, confirmLive: true })).rejects.toThrow("Review expired");
  expect(await t.run((ctx) => ctx.db.query("posts").collect())).toHaveLength(0);
  expect(await t.run((ctx) => ctx.db.query("contentPromotion_mappings").collect())).toHaveLength(0);
});

function catalogManifest(): ContentPromotionManifest {
  const m = manifest();
  m.selection = { ...m.selection, pageIds: [], productIds: ["source-product"] };
  m.records = [
    { key: "productCategory:source-category", kind: "productCategory", sourceRevision: "c1", data: { name: "Retreat goods", slug: "retreat-goods", isVisible: true } },
    { key: "product:source-product", kind: "product", sourceRevision: "p1", data: { title: "Forest camp mug", slug: "forest-camp-mug", sku: "ASTER-MUG", status: "publish", productType: "variable", categoryIds: ["@promotion:productCategory:source-category"], galleryMediaIds: [], basePrice: { amount: 3800, currencyCode: "USD" }, options: [{ name: "Color", values: ["Stone"] }] } },
    { key: "productVariant:source-variant", kind: "productVariant", sourceRevision: "v1", data: { productId: "@promotion:product:source-product", title: "Stone", sku: "ASTER-MUG-STONE", status: "publish", options: [{ name: "Color", value: "Stone" }], price: { amount: 3800, currencyCode: "USD" }, isDefault: true } },
  ];
  return m;
}
async function commerceFixture() {
  const f = await fixture();
  await f.t.run(async ctx => {
    const plugins = await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "plugins")).unique();
    await ctx.db.patch(plugins!._id, { values: { ...plugins!.values, commerceEnabled: true } });
    await ctx.db.insert("settings", { section: "commerce.general", values: { currencyCode: "USD" }, updatedAt: 1, updatedBy: f.userId });
  });
  return f;
}

test("catalog apply maps categories and variant options, starts with no sellable stock and retries without hooks", async () => {
  const { t, authed, userId } = await commerceFixture();
  const m = catalogManifest();
  const review = await authed.mutation(fn("dryRun"), { manifest: m, ...bindings });
  expect(review.ready).toBe(true);
  const args = { receiptId: review.receiptId, expectedDigest: review.digest, confirmLive: true };
  const applied = await authed.mutation(fn("apply"), args);
  expect(await authed.mutation(fn("apply"), args)).toEqual(applied);
  const rows = await t.run(async ctx => ({ products: await ctx.db.query("commerce_products").collect(), variants: await ctx.db.query("commerce_product_variants").collect(), categories: await ctx.db.query("commerce_product_categories").collect(), scheduled: await ctx.db.system.query("_scheduled_functions").collect() }));
  expect(rows.products).toHaveLength(1); expect(rows.variants).toHaveLength(1);
  const product = rows.products[0], variant = rows.variants[0];
  expect(product.authorId).toBe(userId); expect(product.stockQuantity).toBe(0); expect(product.trackInventory).toBe(true); expect(product.allowBackorders).toBe(false);
  expect(product.categoryIds).toEqual([rows.categories[0]._id]); expect(rows.categories[0].productCount).toBe(1);
  expect(variant.productId).toBe(product._id); expect(variant.stockQuantity).toBe(0); expect(variant.manageStock).toBe("yes"); expect(variant.stockStatus).toBe("outofstock"); expect(variant.backorders).toBe("no");
  expect(variant.selections?.[0].optionTypeId).toBe(product.optionTypes[0].id);
  expect(variant.selections?.[0].optionValueId).toBe(product.optionTypes[0].values[0].id);
  expect(variant.selectionKey).toBe(`${product.optionTypes[0].id}:${product.optionTypes[0].values[0].id}`);
  expect(rows.scheduled).toHaveLength(0);
});

test("catalog manifest refuses stock, provider, tag and delivery payloads", async () => {
  const { authed } = await commerceFixture();
  for (const protectedFields of [{ stockQuantity: 999 }, { trackInventory: false }, { stripeProductId: "source-provider" }, { tags: ["copied"] }, { rawSourceMeta: "secret" }, { isDownloadable: true }]) {
    const m = catalogManifest(); Object.assign(m.records[1].data, protectedFields);
    await expect(authed.mutation(fn("dryRun"), { manifest: m, ...bindings })).rejects.toBeDefined();
  }
});

test("catalog review blocks disabled commerce and target SKU ownership conflicts", async () => {
  const { t, authed, userId } = await commerceFixture();
  await t.run(ctx => ctx.db.insert("commerce_products", { title: "Unrelated live product", slug: "other", sku: "ASTER-MUG", authorId: userId, productType: "simple", status: "publish", galleryMediaIds: [], categoryIds: [], basePrice: { amount: 1900, currencyCode: "USD" }, trackInventory: true, stockQuantity: 7, allowBackorders: false, isVirtual: false, isDownloadable: false, createdAt: 1, updatedAt: 1 }));
  const conflict = await authed.mutation(fn("dryRun"), { manifest: catalogManifest(), ...bindings });
  expect(conflict.ready).toBe(false); expect(conflict.issues.some((i: {code: string}) => i.code === "TARGET_SKU_CONFLICT")).toBe(true);
  await t.run(async ctx => { const plugins = await ctx.db.query("settings").withIndex("by_section", q=>q.eq("section","plugins")).unique(); await ctx.db.patch(plugins!._id,{values:{commerceEnabled:false}}); });
  const disabled = await authed.mutation(fn("dryRun"), { manifest: catalogManifest(), ...bindings });
  expect(disabled.ready).toBe(false); expect(disabled.issues.some((i:{code:string}) => i.code === "TARGET_PLUGIN_DISABLED")).toBe(true);
  expect(await t.run(ctx=>ctx.db.query("commerce_products").collect())).toHaveLength(1);
});

async function applyCatalog(f: Awaited<ReturnType<typeof commerceFixture>>, m=catalogManifest()) {
  const review = await f.authed.mutation(fn("dryRun"),{manifest:m,...bindings});
  expect(review.ready).toBe(true);
  return f.authed.mutation(fn("apply"),{receiptId:review.receiptId,expectedDigest:review.digest,confirmLive:true});
}
test("catalog updates preserve target inventory and external identifiers, conflict on live changes and roll back authored updates",async()=>{
  const f=await commerceFixture(); await applyCatalog(f);
  const prior=await f.t.run(async ctx=>{
    const product=(await ctx.db.query("commerce_products").unique())!;
    const variant=(await ctx.db.query("commerce_product_variants").unique())!;
    await ctx.db.patch(product._id,{stockQuantity:23,allowBackorders:true,salePrice:{amount:3500,currencyCode:"USD"},rawSourceMeta:"target-owned metadata"});
    await ctx.db.patch(variant._id,{stockQuantity:9,manageStock:"parent",stockStatus:"instock",backorders:"notify",globalUniqueId:"target-global-identifier"});
    return {product:await ctx.db.get(product._id),variant:await ctx.db.get(variant._id),users:await ctx.db.query("users").collect()};
  });
  const m=catalogManifest();m.records[1].data.title="Forest mug, revised";m.records[1].data.basePrice={amount:4200,currencyCode:"USD"};m.records[2].data.price={amount:4200,currencyCode:"USD"};
  const review=await f.authed.mutation(fn("dryRun"),{manifest:m,...bindings});expect(review.ready).toBe(true);
  expect(review.changes.find((change:{kind:string})=>change.kind==="product").fields).toContain("salePrice");
  const args={receiptId:review.receiptId,expectedDigest:review.digest,confirmLive:true};await f.authed.mutation(fn("apply"),args);
  const after=await f.t.run(async ctx=>({product:await ctx.db.get(prior.product!._id),variant:await ctx.db.get(prior.variant!._id),users:await ctx.db.query("users").collect(),scheduled:await ctx.db.system.query("_scheduled_functions").collect()}));
  expect(after.product!.title).toBe("Forest mug, revised");expect(after.product!.basePrice.amount).toBe(4200);
  expect(after.product!.salePrice).toBeUndefined();expect(after.product!.stockQuantity).toBe(23);expect(after.product!.allowBackorders).toBe(true);expect(after.product!.rawSourceMeta).toBe("target-owned metadata");
  expect(after.variant!.stockQuantity).toBe(9);expect(after.variant!.manageStock).toBe("parent");expect(after.variant!.backorders).toBe("notify");expect(after.variant!.globalUniqueId).toBe("target-global-identifier");
  expect(after.variant!.selections).toEqual(prior.variant!.selections);expect(after.users).toEqual(prior.users);expect(after.scheduled).toHaveLength(0);
  await f.authed.mutation(fn("rollback"),args);
  expect(await f.t.run(ctx=>ctx.db.get(prior.product!._id))).toEqual(prior.product);
  expect(await f.t.run(ctx=>ctx.db.get(prior.variant!._id))).toEqual(prior.variant);
  const stale=await f.authed.mutation(fn("dryRun"),{manifest:m,...bindings});
  await f.t.run(ctx=>ctx.db.patch(prior.product!._id,{stockQuantity:22}));
  await expect(f.authed.mutation(fn("apply"),{receiptId:stale.receiptId,expectedDigest:stale.digest,confirmLive:true})).rejects.toThrow("Target content or dependencies changed");
});

test("product-showcase source export discovers physical catalog and target-only media/variant IDs",async()=>{
  const source=await commerceFixture();await applyCatalog(source);
  const bytes=new Blob(["original-mug-media"]);
  const selected=await source.t.run(async ctx=>{
    const site=(await ctx.db.query("convexpress_siteIdentity").unique())!;
    await ctx.db.patch(site._id,{instanceKey:"site:staging",environmentKind:"staging",deploymentOrigin:"https://source.convex.cloud",siteOrigin:"https://source.example.test"});
    const storageId=await ctx.storage.store(bytes);const storage=await ctx.db.system.get(storageId);const url=(await ctx.storage.getUrl(storageId))!;
    const mediaId=await ctx.db.insert("media",{title:"Forest mug",fileName:"mug.png",slug:"mug-photo",mimeType:"image/png",mediaType:"image",fileSize:storage!.size,storageId,url,status:"active",uploadedBy:source.userId,createdAt:1,updatedAt:1});
    const product=(await ctx.db.query("commerce_products").unique())!;const variant=(await ctx.db.query("commerce_product_variants").unique())!;
    await ctx.db.patch(product._id,{stockQuantity:47,featuredMediaId:mediaId,galleryMediaIds:[mediaId],rawSourceMeta:"source provider-only metadata"});
    await ctx.db.patch(variant._id,{stockQuantity:36,featuredMediaId:mediaId,globalUniqueId:"source-global-id"});
    const pageId=await ctx.db.insert("posts",{type:"page",title:"Aster House",slug:"aster-house",status:"publish",visibility:"public",commentStatus:"closed",authorId:source.userId,contentMode:"blocks",blocks:[{id:"showcase",name:"commerce/product-showcase",version:1,attrs:{source:"newest",count:4}}],createdAt:1,updatedAt:1});
    return {pageId,productId:product._id,variantId:variant._id};
  });
  const before=await source.t.run(async ctx=>({product:await ctx.db.get(selected.productId),variant:await ctx.db.get(selected.variantId)}));
  const exported=await source.authed.query(makeFunctionReference<"query">("contentPromotion/operations:exportManifest"),{target,selection:{...manifest().selection,pageIds:[selected.pageId]}});
  expect(exported.manifest.records.map((r:{kind:string})=>r.kind).sort()).toEqual(["media","page","product","productCategory","productVariant"]);
  expect(exported.manifest.dependencies.some((d:{kind:string})=>d.kind==="catalog")).toBe(false);
  const serialized=JSON.stringify(exported.manifest);
  expect(serialized).not.toContain("stockQuantity");expect(serialized).not.toContain("source-global-id");expect(serialized).not.toContain("source provider-only metadata");
  expect(await source.t.run(async ctx=>({product:await ctx.db.get(selected.productId),variant:await ctx.db.get(selected.variantId)}))).toEqual(before);
  const live=await commerceFixture();const storageId=await live.t.run(ctx=>ctx.storage.store(bytes));
  const media=exported.manifest.records.find((r:{kind:string})=>r.kind==="media");
  const review=await live.authed.mutation(fn("dryRun"),{manifest:exported.manifest,mediaBindings:[{key:media.key,storageId}],dependencyBindings:[]});expect(review.ready).toBe(true);
  await live.authed.mutation(fn("apply"),{receiptId:review.receiptId,expectedDigest:review.digest,confirmLive:true});
  const result=await live.t.run(async ctx=>({product:(await ctx.db.query("commerce_products").unique())!,variant:(await ctx.db.query("commerce_product_variants").unique())!,media:(await ctx.db.query("media").unique())!,scheduled:await ctx.db.system.query("_scheduled_functions").collect()}));
  expect(result.product.featuredMediaId).toBe(result.media._id);expect(result.product.galleryMediaIds).toEqual([result.media._id]);expect(result.variant.featuredMediaId).toBe(result.media._id);expect(result.variant.productId).toBe(result.product._id);
  expect(result.media.storageId).toBe(storageId);expect(result.product.stockQuantity).toBe(0);expect(result.variant.stockQuantity).toBe(0);expect(result.variant.globalUniqueId).toBeUndefined();expect(result.scheduled).toHaveLength(0);
});

test("catalog validation blocks duplicate selections/defaults, mismatched currency and wrong reference kinds",async()=>{
  const f=await commerceFixture();
  const duplicate=catalogManifest();duplicate.records.push({...duplicate.records[2],key:"productVariant:second",data:{...duplicate.records[2].data,sku:"SECOND"}});
  await expect(f.authed.mutation(fn("dryRun"),{manifest:duplicate,...bindings})).rejects.toThrow("exactly one default");
  duplicate.records[3].data.isDefault=false;await expect(f.authed.mutation(fn("dryRun"),{manifest:duplicate,...bindings})).rejects.toThrow("complete and unique");
  const wrong=catalogManifest();wrong.records[1].data.featuredMediaId="@promotion:productCategory:source-category";
  await expect(f.authed.mutation(fn("dryRun"),{manifest:wrong,...bindings})).rejects.toThrow("wrong dependency kind");
  const currency=catalogManifest();currency.records[1].data.basePrice={amount:3800,currencyCode:"EUR"};currency.records[2].data.price={amount:3800,currencyCode:"EUR"};
  const review=await f.authed.mutation(fn("dryRun"),{manifest:currency,...bindings});expect(review.ready).toBe(false);expect(review.issues.some((i:{code:string})=>i.code==="TARGET_CURRENCY_MISMATCH")).toBe(true);
});

test("catalog category ancestry/counts are remapped and unsupported collection removals stay blocked",async()=>{
  const f=await commerceFixture();const m=catalogManifest();
  m.records.unshift({key:"productCategory:parent",kind:"productCategory",sourceRevision:"parent",data:{name:"Home",slug:"home"}});
  m.records[1].data.parentId="@promotion:productCategory:parent";
  await applyCatalog(f,m);
  const categories=await f.t.run(ctx=>ctx.db.query("commerce_product_categories").collect());
  const parent=categories.find(c=>c.slug==="home")!,child=categories.find(c=>c.slug==="retreat-goods")!;
  expect(child.parentId).toBe(parent._id);expect(child.path).toEqual([parent._id]);expect(child.depth).toBe(1);expect(parent.productCount).toBe(0);expect(parent.totalProductCount).toBe(1);expect(child.productCount).toBe(1);
  const update=structuredClone(m);update.records.find(r=>r.kind==="product")!.data.status="draft";
  await applyCatalog(f,update);
  const after=await f.t.run(ctx=>ctx.db.get(parent._id));expect(after!.totalProductCount).toBe(0);
  const removed=catalogManifest();removed.records[1].data.productType="simple";removed.records[1].data.options=[];removed.records=removed.records.filter(r=>r.kind!=="productVariant");
  const review=await f.authed.mutation(fn("dryRun"),{manifest:removed,...bindings});expect(review.ready).toBe(false);expect(review.issues.some((i:{code:string})=>i.code==="TARGET_VARIANT_COLLECTION_CONFLICT")).toBe(true);
});

test("new variants cannot bypass an existing untracked parent's inventory policy",async()=>{
  const f=await commerceFixture();await applyCatalog(f);
  await f.t.run(async ctx=>{const product=(await ctx.db.query("commerce_products").unique())!;await ctx.db.patch(product._id,{trackInventory:false});});
  const m=catalogManifest();m.records[1].data.options=[{name:"Color",values:["Stone","Pine"]}];
  m.records.push({key:"productVariant:pine",kind:"productVariant",sourceRevision:"pine",data:{...m.records[2].data,sku:"ASTER-MUG-PINE",title:"Pine",options:[{name:"Color",value:"Pine"}],isDefault:false}});
  const review=await f.authed.mutation(fn("dryRun"),{manifest:m,...bindings});expect(review.ready).toBe(false);expect(review.issues.some((i:{code:string})=>i.code==="TARGET_VARIANT_STOCK_POLICY")).toBe(true);
});

test("source export refuses digital and external catalog delivery instead of silently publishing physical substitutes", async () => {
  const source = await commerceFixture();
  await applyCatalog(source);
  const productId = await source.t.run(async ctx => {
    const site = (await ctx.db.query("convexpress_siteIdentity").unique())!;
    await ctx.db.patch(site._id, { instanceKey: "site:staging", environmentKind: "staging", deploymentOrigin: "https://source.convex.cloud", siteOrigin: "https://source.example.test" });
    return (await ctx.db.query("commerce_products").unique())!._id;
  });
  for (const unsupported of [{ isDownloadable: true, productType: "variable" as const }, { isDownloadable: false, productType: "external" as const }]) {
    await source.t.run(ctx => ctx.db.patch(productId, unsupported));
    const before = await source.t.run(ctx => ctx.db.get(productId));
    await expect(source.authed.query(makeFunctionReference<"query">("contentPromotion/operations:exportManifest"), { target, selection: { ...manifest().selection, pageIds: [], productIds: [productId] } })).rejects.toThrow("explicit adapters");
    expect(await source.t.run(ctx => ctx.db.get(productId))).toEqual(before);
  }
  expect(await source.t.run(ctx => ctx.db.system.query("_scheduled_functions").collect())).toHaveLength(0);
});

function learningManifest(): ContentPromotionManifest {
  return { ...manifest(), selection: { ...manifest().selection, pageIds: [], courseIds: ["course-source"], planIds: ["plan-source"] }, records: [
    { key: "plan:source", kind: "plan", sourceRevision: "1", data: { title: "House members", slug: "house-members", status: "active", grantMode: "manual", priority: 1 } },
    { key: "planBenefit:source", kind: "planBenefit", sourceRevision: "1", data: { planId: "@promotion:plan:source", code: "house-learning", label: "Retreat learning", displayAsFeature: true } },
    { key: "course:source", kind: "course", sourceRevision: "1", data: { title: "A slower morning", slug: "a-slower-morning", status: "published", accessMode: "members", progressionMode: "linear", contentVisibility: "enrollees_only" } },
    { key: "courseNode:topic", kind: "courseNode", sourceRevision: "1", data: { courseId: "@promotion:course:source", kind: "topic", title: "Begin here", position: 0 } },
    { key: "courseNode:lesson", kind: "courseNode", sourceRevision: "1", data: { courseId: "@promotion:course:source", parentId: "@promotion:courseNode:topic", kind: "lesson", title: "Notice the light", position: 0, bodyDoc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "A fictional retreat exercise." }] }] } } },
    { key: "restriction:course", kind: "restriction", sourceRevision: "1", data: { resourceType: "course", resourceIdOrKey: "@promotion:course:source", ruleMode: "allow_only", planIds: ["@promotion:plan:source"], teaserMode: "excerpt", loginRequired: true } },
  ], dependencies: [], issues: [] };
}
async function learningFixture() {
  const f = await fixture();
  await f.t.run(async ctx => { const user = (await ctx.db.get(f.userId))!; const role = (await ctx.db.get(user.roleId!))!; await ctx.db.patch(role._id, { capabilities: [...role.capabilities, "lms.course.create", "lms.course.edit", "lms.course.publish", "lms.builder.manage", "lms.lesson.edit"] }); const plugins = (await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "plugins")).unique())!; await ctx.db.patch(plugins._id, { values: { ...plugins.values, lmsEnabled: true, membershipEnabled: true } }); });
  return f;
}
test("course promotion and rollback replace category coordinates with the authoritative course", async () => {
  const f = await learningFixture();
  const id = await f.t.run(ctx => insertWithMediaReferences(ctx, "lms_courses", {
    title: "Original course", slug: "a-slower-morning", status: "published", categoryIds: ["Wood"],
    authorId: f.userId, createdAt: 1, updatedAt: 1,
  }));
  const source = learningManifest();
  const course = source.records.find(record => record.kind === "course")!;
  const selected = { ...source, selection: { ...source.selection, planIds: [] }, records: [{ ...course, data: { ...course.data, accessMode: "open", categoryIds: ["paper"] } }] };
  const review = await f.authed.mutation(fn("dryRun"), { manifest: selected, ...bindings });
  expect(review.issues).toEqual([]);
  const args = { receiptId: review.receiptId, expectedDigest: review.digest, confirmLive: true };
  await f.authed.mutation(fn("apply"), args);
  const keys = () => f.t.run(async ctx => (await ctx.db.query("lms_course_catalog").withIndex("by_course", q => q.eq("courseId", id)).collect()).map(row => `${row.kind}:${row.key}`).sort());
  expect(await keys()).toEqual(["category:paper", "recent:"]);
  await f.authed.mutation(fn("rollback"), args);
  expect(await keys()).toEqual(["category:wood", "recent:"]);
  expect((await f.t.run(ctx => ctx.db.get(id)))?.categoryIds).toEqual(["Wood"]);
});
test("learning promotion creates mapped curriculum and member gate without learner records or deliveries", async () => {
  const f = await learningFixture();
  const review = await f.authed.mutation(fn("dryRun"), { manifest: learningManifest(), ...bindings });
  expect(review.issues).toEqual([]);
  const args = { receiptId: review.receiptId, expectedDigest: review.digest, confirmLive: true };
  const result = await f.authed.mutation(fn("apply"), args);
  expect(await f.authed.mutation(fn("apply"), args)).toEqual(result);
  const rows = await f.t.run(async ctx => ({ course: (await ctx.db.query("lms_courses").unique())!, nodes: await ctx.db.query("lms_nodes").collect(), plan: (await ctx.db.query("membership_plans").unique())!, rule: (await ctx.db.query("membership_restriction_rules").unique())!, enrollments: await ctx.db.query("lms_enrollments").collect(), grants: await ctx.db.query("membership_grants").collect(), scheduled: await ctx.db.system.query("_scheduled_functions").collect() }));
  expect(rows.course.lessonCount).toBe(1); expect(rows.course.topicCount).toBe(1);
  expect(rows.nodes.find(n => n.kind === "lesson")!.parentId).toBe(rows.nodes.find(n => n.kind === "topic")!._id);
  expect(rows.nodes.every(n => n.courseId === rows.course._id)).toBe(true);
  expect(rows.rule.resourceIdOrKey).toBe(rows.course._id); expect(rows.rule.planIds).toEqual([rows.plan._id]);
  expect(rows.plan.linkedSubscriptionCode).toBeUndefined(); expect(rows.course.authorId).toBe(f.userId);
  expect(rows.enrollments).toHaveLength(0); expect(rows.grants).toHaveLength(0); expect(rows.scheduled).toHaveLength(0);
});

async function applyLearning(f: Awaited<ReturnType<typeof learningFixture>>, m = learningManifest()) {
  const review = await f.authed.mutation(fn("dryRun"), { manifest: m, ...bindings });
  expect(review.issues).toEqual([]);
  return f.authed.mutation(fn("apply"), { receiptId: review.receiptId, expectedDigest: review.digest, confirmLive: true });
}
async function seedLearningRuntime(f: Awaited<ReturnType<typeof learningFixture>>) {
  return f.t.run(async ctx => {
    const course = (await ctx.db.query("lms_courses").withIndex("by_slug", q => q.eq("slug", "a-slower-morning")).unique())!;
    const node = (await ctx.db.query("lms_nodes").withIndex("by_course_kind", q => q.eq("courseId", course._id).eq("kind", "lesson")).first())!;
    const plan = (await ctx.db.query("membership_plans").unique())!;
    const enrollmentId = await ctx.db.insert("lms_enrollments", { userId: f.userId, courseId: course._id, source: "membership_plan", membershipPlanId: plan._id, sourceRef: "target-private-billing", enrolledAt: 10, status: "active", createdAt: 10, updatedAt: 10 });
    const progressId = await ctx.db.insert("lms_progress", { userId: f.userId, courseId: course._id, nodeId: node._id, completed: true, completedAt: 20, timeSpentSec: 600 });
    const grantId = await ctx.db.insert("membership_grants", { userId: f.userId, planId: plan._id, sourceType: "subscription", sourceRef: "target-private-grant", status: "active", startsAt: 10, createdAt: 10, updatedAt: 10 });
    return { enrollment: await ctx.db.get(enrollmentId), progress: await ctx.db.get(progressId), grant: await ctx.db.get(grantId), course, node, plan };
  });
}
test("learning updates retain curriculum identity, progress, grants and target billing bindings", async () => {
  const f = await learningFixture(); await applyLearning(f); const before = await seedLearningRuntime(f);
  await f.t.run(async ctx => { await ctx.db.patch(before.plan._id, { grantMode: "subscription", linkedSubscriptionCode: "target-billing-code", linkedCapabilities: ["target.capability"] }); const benefit = (await ctx.db.query("membership_plan_benefits").unique())!; await ctx.db.patch(benefit._id, { metadata: { target: "retained" } }); });
  const m = learningManifest(); m.records[0].data.grantMode = "subscription"; m.records[0].data.title = "House members revised"; m.records[4].data.title = "Watch the light";
  await applyLearning(f, m);
  const after = await f.t.run(async ctx => ({ enrollment: await ctx.db.get(before.enrollment!._id), progress: await ctx.db.get(before.progress!._id), grant: await ctx.db.get(before.grant!._id), node: await ctx.db.get(before.node._id), plan: await ctx.db.get(before.plan._id), benefit: await ctx.db.query("membership_plan_benefits").unique(), scheduled: await ctx.db.system.query("_scheduled_functions").collect() }));
  expect(after.enrollment).toEqual(before.enrollment); expect(after.progress).toEqual(before.progress); expect(after.grant).toEqual(before.grant);
  expect(after.node!.title).toBe("Watch the light"); expect(after.plan!.linkedSubscriptionCode).toBe("target-billing-code"); expect(after.plan!.linkedCapabilities).toEqual(["target.capability"]); expect(after.benefit!.metadata).toEqual({ target: "retained" }); expect(after.scheduled).toHaveLength(0);
  const stale = await f.authed.mutation(fn("dryRun"), { manifest: m, ...bindings });
  await f.t.run(ctx => ctx.db.patch(before.plan._id, { linkedSubscriptionCode: "new-target-billing-code" }));
  await expect(f.authed.mutation(fn("apply"), { receiptId: stale.receiptId, expectedDigest: stale.digest, confirmLive: true })).rejects.toThrow("Target content or dependencies changed");
});
test("learning export remaps course gates and prerequisites without exporting source learner state", async () => {
  const source = await learningFixture(); const m = learningManifest();
  m.records.push({ key: "course:prerequisite", kind: "course", sourceRevision: "1", data: { title: "First steps", slug: "first-steps", status: "published", accessMode: "free" } }, { key: "coursePrerequisite:source", kind: "coursePrerequisite", sourceRevision: "1", data: { courseId: "@promotion:course:source", prereqCourseId: "@promotion:course:prerequisite" } });
  await applyLearning(source, m); const original = await seedLearningRuntime(source);
  await source.t.run(async ctx => { const site = (await ctx.db.query("convexpress_siteIdentity").unique())!; await ctx.db.patch(site._id, { instanceKey: "site:staging", environmentKind: "staging", deploymentOrigin: "https://source.convex.cloud", siteOrigin: "https://source.example.test" }); await ctx.db.patch(original.course._id, { categoryIds: ["slow-living"], tagIds: ["retreat"] }); });
  const exported = await source.authed.query(makeFunctionReference<"query">("contentPromotion/operations:exportManifest"), { target, selection: { ...manifest().selection, pageIds: [], courseIds: [original.course._id] } });
  expect(exported.manifest.records.map((r: {kind: string}) => r.kind).sort()).toEqual(["course", "course", "courseNode", "courseNode", "coursePrerequisite", "plan", "planBenefit", "restriction"]);
  expect(JSON.stringify(exported.manifest)).not.toContain("target-private"); expect(JSON.stringify(exported.manifest)).not.toContain("completedAt");
  const live = await learningFixture(); await applyLearning(live, exported.manifest);
  const after = await live.t.run(async ctx => ({ courses: await ctx.db.query("lms_courses").collect(), prerequisite: await ctx.db.query("lms_course_prerequisites").unique(), enrollments: await ctx.db.query("lms_enrollments").collect(), grants: await ctx.db.query("membership_grants").collect(), progress: await ctx.db.query("lms_progress").collect() }));
  expect(after.prerequisite!.courseId).toBe(after.courses.find(c => c.slug === "a-slower-morning")!._id); expect(after.prerequisite!.prereqCourseId).toBe(after.courses.find(c => c.slug === "first-steps")!._id);
  expect(after.enrollments).toHaveLength(0); expect(after.grants).toHaveLength(0); expect(after.progress).toHaveLength(0);
  expect(await source.t.run(ctx => ctx.db.get(original.progress!._id))).toEqual(original.progress);
});
test("learning rejects missing or inactive gates, disabled plugins, invalid trees and protected payloads", async () => {
  const f = await learningFixture();
  const missing = learningManifest(); missing.records = missing.records.filter(r => r.kind !== "restriction");
  await expect(f.authed.mutation(fn("dryRun"), { manifest: missing, ...bindings })).rejects.toThrow("reviewed membership gate");
  const wrong = learningManifest(); wrong.records[5].data.planIds = ["@promotion:course:source"];
  await expect(f.authed.mutation(fn("dryRun"), { manifest: wrong, ...bindings })).rejects.toThrow("wrong dependency kind");
  const inactive = learningManifest(); inactive.records[0].data.status = "draft";
  expect((await f.authed.mutation(fn("dryRun"), { manifest: inactive, ...bindings })).issues.some((i: {code:string}) => i.code === "TARGET_GATE_PLAN_INACTIVE")).toBe(true);
  const tree = learningManifest(); tree.records[4].data.parentId = "@promotion:courseNode:lesson";
  await expect(f.authed.mutation(fn("dryRun"), { manifest: tree, ...bindings })).rejects.toThrow("root topics");
  for (const [index, fields] of [[0, { linkedSubscriptionCode: "source-code" }], [0, { linkedRoleId: "source-role" }], [2, { authorId: "source-user" }], [2, { accessMode: "buy", price: 1200 }], [4, { completed: true }]] as const) {
    const protectedManifest = learningManifest(); Object.assign(protectedManifest.records[index].data, fields);
    await expect(f.authed.mutation(fn("dryRun"), { manifest: protectedManifest, ...bindings })).rejects.toThrow();
  }
  await f.t.run(async ctx => { const plugins = (await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "plugins")).unique())!; await ctx.db.patch(plugins._id, { values: { ...plugins.values, lmsEnabled: false, membershipEnabled: false } }); });
  expect((await f.authed.mutation(fn("dryRun"), { manifest: learningManifest(), ...bindings })).issues.some((i: {code:string}) => i.code === "TARGET_PLUGIN_DISABLED")).toBe(true);
});
test("learning refuses paid plan creation and unreviewed curriculum removal", async () => {
  const f = await learningFixture(); const paid = learningManifest(); paid.records[0].data.grantMode = "subscription";
  expect((await f.authed.mutation(fn("dryRun"), { manifest: paid, ...bindings })).issues.some((i: {code:string}) => i.code === "TARGET_PLAN_BINDING_REQUIRED")).toBe(true);
  await applyLearning(f);
  const removed = learningManifest(); removed.records = removed.records.filter(r => r.key !== "courseNode:lesson");
  expect((await f.authed.mutation(fn("dryRun"), { manifest: removed, ...bindings })).issues.some((i: {code:string}) => i.code === "TARGET_LEARNING_COLLECTION_CONFLICT")).toBe(true);
});

test("learning authoring permissions, prerequisite cycles and source paid adapters fail closed", async () => {
  const insufficient = await fixture();
  await expect(insufficient.authed.mutation(fn("dryRun"), { manifest: learningManifest(), ...bindings })).rejects.toThrow("Insufficient permissions");
  const f = await learningFixture(); const cycle = learningManifest();
  cycle.records.push({ key: "course:other", kind: "course", sourceRevision: "1", data: { title: "Other", slug: "other", status: "draft", accessMode: "closed" } }, { key: "coursePrerequisite:one", kind: "coursePrerequisite", sourceRevision: "1", data: { courseId: "@promotion:course:source", prereqCourseId: "@promotion:course:other" } }, { key: "coursePrerequisite:two", kind: "coursePrerequisite", sourceRevision: "1", data: { courseId: "@promotion:course:other", prereqCourseId: "@promotion:course:source" } });
  await expect(f.authed.mutation(fn("dryRun"), { manifest: cycle, ...bindings })).rejects.toThrow("prerequisites form a cycle");
  await applyLearning(f);
  const ids = await f.t.run(async ctx => { const site = (await ctx.db.query("convexpress_siteIdentity").unique())!; await ctx.db.patch(site._id, { instanceKey: "site:staging", environmentKind: "staging", deploymentOrigin: "https://source.convex.cloud", siteOrigin: "https://source.example.test" }); const course = (await ctx.db.query("lms_courses").unique())!; await ctx.db.patch(course._id, { accessMode: "buy", price: 100 }); return { courseId: course._id }; });
  await expect(f.authed.query(makeFunctionReference<"query">("contentPromotion/operations:exportManifest"), { target, selection: { ...manifest().selection, pageIds: [], courseIds: [ids.courseId] } })).rejects.toThrow("explicit target adapters");
});
test("learning lesson media are verified and remapped through the actual export/apply chain", async () => {
  const source = await learningFixture(); await applyLearning(source); const bytes = new Blob(["lesson-audio"]);
  const courseId = await source.t.run(async ctx => { const site = (await ctx.db.query("convexpress_siteIdentity").unique())!; await ctx.db.patch(site._id, { instanceKey: "site:staging", environmentKind: "staging", deploymentOrigin: "https://source.convex.cloud", siteOrigin: "https://source.example.test" }); const storageId = await ctx.storage.store(bytes); const url = (await ctx.storage.getUrl(storageId))!; const mediaId = await ctx.db.insert("media", { title: "Morning audio", fileName: "morning.mp3", slug: "morning-audio", mimeType: "audio/mpeg", mediaType: "audio", fileSize: bytes.size, storageId, url, status: "active", uploadedBy: source.userId, createdAt: 1, updatedAt: 1 }); const course = (await ctx.db.query("lms_courses").unique())!; const lesson = (await ctx.db.query("lms_nodes").withIndex("by_course_kind", q => q.eq("courseId", course._id).eq("kind", "lesson")).first())!; await ctx.db.patch(lesson._id, { audioMediaId: mediaId }); return course._id; });
  const exported = await source.authed.query(makeFunctionReference<"query">("contentPromotion/operations:exportManifest"), { target, selection: { ...manifest().selection, pageIds: [], courseIds: [courseId] } });
  const live = await learningFixture(); const storageId = await live.t.run(ctx => ctx.storage.store(bytes)); const media = exported.manifest.records.find((r: {kind: string}) => r.kind === "media");
  const review = await live.authed.mutation(fn("dryRun"), { manifest: exported.manifest, mediaBindings: [{ key: media.key, storageId }], dependencyBindings: [] }); expect(review.issues).toEqual([]);
  await live.authed.mutation(fn("apply"), { receiptId: review.receiptId, expectedDigest: review.digest, confirmLive: true });
  const rows = await live.t.run(async ctx => ({ media: (await ctx.db.query("media").unique())!, nodes: await ctx.db.query("lms_nodes").collect() })); expect(rows.nodes.find(n => n.kind === "lesson")!.audioMediaId).toBe(rows.media._id); expect(rows.media.storageId).toBe(storageId);
});

test("learning rollback restores authored curriculum while retaining learner progress", async () => {
  const f = await learningFixture(); await applyLearning(f); const prior = await seedLearningRuntime(f);
  const changed = learningManifest(); changed.records[2].data.excerpt = "An edited course summary"; changed.records[4].data.title = "New lesson title";
  const result = await applyLearning(f, changed);
  await f.authed.mutation(fn("rollback"), { receiptId: result.receiptId, expectedDigest: result.digest, confirmLive: true });
  expect(await f.t.run(ctx => ctx.db.get(prior.course._id))).toEqual(prior.course);
  expect(await f.t.run(ctx => ctx.db.get(prior.node._id))).toEqual(prior.node);
  expect(await f.t.run(ctx => ctx.db.get(prior.progress!._id))).toEqual(prior.progress);
  expect(await f.t.run(ctx => ctx.db.get(prior.grant!._id))).toEqual(prior.grant);
});

test("media upload intent is scoped, deduplicated, verifies storage metadata and does not author media or emit jobs", async () => {
  const f = await fixture(); const m = manifest();
  const bytes = new Blob([new Uint8Array([137,80,78,71,13,10,26,10,1])], { type: "image/png" });
  const file = await f.t.run(async ctx => { const storageId = await ctx.storage.store(bytes); /* convex-test omits the real upload Content-Type metadata. Restore this one fixture field. */ await ctx.db.patch(storageId as never, { contentType: bytes.type } as never); return { storageId, metadata: (await ctx.db.system.get(storageId))! }; });
  const args = { source: m.source, target: m.target, media: { sha256: file.metadata.sha256, fileSize: file.metadata.size, mimeType: "image/png" as const } };
  const begin = makeFunctionReference<"mutation">("contentPromotion/mediaUploads:begin"); const complete = makeFunctionReference<"mutation">("contentPromotion/mediaUploads:complete"); const status = makeFunctionReference<"query">("contentPromotion/mediaUploads:status");
  const intent = await f.authed.mutation(begin, args); const again = await f.authed.mutation(begin, args);
  expect(again.result.intentId).toBe(intent.result.intentId);
  const done = await f.authed.mutation(complete, { ...args, intentId: intent.result.intentId, storageId: file.storageId });
  expect(done.status).toBe("verified"); expect(done.storageId).toBe(file.storageId);
  expect(await f.authed.mutation(complete, { ...args, intentId: intent.result.intentId, storageId: file.storageId })).toEqual(done);
  expect((await f.authed.query(status, args)).storageId).toBe(file.storageId);
  const counts = await f.t.run(async ctx => ({ media: (await ctx.db.query("media").take(10)).length, jobs: (await ctx.db.system.query("_scheduled_functions").take(10)).length }));
  expect(counts).toEqual({ media: 0, jobs: 0 });
});
test("media intent refuses wrong target, metadata mismatch and revoked target user at completion", async () => {
  const f = await fixture(); const m = manifest(); const begin = makeFunctionReference<"mutation">("contentPromotion/mediaUploads:begin"); const complete = makeFunctionReference<"mutation">("contentPromotion/mediaUploads:complete");
  const args = { source: m.source, target: m.target, media: { sha256: "a".repeat(64), fileSize: 9, mimeType: "image/png" as const } };
  await expect(f.authed.mutation(begin, { ...args, target: { ...args.target, siteOrigin: "https://wrong.example" } })).rejects.toThrow();
  const intent = await f.authed.mutation(begin, args);
  const storageId = await f.t.run(ctx => ctx.storage.store(new Blob(["different"], { type: "image/png" })));
  await expect(f.authed.mutation(complete, { ...args, intentId: intent.result.intentId, storageId })).rejects.toThrow();
  await f.t.run(ctx => ctx.db.patch(f.userId, { status: "inactive" }));
  await expect(f.authed.mutation(complete, { ...args, intentId: intent.result.intentId, storageId })).rejects.toThrow();
});

test("target media transfer respects the target's configured upload-size policy", async () => {
 const f=await fixture();const m=manifest();await f.t.run(ctx=>ctx.db.insert("settings",{section:"media",values:{maxUploadSize:8},updatedAt:1,updatedBy:f.userId}));
 await expect(f.authed.mutation(makeFunctionReference<"mutation">("contentPromotion/mediaUploads:begin"),{source:m.source,target:m.target,media:{sha256:"a".repeat(64),fileSize:9,mimeType:"image/png"}})).rejects.toThrow();
 expect(await f.t.run(ctx=>ctx.db.query("contentPromotion_mediaUploads").take(5))).toHaveLength(0);
});

test("grouped membership policies survive export, apply, update, retry and rollback", async () => {
  const source = await learningFixture();
  const grouped = learningManifest();
  grouped.records[5].data.policyGroup = "direct";
  grouped.records.push({ ...grouped.records[5], key: "restriction:route", data: { ...grouped.records[5].data, policyGroup: "copied-route-1", customMessage: "Route protection" } });
  await applyLearning(source, grouped);
  const courseId = await source.t.run(async ctx => {
    const site = (await ctx.db.query("convexpress_siteIdentity").unique())!;
    await ctx.db.patch(site._id, { instanceKey: "site:staging", environmentKind: "staging", deploymentOrigin: "https://source.convex.cloud", siteOrigin: "https://source.example.test" });
    return (await ctx.db.query("lms_courses").unique())!._id;
  });
  const exported = await source.authed.query(makeFunctionReference<"query">("contentPromotion/operations:exportManifest"), { target, selection: { ...manifest().selection, pageIds: [], courseIds: [courseId] } });
  expect(exported.manifest.records.filter((record: { kind: string }) => record.kind === "restriction").map((record: { data: { policyGroup: string } }) => record.data.policyGroup).sort()).toEqual(["copied-route-1", "direct"]);
  const live = await learningFixture();
  await applyLearning(live, exported.manifest);
  const before = await live.t.run(ctx => ctx.db.query("membership_restriction_rules").collect());
  expect(before.map(rule => rule.policyGroup).sort()).toEqual(["copied-route-1", "direct"]);
  const changed = structuredClone(exported.manifest);
  for (const record of changed.records) if (record.kind === "restriction") record.data.customMessage = "Reviewed policy explanation";
  const applied = await applyLearning(live, changed);
  const args = { receiptId: applied.receiptId, expectedDigest: applied.digest, confirmLive: true };
  expect(await live.authed.mutation(fn("apply"), args)).toEqual(applied);
  expect((await live.t.run(ctx => ctx.db.query("membership_restriction_rules").collect())).map(rule => rule.policyGroup).sort()).toEqual(["copied-route-1", "direct"]);
  await live.authed.mutation(fn("rollback"), args);
  expect(await live.t.run(ctx => ctx.db.query("membership_restriction_rules").collect())).toEqual(before);
});

test("legacy promotion cannot erase the canonical source discriminator or plan over a canonical target",async()=>{
 const {t,authed,userId}=await fixture();
 const id=await t.run(ctx=>ctx.db.insert("posts",{type:"page",title:"Canonical draft",slug:"welcome",path:"/welcome",content:"",blocksVersion:2,blocksRevision:1,blocks:[],status:"draft",visibility:"public",authorId:userId,commentStatus:"closed",createdAt:1,updatedAt:1}));
 const original=await t.run(ctx=>ctx.db.get("posts",id));
 await t.run(async ctx=>{const identity=(await ctx.db.query("convexpress_siteIdentity").unique())!;await ctx.db.patch("convexpress_siteIdentity",identity._id,manifest().source);});
 const exported=await authed.query(makeFunctionReference<"query">("contentPromotion/operations:exportManifest"),{target,selection:{pageIds:[id],postIds:[],mediaIds:[],menuIds:[],eventIds:[],includePresentation:false}});
 expect(exported.manifest.records[0].data.blocksVersion).toBe(2);
 expect(exported.manifest.records[0].data.blocks).toBeUndefined();
 expect(exported.manifest.records[0].data.canonical).toEqual({contract:"canonical-promotion-tree-v1",blocks:[],references:[]});
 const destination=await fixture();
 const review=await destination.authed.mutation(fn("dryRun"),{manifest:exported.manifest,...bindings});
 expect(review.ready).toBe(true);
 await destination.authed.mutation(fn("apply"),{receiptId:review.receiptId,expectedDigest:review.digest,confirmLive:true});
 expect(await destination.t.run(ctx=>ctx.db.query("posts").unique())).toMatchObject({blocksVersion:2,blocksRevision:1,title:"Canonical draft",blocks:[]});
 await t.run(async ctx=>{const identity=(await ctx.db.query("convexpress_siteIdentity").unique())!;await ctx.db.patch("convexpress_siteIdentity",identity._id,target);});
 await expect(authed.mutation(fn("dryRun"),{manifest:manifest(),...bindings})).rejects.toThrow("canonical");
 expect(await t.run(ctx=>ctx.db.get("posts",id))).toEqual(original);
 expect(await t.run(ctx=>ctx.db.query("contentPromotion_receipts").collect())).toHaveLength(0);
});

test('event category export remaps site IDs, validates target kinds and supports update rollback',async()=>{
 const source=await fixture();
 const selected=await source.t.run(async ctx=>{
  const identity=await ctx.db.query('convexpress_siteIdentity').unique();await ctx.db.patch(identity!._id,manifest().source);
  const categoryId=await ctx.db.insert('extension_event_categories',{name:'Workshops',slug:'workshops',createdAt:1,updatedAt:1});
  const eventId=await ctx.db.insert('extension_events',{title:'Workroom morning',slug:'workroom-morning',description:'A staging gathering',startsAt:Date.now()+86400000,endsAt:Date.now()+90000000,timeZone:'America/Denver',venue:'Studio',venueAddress:'',status:'published',categoryId,createdBy:source.userId,createdAt:1,updatedAt:1});
  return {categoryId,eventId};
 });
 const exported=await source.authed.query(makeFunctionReference<'query'>('contentPromotion/operations:exportManifest'),{target,selection:{...manifest().selection,pageIds:[],eventIds:[selected.eventId]}});
 const m=exported.manifest as ContentPromotionManifest;
 expect(m.records.map(row=>row.kind).sort()).toEqual(['event','eventCategory']);
 const eventRecord=m.records.find(row=>row.kind==='event')!,categoryRecord=m.records.find(row=>row.kind==='eventCategory')!;
 expect(eventRecord.data.categoryId).toBe(`@promotion:${categoryRecord.key}`);
 expect(categoryRecord.data).toEqual({name:'Workshops',slug:'workshops'});
 const live=await fixture();
 // A pre-existing target identity proves target lookup uses its own category row.
 const targetCategory=await live.t.run(ctx=>ctx.db.insert('extension_event_categories',{name:'Target workshops',slug:'workshops',createdAt:1,updatedAt:1}));
 const review=await live.authed.mutation(fn('dryRun'),{manifest:m,...bindings});expect(review.ready).toBe(true);
 const apply={receiptId:review.receiptId,expectedDigest:review.digest,confirmLive:true};
 const result=await live.authed.mutation(fn('apply'),apply);
 expect(await live.authed.mutation(fn('apply'),apply)).toEqual(result);
 const saved=await live.t.run(ctx=>ctx.db.query('extension_events').unique());
 expect(saved!.categoryId).toBe(targetCategory);expect(saved!.createdBy).toBe(live.userId);
 expect(saved!.calendarBucket).toBe(eventIntervalBucket(saved!.startsAt,saved!.endsAt));
 expect(eventRecord.data.calendarBucket).toBeUndefined();
 expect((await live.t.run(ctx=>ctx.db.get(targetCategory)))!.name).toBe('Workshops');
 const changed=structuredClone(m);changed.records.find(row=>row.kind==='eventCategory')!.data.name='Shared studio';changed.records.find(row=>row.kind==='event')!.data.title='A new event title';
 changed.records.find(row=>row.kind==='event')!.data.startsAt=2**40-1;changed.records.find(row=>row.kind==='event')!.data.endsAt=2**40+1;
 const update=await live.authed.mutation(fn('dryRun'),{manifest:changed,...bindings});expect(update.ready).toBe(true);
 const updateArgs={receiptId:update.receiptId,expectedDigest:update.digest,confirmLive:true};await live.authed.mutation(fn('apply'),updateArgs);
 expect((await live.t.run(ctx=>ctx.db.get(saved!._id)))!.calendarBucket).toBe('41:0');
 await live.authed.mutation(fn('rollback'),updateArgs);
 expect((await live.t.run(ctx=>ctx.db.get(saved!._id)))!.calendarBucket).toBe(eventIntervalBucket(saved!.startsAt,saved!.endsAt));
 expect((await live.t.run(ctx=>ctx.db.get(targetCategory)))!.name).toBe('Workshops');
 expect((await live.t.run(ctx=>ctx.db.get(saved!._id)))!.title).toBe('Workroom morning');
 expect((await live.t.run(ctx=>ctx.db.get(saved!._id)))!.categoryId).toBe(targetCategory);
 const wrong=structuredClone(m);wrong.records.find(row=>row.kind==='event')!.data.categoryId=`@promotion:${eventRecord.key}`;
 await expect(live.authed.mutation(fn('dryRun'),{manifest:wrong,...bindings})).rejects.toThrow('wrong dependency kind');
 const raw=structuredClone(m);raw.records.find(row=>row.kind==='event')!.data.categoryId=selected.categoryId;
 await expect(live.authed.mutation(fn('dryRun'),{manifest:raw,...bindings})).rejects.toThrow('raw document references');
});

test("catalog promotion updates and rollback rebuild the selected variant sale coordinates",async()=>{
 const f=await commerceFixture();const m=catalogManifest();const now=Date.now(),at=now+5000;
 m.records[2].data.salePrice={amount:0,currencyCode:"USD"};m.records[2].data.salePriceFrom=now-1000;m.records[2].data.salePriceTo=now+10000;
 await applyCatalog(f,m);
 const {readActiveSaleCandidates}=await import("../../commerce/productSaleIndex");
 const candidates=()=>f.t.run(async ctx=>{const ids=[];for await(const row of readActiveSaleCandidates(ctx,at))ids.push(row.productId);return ids;});
 const before=await candidates();expect(before).toHaveLength(1);
 const next=catalogManifest();next.records[2].data.price={amount:4200,currencyCode:"USD"};
 const review=await f.authed.mutation(fn("dryRun"),{manifest:next,...bindings});expect(review.ready).toBe(true);
 const args={receiptId:review.receiptId,expectedDigest:review.digest,confirmLive:true};await f.authed.mutation(fn("apply"),args);expect(await candidates()).toEqual([]);
 await f.authed.mutation(fn("rollback"),args);expect(await candidates()).toEqual(before);
});

test("product export maps shared tags by target identity with exact Unicode slug and visibility", async () => {
  const source = await commerceFixture();
  await applyCatalog(source);
  const ids = await source.t.run(async ctx => {
    const site = (await ctx.db.query("convexpress_siteIdentity").unique())!;
    await ctx.db.patch(site._id, manifest().source);
    const tagId = await ctx.db.insert("commerce_product_tags", {name:"Café collection",slug:"édition-spéciale",isVisible:false,createdAt:1,updatedAt:1});
    const product = (await ctx.db.query("commerce_products").unique())!;
    await patchWithMediaReferences(ctx, "commerce_products", product._id, {tagIds:[tagId],isFeatured:true});
    return {tagId,productId:product._id};
  });
  const exported = await source.authed.query(makeFunctionReference<"query">("contentPromotion/operations:exportManifest"), {target,selection:{...manifest().selection,pageIds:[],productIds:[ids.productId],productTagIds:[ids.tagId]}});
  const tag = exported.manifest.records.find((r: {kind:string}) => r.kind === "productTag");
  const product = exported.manifest.records.find((r: {kind:string}) => r.kind === "product");
  expect(tag.data).toEqual({name:"Café collection",slug:"édition-spéciale",isVisible:false});
  expect(product.data.tagIds).toEqual([`@promotion:${tag.key}`]);
  expect(product.data.isFeatured).toBe(true);
  expect(exported.manifest.records.filter((r: {kind:string}) => r.kind === "productTag")).toHaveLength(1);
  const live = await commerceFixture();
  const existingId = await live.t.run(ctx => ctx.db.insert("commerce_product_tags", {name:"Target draft",slug:"édition-spéciale",isVisible:true,createdAt:2,updatedAt:2}));
  await applyCatalog(live, exported.manifest);
  const stored = await live.t.run(async ctx => ({product:await ctx.db.query("commerce_products").unique(),tags:await ctx.db.query("commerce_product_tags").collect(),discovery:await ctx.db.query("commerce_product_discovery").collect()}));
  expect(existingId).not.toBe(ids.tagId);
  expect(stored.product!.tagIds).toEqual([existingId]);
  expect(stored.product!.isFeatured).toBe(true);
  expect(stored.tags).toHaveLength(1);
  expect(stored.tags[0]).toMatchObject({...tag.data,createdAt:2});
  expect(stored.discovery.some(row=>row.kind === "featured" && row.productId === stored.product!._id)).toBe(true);
  expect(stored.discovery.some(row=>row.kind === "tag" && row.key === existingId)).toBe(true);
});

test("legacy product promotion preserves new target fields; explicit removal and rollback restore discovery", async () => {
  const f = await commerceFixture();
  await applyCatalog(f);
  const before = await f.t.run(async ctx => {
    const tagId = await ctx.db.insert("commerce_product_tags",{name:"Local",slug:"local",isVisible:true,createdAt:1,updatedAt:1});
    const product = (await ctx.db.query("commerce_products").unique())!;
    await patchWithMediaReferences(ctx,"commerce_products",product._id,{tagIds:[tagId],isFeatured:true});
    return {tagId,productId:product._id};
  });
  const legacy = catalogManifest();
  legacy.records[1].data.title = "Legacy price update";
  const oldReview = await f.authed.mutation(fn("dryRun"),{manifest:legacy,...bindings});
  const fields = oldReview.changes.find((c:{kind:string})=>c.kind === "product").fields;
  expect(fields).not.toContain("tagIds"); expect(fields).not.toContain("isFeatured");
  await f.authed.mutation(fn("apply"),{receiptId:oldReview.receiptId,expectedDigest:oldReview.digest,confirmLive:true});
  expect(await f.t.run(ctx=>ctx.db.get(before.productId))).toMatchObject({tagIds:[before.tagId],isFeatured:true});
  const explicit = catalogManifest();
  Object.assign(explicit.records[1].data,{tagIds:[],isFeatured:false});
  const review = await f.authed.mutation(fn("dryRun"),{manifest:explicit,...bindings});
  expect(review.ready).toBe(true);
  const args = {receiptId:review.receiptId,expectedDigest:review.digest,confirmLive:true};
  await f.authed.mutation(fn("apply"),args);
  expect(await f.t.run(ctx=>ctx.db.get(before.productId))).toMatchObject({tagIds:[],isFeatured:false});
  expect(await f.t.run(ctx=>ctx.db.query("commerce_product_discovery").withIndex("by_product",q=>q.eq("productId",before.productId)).collect())).not.toContainEqual(expect.objectContaining({kind:"featured"}));
  await f.authed.mutation(fn("rollback"),args);
  expect(await f.t.run(ctx=>ctx.db.get(before.productId))).toMatchObject({tagIds:[before.tagId],isFeatured:true});
  const restored = await f.t.run(ctx=>ctx.db.query("commerce_product_discovery").withIndex("by_product",q=>q.eq("productId",before.productId)).collect());
  expect(restored).toContainEqual(expect.objectContaining({kind:"featured"}));
  expect(restored).toContainEqual(expect.objectContaining({kind:"tag",key:before.tagId}));
});

test("tag references reject source IDs and wrong namespaces before catalog writes", async () => {
  const f = await commerceFixture();
  for (const tagIds of [["source-tag-id"],["@promotion:productCategory:source-category"]]) {
    const m = catalogManifest(); m.records[1].data.tagIds = tagIds;
    await expect(f.authed.mutation(fn("dryRun"),{manifest:m,...bindings})).rejects.toThrow();
  }
  expect(await f.t.run(ctx=>ctx.db.query("commerce_products").collect())).toHaveLength(0);
});

test("tag-only promotion checks commerce and stale target identity, then rolls back authored metadata", async () => {
  const f = await commerceFixture();
  const tagId = await f.t.run(ctx=>ctx.db.insert("commerce_product_tags",{name:"Original",slug:"tag",isVisible:true,createdAt:1,updatedAt:1}));
  const m = manifest(); m.selection = {...m.selection,pageIds:[],productTagIds:["source-tag"]};
  m.records = [{key:"productTag:source-tag",kind:"productTag",sourceRevision:"t1",data:{name:"Revised",slug:"tag",isVisible:false}}];
  const review = await f.authed.mutation(fn("dryRun"),{manifest:m,...bindings}); expect(review.ready).toBe(true);
  const args = {receiptId:review.receiptId,expectedDigest:review.digest,confirmLive:true};
  await f.authed.mutation(fn("apply"),args);
  expect(await f.t.run(ctx=>ctx.db.get(tagId))).toMatchObject({name:"Revised",isVisible:false,createdAt:1});
  await f.authed.mutation(fn("rollback"),args);
  expect(await f.t.run(ctx=>ctx.db.get(tagId))).toMatchObject({name:"Original",isVisible:true,updatedAt:1});
  const stale = await f.authed.mutation(fn("dryRun"),{manifest:m,...bindings});
  await f.t.run(ctx=>ctx.db.patch(tagId,{name:"Edited meanwhile"}));
  await expect(f.authed.mutation(fn("apply"),{receiptId:stale.receiptId,expectedDigest:stale.digest,confirmLive:true})).rejects.toThrow("Target content or dependencies changed");
  await f.t.run(async ctx=>{const plugins=(await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","plugins")).unique())!;await ctx.db.patch(plugins._id,{values:{commerceEnabled:false}});});
  const disabled = await f.authed.mutation(fn("dryRun"),{manifest:m,...bindings});
  expect(disabled.ready).toBe(false);
  expect(disabled.issues).toContainEqual(expect.objectContaining({code:"TARGET_PLUGIN_DISABLED"}));
});

test("promotion rejects duplicate new tag slugs before creating an ambiguous target taxonomy", async () => {
  const f = await commerceFixture();
  const m = manifest(); m.selection = {...m.selection,pageIds:[],productTagIds:["first","second"]};
  m.records = ["first","second"].map(key=>({key:`productTag:${key}`,kind:"productTag",sourceRevision:"t1",data:{name:key,slug:"shared",isVisible:true}}));
  await expect(f.authed.mutation(fn("dryRun"),{manifest:m,...bindings})).rejects.toThrow("same target identity");
  expect(await f.t.run(ctx=>ctx.db.query("commerce_product_tags").collect())).toHaveLength(0);
});

function brandManifest(): ContentPromotionManifest {
  const m = catalogManifest();
  m.records.push({ key: "productBrand:source-brand", kind: "productBrand", sourceRevision: "b1", data: { name: "Aster objects", slug: "aster-objects", description: "Objects for everyday use.", status: "publish", sortOrder: 2 } });
  m.records[1].data.brandId = "@promotion:productBrand:source-brand";
  return m;
}

test("brand export transfers verified logo bytes and remaps product assignments to the existing target brand", async () => {
  const source = await commerceFixture(); await applyCatalog(source);
  const bytes = new Blob(["original-brand-logo"]);
  const ids = await source.t.run(async ctx => {
    const site = (await ctx.db.query("convexpress_siteIdentity").unique())!; await ctx.db.patch(site._id, manifest().source);
    const storageId = await ctx.storage.store(bytes), storage = (await ctx.db.system.get(storageId))!;
    const logoMediaId = await ctx.db.insert("media", { title: "Aster mark", fileName: "aster.png", slug: "aster-mark", mimeType: "image/png", mediaType: "image", fileSize: storage.size, storageId, url: (await ctx.storage.getUrl(storageId))!, status: "active", uploadedBy: source.userId, createdAt: 1, updatedAt: 1 });
    const brandId = await insertWithMediaReferences(ctx, "commerce_product_brands", { name: "Aster objects", slug: "aster-objects", description: "Objects for everyday use.", status: "publish", sortOrder: 2, logoMediaId, createdAt: 1, updatedAt: 1 });
    const product = (await ctx.db.query("commerce_products").unique())!;
    await patchWithMediaReferences(ctx, "commerce_products", product._id, { brandId });
    return { brandId, logoMediaId, productId: product._id };
  });
  const exported = await source.authed.query(makeFunctionReference<"query">("contentPromotion/operations:exportManifest"), { target, selection: { ...manifest().selection, pageIds: [], productIds: [ids.productId], productBrandIds: [ids.brandId] } });
  const brand = exported.manifest.records.find((r: {kind:string}) => r.kind === "productBrand");
  const product = exported.manifest.records.find((r: {kind:string}) => r.kind === "product");
  const media = exported.manifest.records.find((r: {kind:string}) => r.kind === "media");
  expect(product.data.brandId).toBe(`@promotion:${brand.key}`);
  expect(brand.data.logoMediaId).toBe(`@promotion:${media.key}`);
  expect(exported.manifest.records.filter((r: {kind:string}) => r.kind === "productBrand")).toHaveLength(1);
  const live = await commerceFixture();
  const targetBrandId = await live.t.run(ctx => ctx.db.insert("commerce_product_brands", { name: "Draft mark", slug: "aster-objects", description: "", status: "draft", sortOrder: 0, createdAt: 2, updatedAt: 2 }));
  const storageId = await live.t.run(ctx => ctx.storage.store(bytes));
  const review = await live.authed.mutation(fn("dryRun"), { manifest: exported.manifest, mediaBindings: [{ key: media.key, storageId }], dependencyBindings: [] });
  expect(review.issues).toEqual([]); expect(review.ready).toBe(true);
  const args = {receiptId:review.receiptId,expectedDigest:review.digest,confirmLive:true};
  await live.authed.mutation(fn("apply"), args);
  const result = await live.t.run(async ctx => ({ product: (await ctx.db.query("commerce_products").unique())!, brand: (await ctx.db.get(targetBrandId))!, media: (await ctx.db.query("media").unique())! }));
  expect(targetBrandId).not.toBe(ids.brandId); expect(result.product.brandId).toBe(targetBrandId);
  expect(result.brand.logoMediaId).toBe(result.media._id); expect(result.media._id).not.toBe(ids.logoMediaId); expect(result.media.storageId).toBe(storageId);
  expect(result.brand).toMatchObject({name:"Aster objects",status:"publish",sortOrder:2,createdAt:2});
  await expect(live.authed.mutation(fn("rollback"),args)).rejects.toThrow("This promotion created records");
  expect(await live.t.run(ctx=>ctx.db.get(targetBrandId))).toEqual(result.brand);
  expect(await live.t.run(ctx=>ctx.db.query("commerce_products").collect())).toHaveLength(1);
});

test("legacy product manifests preserve brand assignment, explicit null removes it, and rollback restores it", async () => {
  const f = await commerceFixture(); await applyCatalog(f,brandManifest());
  const before = (await f.t.run(ctx=>ctx.db.query("commerce_products").unique()))!;
  const legacy = catalogManifest(); legacy.records[1].data.title = "Updated product";
  const oldReview = await f.authed.mutation(fn("dryRun"),{manifest:legacy,...bindings});
  expect(oldReview.changes.find((c:{kind:string})=>c.kind === "product").fields).not.toContain("brandId");
  await f.authed.mutation(fn("apply"),{receiptId:oldReview.receiptId,expectedDigest:oldReview.digest,confirmLive:true});
  expect((await f.t.run(ctx=>ctx.db.get(before._id)))!.brandId).toBe(before.brandId);
  const explicit = catalogManifest(); explicit.records[1].data.brandId = null;
  const review = await f.authed.mutation(fn("dryRun"),{manifest:explicit,...bindings}); expect(review.ready).toBe(true);
  const args = {receiptId:review.receiptId,expectedDigest:review.digest,confirmLive:true};
  await f.authed.mutation(fn("apply"),args); expect((await f.t.run(ctx=>ctx.db.get(before._id)))!.brandId).toBeUndefined();
  await f.authed.mutation(fn("rollback"),args); expect((await f.t.run(ctx=>ctx.db.get(before._id)))!.brandId).toBe(before.brandId);
  await f.t.run(async ctx => {const site=(await ctx.db.query("convexpress_siteIdentity").unique())!; await ctx.db.patch(site._id,manifest().source); await patchWithMediaReferences(ctx,"commerce_products",before._id,{brandId:undefined});});
  const exported = await f.authed.query(makeFunctionReference<"query">("contentPromotion/operations:exportManifest"),{target,selection:{...manifest().selection,pageIds:[],productIds:[before._id]}});
  expect(exported.manifest.records.find((r:{kind:string})=>r.kind === "product").data.brandId).toBeNull();
});

test("brand promotion rejects foreign IDs, wrong dependency namespaces, non-image logos and duplicate identities",async()=>{
  const f = await commerceFixture();
  for (const brandId of ["raw-source-id","@promotion:productCategory:source-category"]) {
    const m=brandManifest();m.records[1].data.brandId=brandId;
    await expect(f.authed.mutation(fn("dryRun"),{manifest:m,...bindings})).rejects.toThrow();
  }
  const logo=brandManifest(); logo.records[3].data.logoMediaId="@promotion:media:logo";
  logo.records.push({key:"media:logo",kind:"media",sourceRevision:"m1",data:{title:"PDF",fileName:"mark.pdf",slug:"mark",mimeType:"application/pdf",mediaType:"document",fileSize:10,sha256:"a".repeat(64)}});
  await expect(f.authed.mutation(fn("dryRun"),{manifest:logo,...bindings})).rejects.toThrow("brand logo");
  const duplicate=brandManifest();duplicate.records.push({...duplicate.records[3],key:"productBrand:duplicate"});
  await expect(f.authed.mutation(fn("dryRun"),{manifest:duplicate,...bindings})).rejects.toThrow("same target identity");
  expect(await f.t.run(ctx=>ctx.db.query("commerce_product_brands").collect())).toHaveLength(0);
});

test("brand-only promotion requires commerce and detects target edits made after review",async()=>{
  const f=await commerceFixture();const m=brandManifest();m.records=m.records.filter(r=>r.kind === "productBrand");m.selection={...manifest().selection,pageIds:[],productBrandIds:["source-brand"]};
  const id=await f.t.run(ctx=>ctx.db.insert("commerce_product_brands",{name:"Original",slug:"aster-objects",description:"",status:"archived",sortOrder:0,createdAt:1,updatedAt:1}));
  const review=await f.authed.mutation(fn("dryRun"),{manifest:m,...bindings});expect(review.ready).toBe(true);
  const args={receiptId:review.receiptId,expectedDigest:review.digest,confirmLive:true};
  await f.authed.mutation(fn("apply"),args);
  expect(await f.t.run(ctx=>ctx.db.get(id))).toMatchObject({name:"Aster objects",status:"publish"});
  await f.authed.mutation(fn("rollback"),args);
  expect(await f.t.run(ctx=>ctx.db.get(id))).toMatchObject({name:"Original",status:"archived",updatedAt:1});
  const stale=await f.authed.mutation(fn("dryRun"),{manifest:m,...bindings});
  await f.t.run(ctx=>ctx.db.patch(id,{name:"Concurrent edit"}));
  await expect(f.authed.mutation(fn("apply"),{receiptId:stale.receiptId,expectedDigest:stale.digest,confirmLive:true})).rejects.toThrow("Target content or dependencies changed");
  await f.t.run(async ctx=>{const plugins=(await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","plugins")).unique())!;await ctx.db.patch(plugins._id,{values:{commerceEnabled:false}});});
  const disabled=await f.authed.mutation(fn("dryRun"),{manifest:m,...bindings});expect(disabled.ready).toBe(false);expect(disabled.issues).toContainEqual(expect.objectContaining({code:"TARGET_PLUGIN_DISABLED"}));
});


test("registered canonical export follows nested metadata references without rewriting literal text",async()=>{
 const source=await fixture();
 const {parentId,childId}=await source.t.run(async ctx=>{
  const identity=(await ctx.db.query("convexpress_siteIdentity").unique())!;await ctx.db.patch(identity._id,manifest().source);
  const common={type:"page" as const,content:"",contentMode:"blocks" as const,status:"draft" as const,visibility:"public" as const,authorId:source.userId,commentStatus:"closed" as const,createdAt:1,updatedAt:1};
  const childId=await ctx.db.insert("posts",{...common,title:"Referenced page",slug:"referenced",path:"/referenced",blocks:[]});
  const parentId=await ctx.db.insert("posts",{...common,title:"Canonical parent",slug:"canonical-parent",path:"/canonical-parent",blocksVersion:2,blocksRevision:9,blocks:[{id:"group",name:"core/group",version:1,attrs:{},children:[{id:"image",name:"core/image",version:2,attrs:{mediaId:"",alt:"@promotion:page:literal-not-a-reference"}},{id:"featured",name:"core/featured-page",version:1,attrs:{page:childId,ctaLabel:"Keep this label"}}]}]});
  return {parentId,childId};
 });
 const original=await source.t.run(ctx=>ctx.db.get(parentId));
 const exported=await source.authed.query(makeFunctionReference<"query">("contentPromotion/operations:exportManifest"),{target,selection:{...manifest().selection,pageIds:[parentId]}});
 const data=exported.manifest.records.find((r:{key:string})=>r.key===`page:${parentId}`).data;
 expect(data.blocksVersion).toBe(2);expect(data.blocksRevision).toBeUndefined();expect(data.blocks).toBeUndefined();
 expect(data.canonical.references).toEqual([{blockId:"featured",path:["page"],kind:"page",storage:"id",key:`@promotion:page:${childId}`}]);
 expect(data.canonical.blocks[0].children[0].attrs.alt).toBe("@promotion:page:literal-not-a-reference");
 expect(data.canonical.blocks[0].children[1].attrs.page).toBe("promotion-reference-0");
 expect(exported.manifest.records.map((r:{key:string})=>r.key).sort()).toEqual([`page:${parentId}`,`page:${childId}`].sort());
 const destination=await fixture();const reviewed=await destination.authed.mutation(fn("dryRun"),{manifest:exported.manifest,...bindings});
 expect(reviewed.ready).toBe(true);
 await destination.authed.mutation(fn("apply"),{receiptId:reviewed.receiptId,expectedDigest:reviewed.digest,confirmLive:true});
 const saved=await destination.t.run(ctx=>ctx.db.query("posts").collect());
 const parent=saved.find(row=>row.slug==="canonical-parent")!,child=saved.find(row=>row.slug==="referenced")!;
 expect(parent.blocksVersion).toBe(2);expect(parent.blocksRevision).toBe(1);
 expect(parent.blocks![0].children![1].attrs.page).toBe(child._id);
 expect(parent.blocks![0].children![0].attrs.alt).toBe("@promotion:page:literal-not-a-reference");
 const disguised=structuredClone(exported.manifest);delete disguised.records.find((r:{key:string})=>r.key===`page:${parentId}`).data.blocksVersion;
 await expect(destination.authed.mutation(fn("dryRun"),{manifest:disguised,...bindings})).rejects.toThrow("Canonical");
 const missing=structuredClone(exported.manifest);missing.records.find((r:{key:string})=>r.key===`page:${parentId}`).data.canonical.references[0].key="@promotion:page:missing";
 await expect(destination.authed.mutation(fn("dryRun"),{manifest:missing,...bindings})).rejects.toThrow("missing");
 expect(await source.t.run(ctx=>ctx.db.get(parentId))).toEqual(original);
 expect(await destination.t.run(ctx=>ctx.db.query("contentPromotion_receipts").collect())).toHaveLength(1);
});

test("canonical export includes one product record for its ID and slug references",async()=>{
 const source=await commerceFixture();
 const {pageId,productId}=await source.t.run(async ctx=>{
  const identity=(await ctx.db.query("convexpress_siteIdentity").unique())!;await ctx.db.patch(identity._id,manifest().source);
  const productId=await ctx.db.insert("commerce_products",{title:"Notebook",slug:"notebook",authorId:source.userId,productType:"simple",status:"publish",galleryMediaIds:[],categoryIds:[],basePrice:{amount:2400,currencyCode:"USD"},trackInventory:true,stockQuantity:12,allowBackorders:false,isVirtual:false,isDownloadable:false,createdAt:1,updatedAt:1});
  const pageId=await ctx.db.insert("posts",{type:"page",title:"Our objects",slug:"objects",path:"/objects",status:"draft",visibility:"public",content:"",contentMode:"blocks",blocksVersion:2,blocksRevision:1,blocks:[{id:"hero",name:"commerce/product-hero",version:1,attrs:{product:productId}},{id:"list",name:"commerce/product-showcase",version:2,attrs:{source:"slugs",productSlugs:["notebook"]}}],authorId:source.userId,commentStatus:"closed",createdAt:1,updatedAt:1});
  return {pageId,productId};
 });
 const exported=await source.authed.query(makeFunctionReference<"query">("contentPromotion/operations:exportManifest"),{target,selection:{...manifest().selection,pageIds:[pageId]}});
 expect(exported.manifest.records.filter((r:{kind:string})=>r.kind==="product")).toHaveLength(1);
 const refs=exported.manifest.records.find((r:{kind:string})=>r.kind==="page").data.canonical.references;
 expect(refs.map((r:{key:string;storage:string})=>[r.key,r.storage])).toEqual([[`@promotion:product:${productId}`,"id"],[`@promotion:product:${productId}`,"slug"]]);
 const destination=await commerceFixture();const review=await destination.authed.mutation(fn("dryRun"),{manifest:exported.manifest,...bindings});expect(review.ready).toBe(true);
 await destination.authed.mutation(fn("apply"),{receiptId:review.receiptId,expectedDigest:review.digest,confirmLive:true});
 const saved=await destination.t.run(async ctx=>({page:await ctx.db.query("posts").unique(),product:await ctx.db.query("commerce_products").unique()}));
 expect(saved.page!.blocks![0].attrs.product).toBe(saved.product!._id);
 expect(saved.page!.blocks![1].attrs.productSlugs).toEqual([saved.product!.slug]);
 expect(saved.product!.basePrice).toEqual({amount:2400,currencyCode:"USD"});
 expect(saved.product!.stockQuantity).not.toBe(12);
});

async function canonicalManifest() {
 const {exportCanonicalPromotionTree}=await import("../../canonicalDocuments/foundation/promotionTree");
 const m=manifest();delete m.records[0].data.blocks;
 Object.assign(m.records[0].data,{content:"",blocksVersion:2,status:"draft",canonical:await exportCanonicalPromotionTree([{id:"group",name:"core/group",version:1,attrs:{},children:[{id:"image",name:"core/image",version:2,attrs:{mediaId:"",alt:"Source literal"}}]}],async()=>{throw new Error("Unexpected reference");})});
 return m;
}

async function routePolicyFixture() {
 const f=await fixture(),m=await canonicalManifest();m.records[0].data.status="publish";m.selection.includeRoutePolicies=true;
 for(const [key,pattern,group] of [["exact","/welcome","direct"],["wildcard","/wel*","additional"]])m.records.push({key:`restriction:${key}`,kind:"restriction",sourceRevision:"1",data:{resourceType:"route",resourceIdOrKey:pattern,policyGroup:group,ruleMode:"allow_only",planIds:[],teaserMode:"excerpt",loginRequired:true}});
 await f.t.run(async ctx=>{const setting=(await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","plugins")).unique())!;await ctx.db.patch(setting._id,{values:{membershipEnabled:true}});const user=await ctx.db.get(f.userId),role=await ctx.db.get(user!.roleId!);await ctx.db.patch(role!._id,{capabilities:[...role!.capabilities,"revision.restore"]});});
 return {...f,m};
}

test("route policies require explicit selection and valid local patterns",async()=>{
 const {validateManifest}=await import("../shared");const f=await routePolicyFixture();
 const omitted=structuredClone(f.m);delete omitted.selection.includeRoutePolicies;
 expect(()=>validateManifest(omitted)).toThrow("Include site access rules explicitly");
 for(const pattern of ["https://example.test/*","//example.test/*","/welcome?admin=1","/welcome#fragment","/bad\\path","/bad\npath"]){const invalid=structuredClone(f.m);invalid.records[1].data.resourceIdOrKey=pattern;expect(()=>validateManifest(invalid)).toThrow("Route policies must use local path patterns");}
 expect(validateManifest(f.m).records).toHaveLength(3);
});

test("route policy export preserves all patterns and groups only when requested",async()=>{
 const f=await routePolicyFixture();const preview=await f.authed.mutation(fn("dryRun"),{manifest:f.m,...bindings});expect(preview.ready).toBe(true);
 const applied=await f.authed.mutation(fn("apply"),receiptArgs(preview));
 const pageId=applied.mappings.find(mapping=>mapping.kind==="page")!.targetId;
 await f.t.run(async ctx=>{const site=(await ctx.db.query("convexpress_siteIdentity").unique())!;await ctx.db.patch(site._id,f.m.source);});
 const selection={...f.m.selection,pageIds:[pageId],includeRoutePolicies:false};
 await expect(f.authed.query(makeFunctionReference<"query">("contentPromotion/operations:exportManifest"),{target,selection})).rejects.toThrow("Include site access rules");
 await expect(f.authed.query(makeFunctionReference<"query">("contentPromotion/operations:exportManifest"),{target,selection})).rejects.toMatchObject({data:{code:'ROUTE_POLICY_SELECTION_REQUIRED'}});
 const exported=await f.authed.query(makeFunctionReference<"query">("contentPromotion/operations:exportManifest"),{target,selection:{...selection,includeRoutePolicies:true}});
 expect(exported.manifest.records.filter(record=>record.kind==="restriction").map(record=>[record.data.resourceIdOrKey,record.data.policyGroup]).sort()).toEqual([["/wel*","additional"],["/welcome","direct"]]);
 expect(exported.manifest.dependencies).toContainEqual(expect.objectContaining({kind:"plugin",sourceId:"membershipEnabled"}));
});

test("route policy apply, update and rollback preserve actual anonymous document access",async()=>{
 const f=await routePolicyFixture();const initial=await f.authed.mutation(fn("dryRun"),{manifest:f.m,...bindings});expect(initial.ready).toBe(true);
 const applied=await f.authed.mutation(fn("apply"),receiptArgs(initial));const postId=applied.mappings.find(mapping=>mapping.kind==="page")!.targetId;
 const publicRead=()=>f.t.query(makeFunctionReference<"query">("canonicalDocuments:getForRender"),{postId});
 expect((await publicRead()).state).toBe("restricted");
 const before=await f.t.run(ctx=>ctx.db.query("membership_restriction_rules").collect());expect(before).toHaveLength(2);
 const updated=structuredClone(f.m);for(const record of updated.records)if(record.kind==="restriction")record.data.resourceIdOrKey="/other"+String(record.data.resourceIdOrKey);
 const review=await f.authed.mutation(fn("dryRun"),{manifest:updated,...bindings});expect(review.ready).toBe(true);
 const second=await f.authed.mutation(fn("apply"),receiptArgs(review));expect(await f.authed.mutation(fn("apply"),receiptArgs(review))).toEqual(second);
 expect((await publicRead()).state).toBe("ready");
 await f.authed.mutation(fn("rollback"),receiptArgs(review));expect((await publicRead()).state).toBe("restricted");
 expect(await f.t.run(ctx=>ctx.db.query("membership_restriction_rules").collect())).toEqual(before);
});

test("destination route policy collection is fingerprinted and unmapped rules never overwritten",async()=>{
 const f=await routePolicyFixture();const review=await f.authed.mutation(fn("dryRun"),{manifest:f.m,...bindings});expect(review.ready).toBe(true);
 const id=await f.t.run(ctx=>ctx.db.insert("membership_restriction_rules",{resourceType:"route",resourceIdOrKey:"/target-only/*",ruleMode:"allow_only",planIds:[],teaserMode:"hide",loginRequired:true,createdAt:1,updatedAt:1}));
 await expect(f.authed.mutation(fn("apply"),receiptArgs(review))).rejects.toThrow("changed after review");
 const fresh=await f.authed.mutation(fn("dryRun"),{manifest:f.m,...bindings});expect(fresh.ready).toBe(false);expect(fresh.receiptId).toBeNull();expect(fresh.issues).toContainEqual(expect.objectContaining({code:"TARGET_ROUTE_POLICY_CONFLICT"}));
 expect(await f.t.run(ctx=>ctx.db.query("posts").collect())).toHaveLength(0);expect((await f.t.run(ctx=>ctx.db.query("membership_restriction_rules").collect())).map(row=>row._id)).toEqual([id]);
});

test("route rules sharing a pattern preserve independent source mappings",async()=>{
 const f=await routePolicyFixture();f.m.records[2].data.resourceIdOrKey="/welcome";
 let review=await f.authed.mutation(fn("dryRun"),{manifest:f.m,...bindings});expect(review.ready).toBe(true);await f.authed.mutation(fn("apply"),receiptArgs(review));
 review=await f.authed.mutation(fn("dryRun"),{manifest:f.m,...bindings});expect(review.ready).toBe(true);expect(new Set(review.changes.filter(change=>change.kind==="restriction").map(change=>change.targetId)).size).toBe(2);
 const removed=structuredClone(f.m);removed.records.pop();const removal=await f.authed.mutation(fn("dryRun"),{manifest:removed,...bindings});expect(removal.ready).toBe(false);expect(removal.issues.some(issue=>issue.code==="TARGET_ROUTE_POLICY_CONFLICT")).toBe(true);
});

test("site route policies remap membership plans without transferring customer grants",async()=>{
 const source=await routePolicyFixture();source.m.records.push(learningManifest().records[0]);source.m.records[1].data.planIds=["@promotion:plan:source"];
 const initial=await source.authed.mutation(fn("dryRun"),{manifest:source.m,...bindings});expect(initial.ready).toBe(true);
 const applied=await source.authed.mutation(fn("apply"),receiptArgs(initial));const sourcePlan=applied.mappings.find(mapping=>mapping.kind==="plan")!.targetId;
 await source.t.run(async ctx=>{const site=(await ctx.db.query("convexpress_siteIdentity").unique())!;await ctx.db.patch(site._id,source.m.source);await ctx.db.insert("membership_grants",{userId:source.userId,planId:sourcePlan,status:"active",sourceType:"manual",startsAt:1,createdAt:1,updatedAt:1});});
 const exported=await source.authed.query(makeFunctionReference<"query">("contentPromotion/operations:exportManifest"),{target,selection:{...source.m.selection,pageIds:[]}});
 expect(exported.manifest.records.map(record=>record.kind).sort()).toEqual(["plan","restriction","restriction"]);
 const destination=await routePolicyFixture();const reviewed=await destination.authed.mutation(fn("dryRun"),{manifest:exported.manifest,...bindings});expect(reviewed.ready).toBe(true);
 const result=await destination.authed.mutation(fn("apply"),receiptArgs(reviewed));const targetPlan=result.mappings.find(mapping=>mapping.kind==="plan")!.targetId;
 const rows=await destination.t.run(async ctx=>({rules:await ctx.db.query("membership_restriction_rules").collect(),grants:await ctx.db.query("membership_grants").collect(),users:await ctx.db.query("users").collect()}));
 expect(rows.rules.find(rule=>rule.resourceIdOrKey==="/welcome")!.planIds).toEqual([targetPlan]);expect(rows.grants).toHaveLength(0);expect(rows.users).toHaveLength(1);
});
async function existingCanonicalTarget(f:Awaited<ReturnType<typeof fixture>>) {
 return f.t.run(async ctx=>{
  const user=await ctx.db.get(f.userId);const role=await ctx.db.get(user!.roleId!);await ctx.db.patch(role!._id,{capabilities:[...role!.capabilities,"revision.restore"]});
  return ctx.db.insert("posts",{type:"page",title:"Original target",slug:"welcome",path:"/welcome",content:"",contentMode:"blocks",blocksVersion:2,blocksRevision:7,blocks:[],status:"draft",visibility:"public",authorId:f.userId,commentStatus:"closed",createdAt:1,updatedAt:1});
 });
}
const receiptArgs=(review:{receiptId:string|null;digest:string})=>({receiptId:review.receiptId!,expectedDigest:review.digest,confirmLive:true});

test("canonical promotion updates and restores target history with monotonic revisions and idempotent receipts",async()=>{
 const f=await fixture(),id=await existingCanonicalTarget(f),m=await canonicalManifest();
 const original=await f.t.run(ctx=>ctx.db.get(id));
 const review=await f.authed.mutation(fn("dryRun"),{manifest:m,...bindings});expect(review.ready).toBe(true);
 const args=receiptArgs(review),applied=await f.authed.mutation(fn("apply"),args);
 expect(await f.authed.mutation(fn("apply"),args)).toEqual(applied);
 const changed=await f.t.run(ctx=>ctx.db.get(id));
 expect(changed).toMatchObject({title:"Welcome",blocksVersion:2,blocksRevision:8,authorId:original!.authorId,createdAt:1});
 expect(changed!.blocks![0].children![0].attrs.alt).toBe("Source literal");
 let history=await f.t.run(ctx=>ctx.db.query("revisions").collect());
 expect(history).toHaveLength(1);expect(history[0]).toMatchObject({title:"Original target",blocksVersion:2,blocks:[],parentId:id});
 const rolled=await f.authed.mutation(fn("rollback"),args);expect(await f.authed.mutation(fn("rollback"),args)).toEqual(rolled);
 const restored=await f.t.run(ctx=>ctx.db.get(id));
 expect(restored).toMatchObject({title:"Original target",blocksVersion:2,blocksRevision:9,blocks:[],authorId:original!.authorId,createdAt:1});
 history=await f.t.run(ctx=>ctx.db.query("revisions").collect());expect(history).toHaveLength(2);expect(history[1].blocks).toEqual(changed!.blocks);
});

test("canonical review blocks nested disabled blocks and rejects policy changes after review atomically",async()=>{
 const f=await fixture(),id=await existingCanonicalTarget(f),m=await canonicalManifest();
 const review=await f.authed.mutation(fn("dryRun"),{manifest:m,...bindings});expect(review.ready).toBe(true);
 const original=await f.t.run(ctx=>ctx.db.get(id));
 await f.t.run(ctx=>ctx.db.insert("settings",{section:"blocks",values:{disabledBlockNames:["core/image"]},updatedBy:f.userId,updatedAt:1}));
 const denied=await f.authed.mutation(fn("dryRun"),{manifest:m,...bindings});expect(denied.ready).toBe(false);expect(denied.receiptId).toBeNull();expect(denied.issues).toContainEqual(expect.objectContaining({code:"TARGET_CANONICAL_POLICY"}));
 await expect(f.authed.mutation(fn("apply"),receiptArgs(review))).rejects.toThrow("Target content or dependencies changed");
 expect(await f.t.run(ctx=>ctx.db.get(id))).toEqual(original);expect(await f.t.run(ctx=>ctx.db.query("revisions").collect())).toHaveLength(0);
});

test("canonical promotion rejects legacy target migration and stale edits before apply and rollback",async()=>{
 const f=await fixture(),id=await existingCanonicalTarget(f),m=await canonicalManifest();
 await f.t.run(ctx=>ctx.db.patch(id,{blocksVersion:undefined}));
 const denied=await f.authed.mutation(fn("dryRun"),{manifest:m,...bindings});expect(denied.ready).toBe(false);expect(denied.issues).toContainEqual(expect.objectContaining({code:"CANONICAL_TARGET_MIGRATION_REQUIRED"}));
 await f.t.run(ctx=>ctx.db.patch(id,{blocksVersion:2}));
 const review=await f.authed.mutation(fn("dryRun"),{manifest:m,...bindings});
 await f.t.run(ctx=>ctx.db.patch(id,{title:"Concurrent target edit"}));
 await expect(f.authed.mutation(fn("apply"),receiptArgs(review))).rejects.toThrow("Target content or dependencies changed");
 const fresh=await f.authed.mutation(fn("dryRun"),{manifest:m,...bindings});await f.authed.mutation(fn("apply"),receiptArgs(fresh));
 await f.t.run(ctx=>ctx.db.patch(id,{title:"Edit after promotion"}));
 await expect(f.authed.mutation(fn("rollback"),receiptArgs(fresh))).rejects.toThrow("Content changed after this promotion");
 expect((await f.t.run(ctx=>ctx.db.get(id)))!.title).toBe("Edit after promotion");
});

test("canonical rollback requires current revision restore permission without partial history writes",async()=>{
 const f=await fixture(),id=await existingCanonicalTarget(f),m=await canonicalManifest();
 const review=await f.authed.mutation(fn("dryRun"),{manifest:m,...bindings});await f.authed.mutation(fn("apply"),receiptArgs(review));
 const before=await f.t.run(ctx=>ctx.db.get(id));
 await f.t.run(async ctx=>{const user=await ctx.db.get(f.userId),role=await ctx.db.get(user!.roleId!);await ctx.db.patch(role!._id,{capabilities:role!.capabilities.filter(c=>c!=="revision.restore")});});
 await expect(f.authed.mutation(fn("rollback"),receiptArgs(review))).rejects.toThrow();
 expect(await f.t.run(ctx=>ctx.db.get(id))).toEqual(before);expect(await f.t.run(ctx=>ctx.db.query("revisions").collect())).toHaveLength(1);
});

test("canonical promotion applies the template first and rejects a changed appearance review",async()=>{
 const f=await fixture(),id=await existingCanonicalTarget(f),m=await canonicalManifest();
 const templateId=await f.t.run(ctx=>ctx.db.insert("settings",{section:"appearance.template",values:{active:"core",overrides:{},variants:{},settings:{}},updatedAt:1,updatedBy:f.userId,legacyAppearanceMigration:{version:2,migratedAt:1}}));
 m.selection.includePresentation=true;
 m.records.push({key:"template",kind:"presentation",sourceRevision:"1",data:{section:"appearance.template",values:{active:"aster-house",overrides:{},variants:{},settings:{}}}});
 const {orderedRecords}=await import("../planner");expect(orderedRecords(m).map(r=>r.key)).toEqual(["template","page:source-page"]);
 const review=await f.authed.mutation(fn("dryRun"),{manifest:m,...bindings});expect(review.ready).toBe(true);
 await f.authed.mutation(fn("apply"),receiptArgs(review));expect((await f.t.run(ctx=>ctx.db.get(templateId)))!.values.active).toBe("aster-house");
 await f.authed.mutation(fn("rollback"),receiptArgs(review));expect((await f.t.run(ctx=>ctx.db.get(templateId)))!.values.active).toBe("core");expect((await f.t.run(ctx=>ctx.db.get(id)))!.title).toBe("Original target");
 const contentOnly=await canonicalManifest(),fresh=await f.authed.mutation(fn("dryRun"),{manifest:contentOnly,...bindings});
 await f.t.run(ctx=>ctx.db.patch(templateId,{values:{active:"depot",overrides:{},variants:{},settings:{}}}));
 await expect(f.authed.mutation(fn("apply"),receiptArgs(fresh))).rejects.toThrow("Target content or dependencies changed");
});

test("canonical publication retains a different target author and rolls back publication counts",async()=>{
 const f=await fixture(),id=await existingCanonicalTarget(f),m=await canonicalManifest();
 const author=await f.t.run(async ctx=>{const owner=await ctx.db.get(f.userId);const author=await insertWithMediaReferences(ctx,"users",{email:"target-author@example.test",emailVerified:true,status:"active",authSource:"local",roleId:owner!.roleId,createdAt:1,updatedAt:1});await ctx.db.patch(id,{type:"post",authorId:author});return author;});
 m.records[0].kind="post";m.records[0].key="post:source-page";delete m.records[0].data.path;delete m.records[0].data.depth;m.records[0].data.status="publish";m.selection.pageIds=[];m.selection.postIds=["source-page"];
 const review=await f.authed.mutation(fn("dryRun"),{manifest:m,...bindings});expect(review.ready).toBe(true);
 await f.authed.mutation(fn("apply"),receiptArgs(review));expect(await f.t.run(ctx=>ctx.db.get(id))).toMatchObject({authorId:author,status:"publish",blocksRevision:8});
 expect((await f.t.run(ctx=>ctx.db.get(author)))!.postCount).toBe(1);
 await f.authed.mutation(fn("rollback"),receiptArgs(review));expect(await f.t.run(ctx=>ctx.db.get(id))).toMatchObject({authorId:author,status:"draft",blocksRevision:9});
 expect((await f.t.run(ctx=>ctx.db.get(author)))!.postCount).toBe(0);
 await f.t.finishAllScheduledFunctions(()=>{});
});

test("canonical review requires publishing authority to withdraw an existing publication",async()=>{
 const f=await fixture(),id=await existingCanonicalTarget(f),m=await canonicalManifest();
 await f.t.run(async ctx=>{await ctx.db.patch(id,{status:"publish"});const user=await ctx.db.get(f.userId),role=await ctx.db.get(user!.roleId!);await ctx.db.patch(role!._id,{capabilities:role!.capabilities.filter(c=>c!=="page.publish")});});
 await expect(f.authed.mutation(fn("dryRun"),{manifest:m,...bindings})).rejects.toThrow();
 expect((await f.t.run(ctx=>ctx.db.get(id)))!.status).toBe("publish");expect(await f.t.run(ctx=>ctx.db.query("contentPromotion_receipts").collect())).toHaveLength(0);
});

test("canonical review rejects plugin blocks when the destination plugin is unavailable",async()=>{
 const f=await fixture(),m=await canonicalManifest();
 const {exportCanonicalPromotionTree}=await import("../../canonicalDocuments/foundation/promotionTree");
 m.records[0].data.canonical=await exportCanonicalPromotionTree([{id:"hero",name:"commerce/product-hero",version:1,attrs:{}}],async()=>{throw new Error("Unexpected reference");});
 await f.t.run(async ctx=>{const row=(await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","plugins")).unique())!;await ctx.db.patch(row._id,{values:{commerceEnabled:false}});});
 const review=await f.authed.mutation(fn("dryRun"),{manifest:m,...bindings});expect(review.ready).toBe(false);expect(review.receiptId).toBeNull();expect(review.issues).toContainEqual(expect.objectContaining({code:"TARGET_CANONICAL_POLICY"}));
 expect(await f.t.run(ctx=>ctx.db.query("posts").collect())).toHaveLength(0);
});

async function canonicalMediaSource() {
 const source=await fixture();
 const bytes=new Blob([Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII="),c=>c.charCodeAt(0))],{type:"image/png"});
 const ids=await source.t.run(async ctx=>{
  const identity=(await ctx.db.query("convexpress_siteIdentity").unique())!;await ctx.db.patch(identity._id,manifest().source);
  const storageId=await ctx.storage.store(bytes),stored=(await ctx.db.system.get(storageId))!;
  const mediaId=await ctx.db.insert("media",{title:"Source image",fileName:"pixel.png",slug:"promotion-image",mimeType:"image/png",mediaType:"image",fileSize:stored.size,storageId,url:(await ctx.storage.getUrl(storageId))!,width:1,height:1,altText:"Original pixel",status:"active",uploadedBy:source.userId,createdAt:1,updatedAt:1});
  const pageId=await ctx.db.insert("posts",{type:"page",title:"Media page",slug:"welcome",path:"/welcome",content:"",contentMode:"blocks",blocksVersion:2,blocksRevision:3,blocks:[{id:"group",name:"core/group",version:1,attrs:{},children:[{id:"first",name:"core/image",version:2,attrs:{mediaId,alt:"First image"}},{id:"second",name:"core/media-text",version:2,attrs:{mediaId,heading:"A second occurrence"}}]}],status:"draft",visibility:"public",authorId:source.userId,commentStatus:"closed",createdAt:1,updatedAt:1});
  return {pageId,mediaId,storageId};
 });
 const original=await source.t.run(async ctx=>({page:await ctx.db.get(ids.pageId),media:await ctx.db.get(ids.mediaId)}));
 const exported=await source.authed.query(makeFunctionReference<"query">("contentPromotion/operations:exportManifest"),{target,selection:{...manifest().selection,pageIds:[ids.pageId]}});
 return {source,bytes,ids,original,manifest:exported.manifest as ContentPromotionManifest,mediaKey:`media:${ids.mediaId}`};
}

test("registered canonical media export transfers verified bytes once and resolves target-owned editor resources",async()=>{
 const src=await canonicalMediaSource(),f=await fixture();
 const id=await existingCanonicalTarget(f);
 expect(src.manifest.records.filter(r=>r.kind==="media")).toHaveLength(1);
 const storageId=await f.t.run(ctx=>ctx.storage.store(src.bytes));
 const review=await f.authed.mutation(fn("dryRun"),{manifest:src.manifest,mediaBindings:[{key:src.mediaKey,storageId}],dependencyBindings:[]});expect(review.ready).toBe(true);
 const args=receiptArgs(review);await f.authed.mutation(fn("apply"),args);await f.authed.mutation(fn("apply"),args);
 const saved=await f.t.run(async ctx=>({page:await ctx.db.get(id),media:await ctx.db.query("media").unique(),history:await ctx.db.query("revisions").collect()}));
 expect(saved.media!._id).not.toBe(src.ids.mediaId);expect(saved.media!.storageId).toBe(storageId);expect(saved.history).toHaveLength(1);
 expect(saved.page!.blocks![0].children!.map(node=>node.attrs.mediaId)).toEqual([saved.media!._id,saved.media!._id]);
 const doc=await f.authed.query(makeFunctionReference<"query">("canonicalDocuments:get"),{postId:id});
 expect(Object.keys(doc.resources.media)).toEqual([saved.media!._id]);
 expect(doc.resources.media[saved.media!._id]).toMatchObject({src:await f.t.run(ctx=>ctx.storage.getUrl(storageId)),width:1,height:1,mimeType:"image/png"});
 const transferred=await f.t.run(async ctx=>Array.from(new Uint8Array(await (await ctx.storage.get(storageId))!.arrayBuffer())));
 expect(transferred).toEqual(Array.from(new Uint8Array(await src.bytes.arrayBuffer())));
 expect(await src.source.t.run(async ctx=>({page:await ctx.db.get(src.ids.pageId),media:await ctx.db.get(src.ids.mediaId)}))).toEqual(src.original);
});

test("canonical media review rejects different bytes and refuses deleted target storage before any content write",async()=>{
 const src=await canonicalMediaSource(),f=await fixture(),id=await existingCanonicalTarget(f);
 const before=await f.t.run(ctx=>ctx.db.get(id));
 const wrong=await f.t.run(ctx=>ctx.storage.store(new Blob(["different bytes"])));
 const rejected=await f.authed.mutation(fn("dryRun"),{manifest:src.manifest,mediaBindings:[{key:src.mediaKey,storageId:wrong}],dependencyBindings:[]});expect(rejected.ready).toBe(false);expect(rejected.issues).toContainEqual(expect.objectContaining({code:"TARGET_MEDIA_UPLOAD_REQUIRED"}));
 const storageId=await f.t.run(ctx=>ctx.storage.store(src.bytes));
 const review=await f.authed.mutation(fn("dryRun"),{manifest:src.manifest,mediaBindings:[{key:src.mediaKey,storageId}],dependencyBindings:[]});expect(review.ready).toBe(true);
 await f.t.run(ctx=>ctx.storage.delete(storageId));
 await expect(f.authed.mutation(fn("apply"),receiptArgs(review))).rejects.toThrow("Target content or dependencies changed");
 expect(await f.t.run(ctx=>ctx.db.get(id))).toEqual(before);
 for(const table of ["media","revisions","contentPromotion_mappings","contentPromotion_backups"] as const)expect(await f.t.run(ctx=>ctx.db.query(table).collect())).toHaveLength(0);
});

test("canonical rollback retains image references in history and refuses an unavailable original resource",async()=>{
 const {MEDIA_REVERSE_EPOCH_VARIABLE}=await import("../../media/reverseIndexVersion");
 const previousEpoch=process.env[MEDIA_REVERSE_EPOCH_VARIABLE];process.env[MEDIA_REVERSE_EPOCH_VARIABLE]="promotion_media_history_fixture";
 try {
  const src=await canonicalMediaSource(),f=await fixture(),id=await existingCanonicalTarget(f);
  const {mediaId,oldMediaId,storageId}=await f.t.run(async ctx=>{
   const storageId=await ctx.storage.store(src.bytes);
   const fields={title:"Target image",fileName:"pixel.png",mimeType:"image/png",mediaType:"image" as const,fileSize:src.bytes.size,storageId,url:(await ctx.storage.getUrl(storageId))!,width:1,height:1,status:"active" as const,uploadedBy:f.userId,createdAt:1,updatedAt:1};
   const oldMediaId=await ctx.db.insert("media",{...fields,slug:"original-target-image"});
   const mediaId=await ctx.db.insert("media",{...fields,slug:"promotion-image"});
   await ctx.db.patch(id,{blocks:[{id:"original",name:"core/image",version:2,attrs:{mediaId:oldMediaId,alt:"Original target image"}}]});
   return {mediaId,oldMediaId,storageId};
  });
  const original=await f.t.run(ctx=>ctx.db.get(id));
  const review=await f.authed.mutation(fn("dryRun"),{manifest:src.manifest,mediaBindings:[{key:src.mediaKey,storageId}],dependencyBindings:[]});expect(review.ready).toBe(true);
  const args=receiptArgs(review);await f.authed.mutation(fn("apply"),args);
  const promoted=await f.t.run(ctx=>ctx.db.get(id));
  const edges=()=>f.t.run(ctx=>ctx.db.query("media_reference_edges").collect());
  expect(await edges()).toContainEqual(expect.objectContaining({ownerId:id,ownerTable:"posts",mediaId}));
  expect(await edges()).toContainEqual(expect.objectContaining({ownerTable:"revisions",mediaId:oldMediaId}));
  await f.t.run(ctx=>ctx.db.patch(oldMediaId,{status:"trashed"}));
  await expect(f.authed.mutation(fn("rollback"),args)).rejects.toThrow("unavailable");
  expect(await f.t.run(ctx=>ctx.db.get(id))).toEqual(promoted);expect(await f.t.run(ctx=>ctx.db.query("revisions").collect())).toHaveLength(1);
  await f.t.run(ctx=>ctx.db.patch(oldMediaId,{status:"active"}));await f.authed.mutation(fn("rollback"),args);
  expect(await f.t.run(ctx=>ctx.db.get(id))).toMatchObject({blocks:original!.blocks,blocksVersion:2,blocksRevision:9});
  expect(await edges()).toContainEqual(expect.objectContaining({ownerId:id,ownerTable:"posts",mediaId:oldMediaId}));
  expect(await edges()).not.toContainEqual(expect.objectContaining({ownerId:id,ownerTable:"posts",mediaId}));
  expect(await edges()).toContainEqual(expect.objectContaining({ownerTable:"revisions",mediaId}));
 } finally {if(previousEpoch===undefined)delete process.env[MEDIA_REVERSE_EPOCH_VARIABLE];else process.env[MEDIA_REVERSE_EPOCH_VARIABLE]=previousEpoch;}
});

async function contactPromotionFixture() {
 const f=await fixture(),m=await canonicalManifest();
 const {exportCanonicalPromotionTree}=await import("../../canonicalDocuments/foundation/promotionTree");
 m.records[0].data.canonical=await exportCanonicalPromotionTree([{id:"group",name:"core/group",version:1,attrs:{},children:[{id:"contact",name:"core/contact-form",version:2,attrs:{fields:[{name:"email",label:"Email",type:"email",required:true}]}}]}],async()=>{throw new Error("Unexpected reference");});
 await f.t.run(async ctx=>{const setting=(await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","plugins")).unique())!;await ctx.db.patch(setting._id,{values:{formsEnabled:true}});});
 const grants=async(capabilities:("form.create"|"form.update")[])=>f.t.run(async ctx=>{const user=await ctx.db.get(f.userId),role=await ctx.db.get(user!.roleId!);await ctx.db.patch(role!._id,{capabilities:[...role!.capabilities.filter(c=>c!=="form.create"&&c!=="form.update"),...capabilities]});});
 return {...f,m,grants};
}

test("pages sharing template-local block IDs promote into independent contact forms",async()=>{
 const f=await contactPromotionFixture();await f.grants(["form.create"]);
 const copied=structuredClone(f.m.records[0]);copied.key="page:copied-page";
 Object.assign(copied.data,{title:"Second template page",slug:"second-template-page",path:"/second-template-page"});
 f.m.records.push(copied);f.m.selection.pageIds.push("copied-page");
 const review=await f.authed.mutation(fn("dryRun"),{manifest:f.m,...bindings});expect(review.ready).toBe(true);
 const applied=await f.authed.mutation(fn("apply"),receiptArgs(review));
 const pageIds=applied.mappings.filter(mapping=>mapping.kind==="page").map(mapping=>mapping.targetId);
 expect(new Set(pageIds).size).toBe(2);
 const forms=await f.t.run(ctx=>ctx.db.query("forms").collect());expect(forms).toHaveLength(2);
 expect(forms.map(form=>form.contactBlockId)).toEqual(["contact","contact"]);
 expect(new Set(forms.map(form=>form.contactPostId))).toEqual(new Set(pageIds));
 expect(new Set(forms.map(form=>form.fieldGroupId)).size).toBe(2);
});

test("canonical local IDs cannot bind legacy global block membership rules",async()=>{
 const {validateManifest}=await import("../shared");const m=await canonicalManifest();
 m.records.push({key:"restriction:legacy-block",kind:"restriction",sourceRevision:"1",data:{resourceType:"block",resourceIdOrKey:"image",ruleMode:"allow_only",planIds:[],teaserMode:"hide",loginRequired:true}});
 expect(()=>validateManifest(m)).toThrow("A block policy must target a block included in this authored selection.");
});

test("document-local identity support still rejects duplicates inside a canonical tree and across legacy pages",async()=>{
 const {validateManifest}=await import("../shared");const canonical=await canonicalManifest();
 const tree=canonical.records[0].data.canonical as {blocks:Array<{id:string}>};
 tree.blocks.push(structuredClone(tree.blocks[0]));expect(()=>validateManifest(canonical)).toThrow();
 const legacy=manifest(),copy=structuredClone(legacy.records[0]);copy.key="page:copy";
 Object.assign(copy.data,{slug:"copy",path:"/copy"});legacy.records.push(copy);legacy.selection.pageIds.push("copy");
 expect(()=>validateManifest(legacy)).toThrow("The selection contains repeated block IDs.");
});

test("canonical review rejects missing contact creation permission before creating a receipt or target data",async()=>{
 const f=await contactPromotionFixture();
 const review=await f.authed.mutation(fn("dryRun"),{manifest:f.m,...bindings});expect(review.ready).toBe(false);expect(review.receiptId).toBeNull();
 expect(review.issues).toContainEqual(expect.objectContaining({code:"TARGET_CONTACT_PERMISSION",key:"page:source-page",message:expect.stringContaining("form.create")}));
 for(const table of ["posts","forms","fieldGroups","fieldDefinitions","contentPromotion_receipts","contentPromotion_mappings"] as const)expect(await f.t.run(ctx=>ctx.db.query(table).collect())).toHaveLength(0);
});

test("contact promotion distinguishes creating from updating and preserves form identity",async()=>{
 const f=await contactPromotionFixture();await f.grants(["form.create"]);
 let review=await f.authed.mutation(fn("dryRun"),{manifest:f.m,...bindings});expect(review.ready).toBe(true);
 await f.authed.mutation(fn("apply"),receiptArgs(review));
 const before=await f.t.run(ctx=>ctx.db.query("forms").collect());expect(before).toHaveLength(1);expect(before[0].status).toBe("published");
 review=await f.authed.mutation(fn("dryRun"),{manifest:f.m,...bindings});expect(review.ready).toBe(false);expect(review.issues.some(i=>i.code==="TARGET_CONTACT_PERMISSION"&&i.message.includes("form.update"))).toBe(true);
 await f.grants(["form.update"]);
 review=await f.authed.mutation(fn("dryRun"),{manifest:f.m,...bindings});expect(review.ready).toBe(true);
 await f.authed.mutation(fn("apply"),receiptArgs(review));
 expect((await f.t.run(ctx=>ctx.db.query("forms").collect())).map(row=>row._id)).toEqual(before.map(row=>row._id));
});

test("a new nested contact block requires create permission even on an existing contact page",async()=>{
 const f=await contactPromotionFixture();await f.grants(["form.create"]);
 const review=await f.authed.mutation(fn("dryRun"),{manifest:f.m,...bindings});await f.authed.mutation(fn("apply"),receiptArgs(review));
 await f.grants(["form.update"]);
 const {exportCanonicalPromotionTree}=await import("../../canonicalDocuments/foundation/promotionTree");
 f.m.records[0].data.canonical=await exportCanonicalPromotionTree([{id:"outer",name:"core/group",version:1,attrs:{},children:[{id:"contact",name:"core/contact-form",version:2,attrs:{}},{id:"nested",name:"core/group",version:1,attrs:{},children:[{id:"new-contact",name:"core/contact-form",version:2,attrs:{}}]}]}],async()=>{throw new Error("Unexpected reference");});
 const denied=await f.authed.mutation(fn("dryRun"),{manifest:f.m,...bindings});expect(denied.ready).toBe(false);expect(denied.receiptId).toBeNull();
 expect(denied.issues.filter(i=>i.code==="TARGET_CONTACT_PERMISSION")).toEqual([expect.objectContaining({message:expect.stringContaining("new-contact requires form.create")})]);
 expect(await f.t.run(ctx=>ctx.db.query("forms").collect())).toHaveLength(1);
});

test("revoked contact permission invalidates an issued review without destination writes",async()=>{
 const f=await contactPromotionFixture();await f.grants(["form.create"]);
 const review=await f.authed.mutation(fn("dryRun"),{manifest:f.m,...bindings});expect(review.ready).toBe(true);
 await f.grants([]);
 await expect(f.authed.mutation(fn("apply"),receiptArgs(review))).rejects.toThrow("changed after review");
 for(const table of ["posts","forms","contentPromotion_mappings","contentPromotion_backups"] as const)expect(await f.t.run(ctx=>ctx.db.query(table).collect())).toHaveLength(0);
});

test("a contact form appearing after review invalidates the receipt even when both permissions remain granted",async()=>{
 const f=await contactPromotionFixture(),postId=await existingCanonicalTarget(f);await f.grants(["form.create","form.update"]);
 const review=await f.authed.mutation(fn("dryRun"),{manifest:f.m,...bindings});expect(review.ready).toBe(true);
 const before=await f.t.run(ctx=>ctx.db.get(postId));
 await f.t.run(ctx=>ctx.db.insert("forms",{title:"Concurrent form",slug:"concurrent",status:"draft",settings:"{}",contactPostId:postId,contactBlockId:"contact",createdBy:f.userId,createdAt:1,updatedAt:1}));
 await expect(f.authed.mutation(fn("apply"),receiptArgs(review))).rejects.toThrow("changed after review");
 expect(await f.t.run(ctx=>ctx.db.get(postId))).toEqual(before);
});

test("a late contact configuration failure rolls back earlier nested document writes and bookkeeping",async()=>{
 const f=await contactPromotionFixture();await f.grants(["form.update"]);
 const id=await existingCanonicalTarget(f);
 await f.t.run(ctx=>ctx.db.patch(id,{slug:"late-form",path:"/late-form"}));
 const first=await canonicalManifest();
 const {exportCanonicalPromotionTree}=await import("../../canonicalDocuments/foundation/promotionTree");first.records[0].data.canonical=await exportCanonicalPromotionTree([],async()=>{throw new Error("Unexpected reference");});f.m.records.unshift(first.records[0]);
 f.m.records[1]={...f.m.records[1],key:"page:late-form",data:{...f.m.records[1].data,title:"Late form",slug:"late-form",path:"/late-form"}};f.m.selection.pageIds.push("late-form");
 await f.t.run(ctx=>ctx.db.insert("forms",{title:"Damaged form",slug:"damaged",status:"draft",settings:"{}",contactPostId:id,contactBlockId:"contact",createdBy:f.userId,createdAt:1,updatedAt:1}));
 const tables=["posts","revisions","forms","fieldGroups","fieldDefinitions","contentPromotion_mappings","contentPromotion_backups"] as const;
 const before=await Promise.all(tables.map(table=>f.t.run(ctx=>ctx.db.query(table).collect())));
 const review=await f.authed.mutation(fn("dryRun"),{manifest:f.m,...bindings});expect(review.ready).toBe(true);
 await expect(f.authed.mutation(fn("apply"),receiptArgs(review))).rejects.toThrow("field group is missing");
 expect(await Promise.all(tables.map(table=>f.t.run(ctx=>ctx.db.query(table).collect())))).toEqual(before);
 const status=await f.authed.query(makeFunctionReference<"query">("contentPromotion/operations:receiptStatus"),{receiptId:review.receiptId});expect(status.status).toBe("ready");
});

async function kbPromotionFixture(source = false) {
  const f = await fixture();
  await f.t.run(async ctx => {
    const user = (await ctx.db.get(f.userId))!, role = (await ctx.db.get(user.roleId!))!;
    await ctx.db.patch(role._id, { level: 80, capabilities: [...role.capabilities, "kb.manageCategories", "revision.restore"] });
    const plugins = (await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "plugins")).unique())!;
    await ctx.db.patch(plugins._id, { values: { knowledgeBaseEnabled: true, membershipEnabled: false } });
    await ctx.db.insert("settings", { section: "appearance.template", values: { active: "core", overrides: {}, variants: {}, settings: {} }, legacyAppearanceMigration: { version: 2, migratedAt: 1 }, updatedAt: 1, updatedBy: f.userId });
    if (source) await ctx.db.patch((await ctx.db.query("convexpress_siteIdentity").unique())!._id, manifest().source);
  });
  return f;
}
async function kbPromotionSource() {
  const f = await kbPromotionFixture(true);
  const ids = await f.t.run(async ctx => {
    const parent = await ctx.db.insert("kb_categories", { name: "Help library", slug: "library", order: 0, isActive: true, isPublished: true, articleCount: 9, createdAt: 1, updatedAt: 1 });
    const category = await ctx.db.insert("kb_categories", { name: "Workshop guides", slug: "workshop", parentId: parent, description: "Practical help", order: 1, isActive: true, isPublished: true, articleCount: 7, createdAt: 1, updatedAt: 1 });
    const page = await ctx.db.insert("posts", { type: "page", title: "Help", slug: "help-study", path: "/help-study", status: "publish", visibility: "public", content: "", contentMode: "blocks", blocksVersion: 2, blocksRevision: 1, blocks: [{ id: "help", name: "support/kb-search", version: 1, attrs: { category } }], authorId: f.userId, commentStatus: "closed", createdAt: 1, updatedAt: 1 });
    return { parent, category, page };
  });
  const exported = await f.authed.query(makeFunctionReference<"query">("contentPromotion/operations:exportManifest"), { target, selection: { ...manifest().selection, pageIds: [ids.page] } });
  return { ...f, ids, manifest: exported.manifest };
}

test("KB search promotion remaps category parents into the destination without source counters", async () => {
  const source = await kbPromotionSource(), destination = await kbPromotionFixture();
  const categories = source.manifest.records.filter((r: { kind: string }) => r.kind === "kbCategory");
  expect(categories).toHaveLength(2);
  expect(categories.every((r: { data: object }) => !("articleCount" in r.data))).toBe(true);
  expect(categories.find((r: { key: string }) => r.key === `kbCategory:${source.ids.category}`).data.parentId).toBe(`@promotion:kbCategory:${source.ids.parent}`);
  const review = await destination.authed.mutation(fn("dryRun"), { manifest: source.manifest, ...bindings });
  expect(review.ready).toBe(true);
  const args = { receiptId: review.receiptId, expectedDigest: review.digest, confirmLive: true };
  await destination.authed.mutation(fn("apply"), args);
  const saved = await destination.t.run(async ctx => ({ page: await ctx.db.query("posts").unique(), categories: await ctx.db.query("kb_categories").collect() }));
  const child = saved.categories.find(c => c.slug === "workshop")!, parent = saved.categories.find(c => c.slug === "library")!;
  expect(child._id).not.toBe(source.ids.category); expect(parent._id).not.toBe(source.ids.parent);
  expect(child.parentId).toBe(parent._id); expect(child.articleCount).toBe(0); expect(parent.articleCount).toBe(0);
  expect(saved.page!.blocks![0].attrs.category).toBe(child._id);
  const publicPage = await destination.t.query(makeFunctionReference<"query">("canonicalDocuments:getForRender"), { postId: saved.page!._id });
  expect(publicPage.data.dataByBlock.help.data.category.id).toBe(child._id);
  await destination.authed.mutation(fn("apply"), args);
  expect(await destination.t.run(ctx => ctx.db.query("kb_categories").collect())).toHaveLength(2);
});

test("KB category promotion preserves target counters and rolls back authored updates", async () => {
  const source = await kbPromotionSource(), destination = await kbPromotionFixture();
  const ids = await destination.t.run(async ctx => {
    const parent = await ctx.db.insert("kb_categories", { name: "Local library", slug: "library", order: 9, isActive: true, isPublished: true, articleCount: 100, createdAt: 2, updatedAt: 2 });
    const category = await ctx.db.insert("kb_categories", { name: "Local workshop", slug: "workshop", parentId: parent, order: 5, isActive: true, isPublished: true, articleCount: 23, createdAt: 2, updatedAt: 2 });
    return { parent, category };
  });
  const first = await destination.authed.mutation(fn("dryRun"), { manifest: source.manifest, ...bindings });
  expect(first.ready).toBe(true);
  await destination.authed.mutation(fn("apply"), { receiptId: first.receiptId, expectedDigest: first.digest, confirmLive: true });
  expect(await destination.t.run(ctx => ctx.db.get(ids.category))).toMatchObject({ name: "Workshop guides", articleCount: 23, parentId: ids.parent });
  const updated = structuredClone(source.manifest);
  updated.records.find((r: { key: string }) => r.key === `kbCategory:${source.ids.category}`).data.name = "Updated workshop";
  const second = await destination.authed.mutation(fn("dryRun"), { manifest: updated, ...bindings });
  expect(second.ready).toBe(true);
  const args = { receiptId: second.receiptId, expectedDigest: second.digest, confirmLive: true };
  await destination.authed.mutation(fn("apply"), args);
  expect(await destination.t.run(ctx => ctx.db.get(ids.category))).toMatchObject({ name: "Updated workshop", articleCount: 23 });
  await destination.authed.mutation(fn("rollback"), args);
  expect(await destination.t.run(ctx => ctx.db.get(ids.category))).toMatchObject({ name: "Workshop guides", articleCount: 23 });
});

test("KB promotion refuses wrong parent kinds, source counters, missing permission and disabled target plugin", async () => {
  const source = await kbPromotionSource(), destination = await kbPromotionFixture();
  for (const field of [{ articleCount: 7 }, { parentId: `@promotion:page:${source.ids.page}` }, { parentId: source.ids.parent }]) {
    const invalid = structuredClone(source.manifest);
    Object.assign(invalid.records.find((r: { key: string }) => r.key === `kbCategory:${source.ids.category}`).data, field);
    await expect(destination.authed.mutation(fn("dryRun"), { manifest: invalid, ...bindings })).rejects.toThrow();
  }
  await destination.t.run(async ctx => {
    const plugins = (await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "plugins")).unique())!;
    await ctx.db.patch(plugins._id, { values: { knowledgeBaseEnabled: false } });
  });
  const disabled = await destination.authed.mutation(fn("dryRun"), { manifest: source.manifest, ...bindings });
  expect(disabled.ready).toBe(false); expect(disabled.issues.some((i: { code: string }) => i.code === "TARGET_PLUGIN_DISABLED")).toBe(true);
  await destination.t.run(async ctx => {
    const user = (await ctx.db.get(destination.userId))!, role = (await ctx.db.get(user.roleId!))!;
    await ctx.db.patch(role._id, { capabilities: role.capabilities.filter(c => c !== "kb.manageCategories") });
  });
  await expect(destination.authed.mutation(fn("dryRun"), { manifest: source.manifest, ...bindings })).rejects.toThrow();
  expect(await destination.t.run(ctx => ctx.db.query("kb_categories").collect())).toEqual([]);
  expect(await destination.t.run(ctx => ctx.db.query("posts").collect())).toEqual([]);
});

test("KB promotion rejects parent cycles, stale reviews and source exports without category authority", async () => {
  const source = await kbPromotionSource(), destination = await kbPromotionFixture();
  const cycle = structuredClone(source.manifest);
  cycle.records.find((r: { key: string }) => r.key === `kbCategory:${source.ids.parent}`).data.parentId = `@promotion:kbCategory:${source.ids.category}`;
  await expect(destination.authed.mutation(fn("dryRun"), { manifest: cycle, ...bindings })).rejects.toThrow("cyclic");
  const existing = await destination.t.run(ctx => ctx.db.insert("kb_categories", { name: "Live workshop", slug: "workshop", order: 0, isActive: true, isPublished: true, articleCount: 23, createdAt: 2, updatedAt: 2 }));
  const review = await destination.authed.mutation(fn("dryRun"), { manifest: source.manifest, ...bindings });
  expect(review.ready).toBe(true);
  await destination.t.run(ctx => ctx.db.patch(existing, { name: "Changed after review" }));
  await expect(destination.authed.mutation(fn("apply"), { receiptId: review.receiptId, expectedDigest: review.digest, confirmLive: true })).rejects.toThrow();
  expect(await destination.t.run(ctx => ctx.db.query("posts").collect())).toEqual([]);
  expect(await destination.t.run(ctx => ctx.db.query("kb_categories").collect())).toHaveLength(1);
  await source.t.run(async ctx => {
    const user = (await ctx.db.get(source.userId))!, role = (await ctx.db.get(user.roleId!))!;
    await ctx.db.patch(role._id, { capabilities: role.capabilities.filter(c => c !== "kb.manageCategories") });
  });
  await expect(source.authed.query(makeFunctionReference<"query">("contentPromotion/operations:exportManifest"), { target, selection: { ...manifest().selection, pageIds: [source.ids.page] } })).rejects.toThrow();
});

test("pending KB deletion blocks source export, target review/apply and rollback", async () => {
 const source=await kbPromotionSource(), destination=await kbPromotionFixture();
 const first=await destination.authed.mutation(fn("dryRun"),{manifest:source.manifest,...bindings});
 await destination.authed.mutation(fn("apply"),{receiptId:first.receiptId,expectedDigest:first.digest,confirmLive:true});
 const targetCategory=await destination.t.run(ctx=>ctx.db.query("kb_categories").withIndex("by_slug",q=>q.eq("slug","workshop")).unique());
 const updated=structuredClone(source.manifest);updated.records.find((r:{key:string})=>r.key===`kbCategory:${source.ids.category}`).data.name="Changed before deletion";
 const second=await destination.authed.mutation(fn("dryRun"),{manifest:updated,...bindings});
 const secondArgs={receiptId:second.receiptId,expectedDigest:second.digest,confirmLive:true};await destination.authed.mutation(fn("apply"),secondArgs);
 const pendingReview=await destination.authed.mutation(fn("dryRun"),{manifest:source.manifest,...bindings});
 for(const [site,categoryId] of [[source,source.ids.category],[destination,targetCategory!._id]] as const)await site.authed.run(async ctx=>{
  await beginCategoryDeletion(ctx,categoryId);const category=(await ctx.db.get("kb_categories",categoryId))!;const job=(await ctx.db.get("kb_category_deletions",category.deletionJobId!))!;await ctx.scheduler.cancel(job.scheduledId!);
 });
 await expect(source.authed.query(makeFunctionReference<"query">("contentPromotion/operations:exportManifest"),{target,selection:{...manifest().selection,pageIds:[source.ids.page]}})).rejects.toThrow("being deleted");
 const refused=await destination.authed.mutation(fn("dryRun"),{manifest:source.manifest,...bindings});expect(refused.ready).toBe(false);expect(refused.issues.some((issue:{code:string})=>issue.code==="CATEGORY_DELETING")).toBe(true);
 await expect(destination.authed.mutation(fn("apply"),{receiptId:pendingReview.receiptId,expectedDigest:pendingReview.digest,confirmLive:true})).rejects.toThrow();
 await expect(destination.authed.mutation(fn("rollback"),secondArgs)).rejects.toThrow();
 const current=await destination.t.run(ctx=>ctx.db.get("kb_categories",targetCategory!._id));expect(current!.name).toBe("Changed before deletion");expect(current!.isActive).toBe(false);expect(current!.deletionJobId).toBeDefined();
});

async function rsvpPromotionFixture(){
 const source=await fixture();
 const ids=await source.t.run(async ctx=>{
  const identity=(await ctx.db.query('convexpress_siteIdentity').unique())!;await ctx.db.patch(identity._id,manifest().source);
  const plugins=(await ctx.db.query('settings').withIndex('by_section',q=>q.eq('section','plugins')).unique())!;await ctx.db.patch(plugins._id,{values:{eventsEnabled:true,formsEnabled:true}});
  const startsAt=Date.now()+86400000;
  const event=await ctx.db.insert('extension_events',{title:'RSVP workshop',slug:'rsvp-workshop',description:'An invitation.',startsAt,endsAt:startsAt+3600000,timeZone:'America/Denver',venue:'Studio',venueAddress:'',status:'published',rsvp:{mode:'guests',capacity:3,closesAt:startsAt-3600000},createdBy:source.userId,createdAt:1,updatedAt:1});
  const page=await ctx.db.insert('posts',{type:'page',title:'Join the workshop',contentMode:'blocks',slug:'join-workshop',path:'/join-workshop',status:'publish',visibility:'public',authorId:source.userId,commentStatus:'closed',publishedAt:1,blocksVersion:2,blocksRevision:1,blocks:[{id:'rsvp-block',name:'core/event-rsvp',version:1,attrs:{event}}],createdAt:1,updatedAt:1});
  await ctx.db.insert('event_rsvp_entries',{eventId:event,actorHash:'source-private-actor',name:'Source private guest',email:'source-private@example.invalid',status:'confirmed',revision:1,createdAt:1,updatedAt:1});
  await ctx.db.insert('event_rsvp_totals',{eventId:event,confirmed:1,updatedAt:1});
  await ctx.db.insert('event_rsvp_operations',{eventId:event,actorHash:'source-private-actor',requestKey:'private-source-operation',fingerprint:'private-source-fingerprint',receipt:{status:'confirmed',revision:1},createdAt:1});
  await ctx.db.insert('event_rsvp_rate_limits',{eventId:event,windowStart:1,accepted:1,updatedAt:1});
  return {event,page};
 });
 const exported=await source.authed.query(makeFunctionReference<'query'>('contentPromotion/operations:exportManifest'),{target,selection:{...manifest().selection,pageIds:[ids.page],eventIds:[]}});
 return {source,ids,manifest:exported.manifest as ContentPromotionManifest};
}
async function enableRsvpForms(f:Awaited<ReturnType<typeof fixture>>){await f.t.run(async ctx=>{const settings=(await ctx.db.query('settings').withIndex('by_section',q=>q.eq('section','plugins')).unique())!;await ctx.db.patch(settings._id,{values:{eventsEnabled:true,formsEnabled:true}});});}
async function createRsvpTarget(f:Awaited<ReturnType<typeof fixture>>,m:ContentPromotionManifest,capacity:number){
 await enableRsvpForms(f);
 const data=m.records.find(r=>r.kind==='event')!.data;
 return f.t.run(ctx=>ctx.db.insert('extension_events',{title:String(data.title),slug:String(data.slug),description:String(data.description),startsAt:Number(data.startsAt),endsAt:Number(data.endsAt),timeZone:String(data.timeZone),venue:String(data.venue),venueAddress:String(data.venueAddress),rsvp:{mode:'guests',capacity,closesAt:null},status:'published',createdBy:f.userId,createdAt:1,updatedAt:1}));
}
async function seedTargetAttendees(f:Awaited<ReturnType<typeof fixture>>,eventId:import('../../_generated/dataModel').Id<'extension_events'>,count:number){
 return f.t.run(async ctx=>{
  const ids=[];for(let i=0;i<count;i++)ids.push(await ctx.db.insert('event_rsvp_entries',{eventId,actorHash:`target-actor-${i}`,name:`Target guest ${i}`,email:`target-${i}@example.invalid`,status:'confirmed',revision:1,createdAt:1,updatedAt:1}));
  await ctx.db.insert('event_rsvp_totals',{eventId,confirmed:count,updatedAt:1});return ids;
 });
}
test('RSVP promotion remaps the canonical event reference and transfers settings without source registrations',async()=>{
 const f=await rsvpPromotionFixture(),live=await fixture(),m=f.manifest;
 expect(m.records.map(r=>r.kind).sort()).toEqual(['event','page']);
 expect(JSON.stringify(m)).not.toContain('source-private');
 expect(m.dependencies.some(d=>d.kind==='plugin'&&d.key.includes('formsEnabled'))).toBe(true);
 const disabled=await live.authed.mutation(fn('dryRun'),{manifest:m,...bindings});expect(disabled.ready).toBe(false);
 await enableRsvpForms(live);
 const review=await live.authed.mutation(fn('dryRun'),{manifest:m,...bindings});expect(review.issues).toEqual([]);expect(review.ready).toBe(true);
 await live.authed.mutation(fn('apply'),{receiptId:review.receiptId,expectedDigest:review.digest,confirmLive:true});
 const saved=await live.t.run(async ctx=>({event:await ctx.db.query('extension_events').unique(),page:await ctx.db.query('posts').unique(),entries:await ctx.db.query('event_rsvp_entries').take(5),totals:await ctx.db.query('event_rsvp_totals').take(5),operations:await ctx.db.query('event_rsvp_operations').take(5),rate:await ctx.db.query('event_rsvp_rate_limits').take(5)}));
 expect(saved.event!.rsvp).toEqual(m.records.find(r=>r.kind==='event')!.data.rsvp);
 expect(saved.page!.blocks).toEqual([{id:'rsvp-block',name:'core/event-rsvp',version:1,attrs:{event:saved.event!._id}}]);
 expect(saved.entries).toEqual([]);expect(saved.totals).toEqual([]);expect(saved.operations).toEqual([]);expect(saved.rate).toEqual([]);
});
test('RSVP capacity checks protect review and apply from new target registrations without exporting private state',async()=>{
 const {manifest:m}=await rsvpPromotionFixture(),live=await fixture();
 m.records=m.records.filter(r=>r.kind==='event');m.selection.pageIds=[];m.records[0].data.rsvp={mode:'guests',capacity:1,closesAt:null};
 const event=await createRsvpTarget(live,m,3),before=await live.t.run(ctx=>ctx.db.get(event));
 const review=await live.authed.mutation(fn('dryRun'),{manifest:m,...bindings});expect(review.ready).toBe(true);
 await seedTargetAttendees(live,event,2);
 await expect(live.authed.mutation(fn('apply'),{receiptId:review.receiptId,expectedDigest:review.digest,confirmLive:true})).rejects.toThrow();
 expect(await live.t.run(ctx=>ctx.db.get(event))).toEqual(before);
 const fresh=await live.authed.mutation(fn('dryRun'),{manifest:m,...bindings});expect(fresh.ready).toBe(false);expect(fresh.issues.some((i:{code:string})=>i.code==='PROMOTION_EVENT_CAPACITY')).toBe(true);
 expect(JSON.stringify(fresh)).not.toContain('target-0@example.invalid');
});
test('RSVP rollback refuses a smaller capacity after new bookings and preserves target registrations when allowed',async()=>{
 const {manifest:m}=await rsvpPromotionFixture(),live=await fixture();m.records=m.records.filter(r=>r.kind==='event');m.selection.pageIds=[];
 const event=await createRsvpTarget(live,m,1),before=await live.t.run(ctx=>ctx.db.get(event));
 const review=await live.authed.mutation(fn('dryRun'),{manifest:m,...bindings});expect(review.ready).toBe(true);
 const args={receiptId:review.receiptId,expectedDigest:review.digest,confirmLive:true};await live.authed.mutation(fn('apply'),args);
 const entries=await seedTargetAttendees(live,event,2),after=await live.t.run(ctx=>ctx.db.get(event));
 await expect(live.authed.mutation(fn('rollback'),args)).rejects.toThrow('target\'s confirmed registrations');expect(await live.t.run(ctx=>ctx.db.get(event))).toEqual(after);
 await live.t.run(async ctx=>{await ctx.db.patch(entries[1],{status:'cancelled',revision:2});const total=(await ctx.db.query('event_rsvp_totals').unique())!;await ctx.db.patch(total._id,{confirmed:1});});
 const attendance=await live.t.run(ctx=>ctx.db.query('event_rsvp_entries').take(5));
 await live.authed.mutation(fn('rollback'),args);expect((await live.t.run(ctx=>ctx.db.get(event)))!.rsvp).toEqual(before!.rsvp);
 expect(await live.t.run(ctx=>ctx.db.query('event_rsvp_entries').take(5))).toEqual(attendance);expect((await live.t.run(ctx=>ctx.db.query('event_rsvp_totals').unique()))!.confirmed).toBe(1);
});
test('RSVP promotion rejects invalid event settings and preserves target settings from older manifests',async()=>{
 const {manifest:m}=await rsvpPromotionFixture(),live=await fixture();m.records=m.records.filter(r=>r.kind==='event');m.selection.pageIds=[];const event=await createRsvpTarget(live,m,5);
 for(const change of [{rsvp:{mode:'guests',capacity:3,closesAt:Number(m.records[0].data.startsAt)+1}},{registrationUrl:'https://example.invalid/register'},{timeZone:'Invalid/Zone'},{endsAt:Number(m.records[0].data.startsAt)-1}]){
  const bad=structuredClone(m);Object.assign(bad.records[0].data,change);expect((await live.authed.mutation(fn('dryRun'),{manifest:bad,...bindings})).ready).toBe(false);
 }
 const old=structuredClone(m);delete old.records[0].data.rsvp;old.records[0].data.title='An old client edits the title';
 const review=await live.authed.mutation(fn('dryRun'),{manifest:old,...bindings});expect(review.ready).toBe(true);
 await live.authed.mutation(fn('apply'),{receiptId:review.receiptId,expectedDigest:review.digest,confirmLive:true});
 expect((await live.t.run(ctx=>ctx.db.get(event)))!.rsvp).toEqual({mode:'guests',capacity:5,closesAt:null});
});

async function localeFixture() {
 const f=await fixture();
 await f.t.run(async ctx=>{const user=await ctx.db.get(f.userId);const role=await ctx.db.get(user!.roleId!);await ctx.db.patch(role!._id,{capabilities:[...role!.capabilities,'settings.update_general']});});
 return f;
}
function localeManifest():ContentPromotionManifest {
 const m=manifest();m.selection={...m.selection,includeLocalization:true};
 const first=m.records[0]!;
 m.records=['en','es'].map(code=>({...structuredClone(first),key:`page:${code}`,data:{...structuredClone(first.data),title:code,slug:code,path:`/${code}`,blocks:[]}}));
 m.records.push({key:'localeRouting:site',kind:'localeRouting',sourceRevision:'routing-1',data:{key:'site',enabled:true,locales:[{code:'en',label:'English',direction:'ltr',landingPageId:'@promotion:page:en'},{code:'es',label:'Español',direction:'ltr',landingPageId:'@promotion:page:es'}]}},
 {key:'localeGroup:guide',kind:'localeGroup',sourceRevision:'group-1',data:{key:'guide',translations:[{code:'en',documentId:'@promotion:page:en'},{code:'es',documentId:'@promotion:page:es'}]}});
 return m;
}
test('locale promotion remaps routing and group documents, removes obsolete entries and restores semantic content with fresh revisions',async()=>{
 const f=await localeFixture(),m=localeManifest();
 const a=await f.authed.mutation(fn('dryRun'),{manifest:m,...bindings});expect(a.issues).toEqual([]);
 const applied=await f.authed.mutation(fn('apply'),{receiptId:a.receiptId,expectedDigest:a.digest,confirmLive:true});
 const rows=await f.t.run(async ctx=>({routing:await ctx.db.query('locale_routing').unique(),group:await ctx.db.query('locale_translation_groups').unique(),entries:await ctx.db.query('locale_translations').collect()}));
 expect(rows.routing!.locales.map(l=>String(l.landingPageId))).toEqual(['en','es'].map(code=>applied.mappings.find((r:any)=>r.key===`page:${code}`).targetId));
 expect(rows.entries).toHaveLength(2);expect(rows.group!.revision).toBe(1);
 const reduced=structuredClone(m);reduced.records.find(r=>r.kind==='localeGroup')!.data.translations=[];
 const b=await f.authed.mutation(fn('dryRun'),{manifest:reduced,...bindings});expect(b.issues).toEqual([]);
 await f.authed.mutation(fn('apply'),{receiptId:b.receiptId,expectedDigest:b.digest,confirmLive:true});expect(await f.t.run(ctx=>ctx.db.query('locale_translations').collect())).toEqual([]);
 await f.authed.mutation(fn('rollback'),{receiptId:b.receiptId,expectedDigest:b.digest,confirmLive:true});
 const restored=await f.t.run(async ctx=>({routing:await ctx.db.get(rows.routing!._id),group:await ctx.db.get(rows.group!._id),entries:await ctx.db.query('locale_translations').collect()}));
 expect(restored.routing!.locales).toEqual(rows.routing!.locales);expect(restored.routing!.revision).toBe(3);expect(restored.group!.revision).toBe(3);expect(restored.entries.map(r=>({code:r.code,documentId:r.documentId}))).toEqual(rows.entries.map(r=>({code:r.code,documentId:r.documentId})));
});
test('locale promotion binds child assignments and unrelated target context into the review conflict',async()=>{
 const f=await localeFixture(),m=localeManifest();
 const a=await f.authed.mutation(fn('dryRun'),{manifest:m,...bindings});expect(a.issues).toEqual([]);await f.authed.mutation(fn('apply'),{receiptId:a.receiptId,expectedDigest:a.digest,confirmLive:true});
 const b=await f.authed.mutation(fn('dryRun'),{manifest:m,...bindings});
 await f.t.run(async ctx=>{const entry=await ctx.db.query('locale_translations').first();await ctx.db.patch(entry!._id,{code:'fr'});});
 await expect(f.authed.mutation(fn('apply'),{receiptId:b.receiptId,expectedDigest:b.digest,confirmLive:true})).rejects.toThrow('PROMOTION_CONFLICT');
});
test('locale promotion rejects omitted consent, forged references and duplicate locale identities',async()=>{
 const f=await localeFixture();
 for(const mutate of [
  (m:ContentPromotionManifest)=>{m.selection.includeLocalization=false;},
  (m:ContentPromotionManifest)=>{m.records.find(r=>r.kind==='localeRouting')!.data.locales=[{code:'en',label:'English',direction:'ltr',landingPageId:'raw-id'}];},
  (m:ContentPromotionManifest)=>{m.records.find(r=>r.kind==='localeGroup')!.data.translations=[{code:'en',documentId:'@promotion:page:en'},{code:'en',documentId:'@promotion:page:es'}];},
 ]){const m=localeManifest();mutate(m);await expect(f.authed.mutation(fn('dryRun'),{manifest:m,...bindings})).rejects.toThrow();}
});
test('locale export requires explicit selection and carries configured landings and complete selected translation groups',async()=>{
 const f=await localeFixture();
 const ids=await f.t.run(async ctx=>{
  const identity=await ctx.db.query('convexpress_siteIdentity').unique();await ctx.db.patch(identity!._id,manifest().source);
  const pages=[];for(const code of ['en','es','ar'])pages.push(await ctx.db.insert('posts',{type:'page',title:code,slug:code,path:`/${code}`,status:'publish',visibility:'public',content:'',contentMode:'blocks',blocksVersion:2,blocksRevision:1,blocks:[{id:'language',name:'core/language-switcher',version:1,attrs:{}}],authorId:f.userId,commentStatus:'closed',createdAt:1,updatedAt:1}));
  await ctx.db.insert('locale_routing',{key:'site',enabled:true,locales:['en','es','ar'].map((code,i)=>({code,label:code,direction:code==='ar'?'rtl' as const:'ltr' as const,landingPageId:pages[i]!})),revision:1,updatedBy:f.userId,updatedAt:1});
  const group=await ctx.db.insert('locale_translation_groups',{key:'guide',revision:1,updatedBy:f.userId,updatedAt:1});
  for(const [i,code] of ['en','es'].entries())await ctx.db.insert('locale_translations',{groupId:group,code,documentId:pages[i]!});
  return {pages};
 });
 const args={target,selection:{...manifest().selection,pageIds:[ids.pages[0]!]}},exportFn=makeFunctionReference<'query'>('contentPromotion/operations:exportManifest');
 await expect(f.authed.query(exportFn,args)).rejects.toThrow('LOCALIZATION_SELECTION_REQUIRED');
 const exported=await f.authed.query(exportFn,{...args,selection:{...args.selection,includeLocalization:true}});
 expect(exported.manifest.records.filter((r:any)=>r.kind==='page')).toHaveLength(3);expect(exported.manifest.records.filter((r:any)=>r.kind==='localeRouting')).toHaveLength(1);expect(exported.manifest.records.find((r:any)=>r.kind==='localeGroup').data.translations).toHaveLength(2);
});

test('locale promotion requires normal language authority and binds configuration changes after review',async()=>{
 const limited=await fixture();await expect(limited.authed.mutation(fn('dryRun'),{manifest:localeManifest(),...bindings})).rejects.toThrow();
 const f=await localeFixture(),m=localeManifest();let a=await f.authed.mutation(fn('dryRun'),{manifest:m,...bindings});await f.authed.mutation(fn('apply'),{receiptId:a.receiptId,expectedDigest:a.digest,confirmLive:true});
 a=await f.authed.mutation(fn('dryRun'),{manifest:m,...bindings});
 await f.t.run(async ctx=>{const row=await ctx.db.query('locale_routing').unique();await ctx.db.patch(row!._id,{enabled:false,revision:row!.revision+1});});
 await expect(f.authed.mutation(fn('apply'),{receiptId:a.receiptId,expectedDigest:a.digest,confirmLive:true})).rejects.toThrow('PROMOTION_CONFLICT');
 expect((await f.t.run(ctx=>ctx.db.query('locale_routing').unique()))!.enabled).toBe(false);
});
test('locale promotion preserves unrelated groups and detects new assignments or incompatible language settings',async()=>{
 const f=await localeFixture(),m=localeManifest();let a=await f.authed.mutation(fn('dryRun'),{manifest:m,...bindings});await f.authed.mutation(fn('apply'),{receiptId:a.receiptId,expectedDigest:a.digest,confirmLive:true});
 const unrelated=await f.t.run(async ctx=>{
  const page=await ctx.db.insert('posts',{type:'page',title:'Independent',slug:'independent',status:'publish',visibility:'public',content:'',authorId:f.userId,commentStatus:'closed',createdAt:1,updatedAt:1});
  const group=await ctx.db.insert('locale_translation_groups',{key:'independent',revision:1,updatedBy:f.userId,updatedAt:1});
  await ctx.db.insert('locale_translations',{groupId:group,documentId:page,code:'en'});return {page,group};
 });
 const before=await f.t.run(async ctx=>({group:await ctx.db.get(unrelated.group),entries:await ctx.db.query('locale_translations').withIndex('by_group',q=>q.eq('groupId',unrelated.group)).collect()}));
 a=await f.authed.mutation(fn('dryRun'),{manifest:m,...bindings});expect(a.issues).toEqual([]);await f.authed.mutation(fn('apply'),{receiptId:a.receiptId,expectedDigest:a.digest,confirmLive:true});
 expect(await f.t.run(async ctx=>({group:await ctx.db.get(unrelated.group),entries:await ctx.db.query('locale_translations').withIndex('by_group',q=>q.eq('groupId',unrelated.group)).collect()}))).toEqual(before);
 a=await f.authed.mutation(fn('dryRun'),{manifest:m,...bindings});
 await f.t.run(ctx=>ctx.db.insert('locale_translation_groups',{key:'new-empty',revision:1,updatedBy:f.userId,updatedAt:1}));
 await expect(f.authed.mutation(fn('apply'),{receiptId:a.receiptId,expectedDigest:a.digest,confirmLive:true})).rejects.toThrow('PROMOTION_CONFLICT');
 const removal=structuredClone(m);removal.records.find(r=>r.kind==='localeRouting')!.data={key:'site',enabled:false,locales:[]};removal.records.find(r=>r.kind==='localeGroup')!.data.translations=[];
 const review=await f.authed.mutation(fn('dryRun'),{manifest:removal,...bindings});expect(review.ready).toBe(false);expect(review.issues.map((i:any)=>i.code)).toContain('PROMOTION_LOCALE_NOT_CONFIGURED');
});
test('locale rollback detects child-only writes and never silently restores over another group assignment',async()=>{
 const f=await localeFixture(),m=localeManifest();let a=await f.authed.mutation(fn('dryRun'),{manifest:m,...bindings});await f.authed.mutation(fn('apply'),{receiptId:a.receiptId,expectedDigest:a.digest,confirmLive:true});
 a=await f.authed.mutation(fn('dryRun'),{manifest:m,...bindings});await f.authed.mutation(fn('apply'),{receiptId:a.receiptId,expectedDigest:a.digest,confirmLive:true});
 await f.t.run(async ctx=>{const entry=await ctx.db.query('locale_translations').first();await ctx.db.delete(entry!._id);});
 await expect(f.authed.mutation(fn('rollback'),{receiptId:a.receiptId,expectedDigest:a.digest,confirmLive:true})).rejects.toThrow('PROMOTION_ROLLBACK_CONFLICT');
});
test('locale manifest rejects cross-group duplicate documents, unconfigured languages and mixed document types',async()=>{
 const f=await localeFixture();
 for(const mutate of [
  (m:ContentPromotionManifest)=>{m.records.push({...structuredClone(m.records.find(r=>r.kind==='localeGroup')!),key:'localeGroup:other',data:{key:'other',translations:[{code:'en',documentId:'@promotion:page:en'}]}});},
  (m:ContentPromotionManifest)=>{m.records.find(r=>r.kind==='localeGroup')!.data.translations=[{code:'fr',documentId:'@promotion:page:en'}];},
  (m:ContentPromotionManifest)=>{const p=structuredClone(m.records[0]!);p.key='post:entry';p.kind='post';p.data.slug='entry';p.data.blocks=[];m.records.push(p);m.records.find(r=>r.kind==='localeGroup')!.data.translations=[{code:'en',documentId:'@promotion:page:en'},{code:'es',documentId:'@promotion:post:entry'}];},
 ]){const m=localeManifest();mutate(m);await expect(f.authed.mutation(fn('dryRun'),{manifest:m,...bindings})).rejects.toThrow();}
});
test('locale export includes explicitly selected empty groups and disabled routing without inventing source settings',async()=>{
 const f=await localeFixture();await f.t.run(async ctx=>{const identity=await ctx.db.query('convexpress_siteIdentity').unique();await ctx.db.patch(identity!._id,manifest().source);await ctx.db.insert('locale_translation_groups',{key:'removed-guide',revision:3,updatedBy:f.userId,updatedAt:1});});
 const exported=await f.authed.query(makeFunctionReference<'query'>('contentPromotion/operations:exportManifest'),{target,selection:{...manifest().selection,pageIds:[],includeLocalization:true,localeGroupKeys:['removed-guide']}});
 expect(exported.manifest.records.map((r:any)=>r.kind)).toEqual(['localeRouting','localeGroup']);expect(exported.manifest.records[0].data).toEqual({key:'site',enabled:false,locales:[]});expect(exported.manifest.records[1].data.translations).toEqual([]);
 expect(await f.t.run(ctx=>ctx.db.query('locale_routing').unique())).toBeNull();
});


test("template presentation writes share nested-shape and size refusal without target changes", async () => {
 const f = await fixture();
 await f.t.run(async ctx => {
  const user = await ctx.db.get(f.userId); const role = await ctx.db.get(user!.roleId!);
  await ctx.db.patch(role!._id, {capabilities:[...role!.capabilities,"settings.import"]});
 });
 const baseline = await f.authed.query(makeFunctionReference<"query">("settings/templateDrafts:snapshot"), {});
 const malformed = [
  {Core:{colors:{primary:"#123456"}}},
  {core:[]},
  {core:{"menu.layout":{}}},
  {core:{menuLayout:[]}},
  {core:{footer:{copyrightText:"x".repeat(250_000)}}},
 ];
 for (const settings of malformed) {
  const values = {...baseline.values,settings};
  const m = manifest(); m.selection.includePresentation = true;
  m.records.push({key:"template",kind:"presentation",sourceRevision:"1",data:{section:"appearance.template",values}});
  await expect(f.authed.mutation(fn("dryRun"), {manifest:m,...bindings})).rejects.toThrow();
  await expect(f.authed.mutation(makeFunctionReference<"mutation">("settings/mutations:updateSection"), {section:"appearance.template",values:{settings}})).rejects.toThrow();
  await expect(f.authed.mutation(makeFunctionReference<"mutation">("settings/mutations:importAll"), {data:{settings:{"appearance.template":values}}})).rejects.toThrow();
  await expect(f.authed.mutation(makeFunctionReference<"mutation">("settings/templateDrafts:publish"), {values,expectedRevision:baseline.revision,confirmLive:true})).rejects.toThrow();
  expect(await f.authed.query(makeFunctionReference<"query">("settings/templateDrafts:snapshot"), {})).toEqual(baseline);
 }
 expect(await f.t.run(ctx=>ctx.db.query("appearance_drafts").collect())).toHaveLength(0);
 expect(await f.t.run(ctx=>ctx.db.query("posts").collect())).toHaveLength(0);
});

test("template generic partial updates preserve valid camelCase modules and other packs", async () => {
 const f=await fixture();
 const values={active:"core",overrides:{},variants:{},settings:{core:{menuLayout:{primary:"footer-1"}},"aster-house":{colors:{primary:"#123456"}}}};
 await f.authed.mutation(makeFunctionReference<"mutation">("settings/mutations:updateSection"), {section:"appearance.template",values});
 await f.authed.mutation(makeFunctionReference<"mutation">("settings/mutations:updateSection"), {section:"appearance.template",values:{active:"aster-house"}});
 const result=await f.authed.query(makeFunctionReference<"query">("settings/templateDrafts:snapshot"), {});
 expect(result.values).toEqual({...values,active:"aster-house"});
 const m=manifest();m.selection.includePresentation=true;m.records.push({key:"template",kind:"presentation",sourceRevision:"1",data:{section:"appearance.template",values:result.values}});
 const {validateManifest}=await import("../shared");expect(validateManifest(m).records).toHaveLength(2);
});

test("appearance-only promotion remaps footer media and preserves unrelated live settings", async () => {
 const src = await canonicalMediaSource(), destination = await fixture();
 const snapshotRef = makeFunctionReference<"query">("settings/templateDrafts:snapshot");
 const publishRef = makeFunctionReference<"mutation">("settings/templateDrafts:publish");
 await src.source.t.run(async ctx => {
  await ctx.db.insert("settings", {section:"reading",values:{homepageDisplays:"latest_posts",postsPerPage:9},updatedAt:1,updatedBy:src.source.userId});
  await ctx.db.insert("membership_restriction_rules",{resourceType:"route",resourceIdOrKey:"/members/*",ruleMode:"allow_only",planIds:[],teaserMode:"hide",loginRequired:true,createdAt:1,updatedAt:1});
 });
 const sourceBefore = await src.source.authed.query(snapshotRef, {});
 const values = { ...sourceBefore.values, settings: { core: { footer: { rows: [{ id: "image-row", background: "default", padding: "normal", container: "default", columns: [{ id: "image-cell", cell: { type: "image", mediaId: src.ids.mediaId, alt: "Staging footer image", width: 120 } }] }] } } } };
 const published = await src.source.authed.mutation(publishRef, {values, expectedRevision: sourceBefore.revision});
 const liveBefore = await destination.authed.query(snapshotRef, {});
 // The previous Customizer shortcut cannot copy site-local media IDs.
 await expect(destination.authed.mutation(publishRef, {values, expectedRevision: liveBefore.revision, confirmLive: true, source: {...published.identity, revision: published.revision}})).rejects.toMatchObject({data:expect.objectContaining({code:"MEDIA_UNAVAILABLE"})});
 expect(await destination.authed.query(snapshotRef, {})).toEqual(liveBefore);
 const exported = await src.source.authed.query(makeFunctionReference<"query">("contentPromotion/operations:exportManifest"), {target, selection: {...manifest().selection, pageIds: [], includeAppearance: true}});
 await expect(src.source.authed.query(makeFunctionReference<"query">("contentPromotion/operations:exportManifest"), {target, selection: {...manifest().selection, pageIds: [src.ids.pageId], includeAppearance: true}})).rejects.toMatchObject({data:expect.objectContaining({code:"ROUTE_POLICY_SELECTION_REQUIRED"})});
 const full = await src.source.authed.query(makeFunctionReference<"query">("contentPromotion/operations:exportManifest"), {target, selection: {...manifest().selection, pageIds: [], includePresentation: true, includeAppearance: true, includeRoutePolicies: true}});
 expect(full.manifest.records.filter((r:any)=>r.kind === "presentation").map((r:any)=>r.data.section).sort()).toEqual(["appearance.template","general","reading"]);
 expect(exported.manifest.records.filter((r:any)=>r.kind === "presentation").map((r:any)=>r.data.section)).toEqual(["appearance.template"]);
 expect(exported.manifest.records.map((r:any)=>r.kind).sort()).toEqual(["media","presentation"]);
 const appearance = exported.manifest.records.find((r:any)=>r.kind === "presentation")!;
 expect((appearance.data.values as any).settings.core.footer.rows[0].columns[0].cell.mediaId).toBe(`@promotion:${src.mediaKey}`);
 const preserved = () => destination.t.run(async ctx=>({general:await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","general")).unique(),posts:await ctx.db.query("posts").collect(),menus:await ctx.db.query("menuLocations").collect()}));
 const before = await preserved();
 const storageId = await destination.t.run(ctx=>ctx.storage.store(src.bytes));
 const review = await destination.authed.mutation(fn("dryRun"), {manifest:exported.manifest, mediaBindings:[{key:src.mediaKey,storageId}], dependencyBindings:[]});
 expect(review.ready).toBe(true);
 await destination.authed.mutation(fn("apply"), receiptArgs(review));
 const live = await destination.authed.query(snapshotRef, {});
 const media = await destination.t.run(ctx=>ctx.db.query("media").unique());
 expect(live.values.settings.core.footer.rows[0].columns[0].cell.mediaId).toBe(media!._id);
 expect(media!._id).not.toBe(src.ids.mediaId); expect(media!.storageId).toBe(storageId);
 expect(await preserved()).toEqual(before);
 expect(await src.source.authed.query(snapshotRef, {})).toEqual(published);
});

test("footer audience promotion resolves only one active target-owned list and copies no audience records",async()=>{
 const source=await fixture(),destination=await fixture();
 const fields={name:"Journal letters",description:"Local audience",consentText:"Source wording",privacyUrl:"/privacy",status:"active" as const,revision:1,createdAt:1,updatedAt:1};
 const sourceList=await source.t.run(async ctx=>{const site=(await ctx.db.query("convexpress_siteIdentity").unique())!;await ctx.db.patch(site._id,manifest().source);const id=await ctx.db.insert("mailingLists",{...fields,websiteKey:"site",instanceKey:"site:staging",createdBy:source.userId,updatedBy:source.userId});await ctx.db.insert("settings",{section:"appearance.template",values:{active:"journal",overrides:{},variants:{},settings:{journal:{footer:{rows:[{id:"r",columns:[{id:"c",cell:{type:"newsletter",buttonText:"Subscribe",audienceId:id}}]}]}}}},updatedAt:1,updatedBy:source.userId,legacyAppearanceMigration:{version:2,migratedAt:1}});return id;});
 const exported=await source.authed.query(makeFunctionReference<"query">("contentPromotion/operations:exportManifest"),{target,selection:{...manifest().selection,pageIds:[],includeAppearance:true}});
 const m=exported.manifest as ContentPromotionManifest;expect(m.dependencies).toContainEqual(expect.objectContaining({kind:"mailingList",sourceId:sourceList,slug:fields.name}));expect(m.records).toHaveLength(1);
 const missing=await destination.authed.mutation(fn("dryRun"),{manifest:m,...bindings});expect(missing.ready).toBe(false);
 const targetList=await destination.t.run(ctx=>ctx.db.insert("mailingLists",{...fields,consentText:"Target wording",websiteKey:"site",instanceKey:"site:live",createdBy:destination.userId,updatedBy:destination.userId}));
 const review=await destination.authed.mutation(fn("dryRun"),{manifest:m,...bindings});if(!review.ready)throw Error(JSON.stringify(review.issues));expect(review.ready).toBe(true);
 await destination.t.run(ctx=>ctx.db.patch("mailingLists",targetList,{status:"archived"}));await expect(destination.authed.mutation(fn("apply"),receiptArgs(review))).rejects.toThrow();
 await destination.t.run(ctx=>ctx.db.patch("mailingLists",targetList,{status:"active",revision:2}));
 const fresh=await destination.authed.mutation(fn("dryRun"),{manifest:m,...bindings});expect(fresh.ready).toBe(true);await destination.authed.mutation(fn("apply"),receiptArgs(fresh));
 const saved=await destination.t.run(ctx=>ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","appearance.template")).unique());expect((saved!.values as any).settings.journal.footer.rows[0].columns[0].cell.audienceId).toBe(targetList);
 expect((await destination.t.run(ctx=>ctx.db.get("mailingLists",targetList)))!.consentText).toBe("Target wording");for(const table of ["mailingListSubscribers","mailingListConsentEvents"] as const)expect(await destination.t.run(ctx=>ctx.db.query(table).take(1))).toEqual([]);
 await destination.t.run(ctx=>ctx.db.insert("mailingLists",{...fields,websiteKey:"site",instanceKey:"site:live",createdBy:destination.userId,updatedBy:destination.userId}));expect((await destination.authed.mutation(fn("dryRun"),{manifest:m,...bindings})).ready).toBe(false);
});
