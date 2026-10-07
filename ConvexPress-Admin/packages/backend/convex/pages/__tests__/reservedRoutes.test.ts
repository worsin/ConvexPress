import { expect, test as bunTest } from 'bun:test';
import type { Id } from '../../_generated/dataModel';
const test=(name:string,run:()=>unknown)=>bunTest(name,async()=>{const previous=process.env.AUTH_ISSUER_URL;process.env.AUTH_ISSUER_URL='https://route-fixture.convex.site';try{await run();}finally{if(previous===undefined)delete process.env.AUTH_ISSUER_URL;else process.env.AUTH_ISSUER_URL=previous;}});
import { makeFunctionReference } from 'convex/server';
import { convexTest } from 'convex-test';
import { api, internal } from '../../_generated/api';
import schema from '../../schema';
import { reservedPageRoute } from '../../helpers/pageRoutePolicy';
const modules = {
  './convex/canonicalDocuments.ts': () => import('../../canonicalDocuments'),
  './convex/pages/internals.ts': () => import('../internals'),
  './convex/_generated/server.js': () => import('../../_generated/server.js'),
  './convex/pages/mutations.ts': () => import('../mutations'),
  './convex/pages/httpInternals.ts': () => import('../httpInternals'),
  './convex/taxonomies/counts.ts': () => import('../../taxonomies/counts'),
  './convex/taxonomies/internals.ts': () => import('../../taxonomies/internals'),
  './convex/taxonomies/mutations.ts': () => import('../../taxonomies/mutations'),
  './convex/revisions/internals.ts': () => import('../../revisions/internals'),
};
async function fixture() {
  const t = convexTest({schema,modules});
  const authorId = await t.run(async ctx => {
    const roleId = await ctx.db.insert('roles', {name:'Editor',slug:'editor',description:'Fixture',level:80,type:'internal',status:'active',isDefault:false,isProtected:true,capabilities:['page.create','page.update','page.publish','page.set_parent','page.reorder','page.delete','taxonomy.delete_category'],pageAccess:[],createdAt:1,updatedAt:1});
    return ctx.db.insert('users',{email:'editor@example.test',emailVerified:true,status:'active',authSource:'local',internalRole:'administrator',roleId,createdAt:1,updatedAt:1});
  });
  const editor = t.withIdentity({subject:authorId,issuer:'https://convexpress-admin.local'});
  const keyId=await t.run(async ctx=>{
    await ctx.db.insert('convexpress_siteIdentity',{identityKey:'site-identity',websiteKey:'fixture',instanceKey:'fixture-stage',environmentKind:'staging',deploymentOrigin:'https://fixture.convex.cloud',managementOrigin:'https://fixture.convex.site',siteOrigin:'https://fixture.example.invalid',siteContractVersion:'1',schemaVersion:'1',engineVersion:'1',managementCapabilities:[],initializedAt:1,updatedAt:1});
    await ctx.db.insert('settings',{section:'plugins',values:{membershipEnabled:false},updatedAt:1,updatedBy:authorId});
    await ctx.db.insert('settings',{section:'appearance.template',values:{active:'core',overrides:{},variants:{},settings:{}},legacyAppearanceMigration:{version:2,migratedAt:1},updatedAt:1,updatedBy:authorId});
    return ctx.db.insert('apiKeys',{name:'Canonical route fixture',keyPrefix:'fixture',keyHash:'fixture',userId:authorId,environmentBinding:process.env.AUTH_ISSUER_URL,scopes:['write:posts'],status:'active',rateLimitPerMinute:60,rateLimitPerHour:1000,requestCount:0,createdAt:1,updatedAt:1});
  });
  const createPage=(args:{title:string;slug?:string;parentId?:Id<'posts'>})=>t.mutation(internal.pages.httpInternals.createInternal,{...args,keyId});
  return {t,editor,authorId,createPage};
}
test('page creation permits four descendant levels with exact depths and rejects a fifth', async () => {
  const {t,editor,createPage}=await fixture();
  let parentId;
  for(let depth=0;depth<=4;depth++) {
    const pageId=await createPage({title:`Level ${depth}`,slug:`level-${depth}`,parentId});
    expect((await t.run(ctx=>ctx.db.get('posts',pageId)))?.depth).toBe(depth);
    parentId=pageId;
  }
  await expect(createPage({title:'Too deep',slug:'too-deep',parentId})).rejects.toThrow('hierarchy exceeds');
  expect((await t.run(ctx=>ctx.db.query('posts').collect())).length).toBe(5);
});

test('page parent changes keep depths consistent with recomputation and retain the subtree limit', async () => {
  const {t,editor,createPage}=await fixture();
  const root=await createPage({title:'Root',slug:'root'});
  const child=await createPage({title:'Child',slug:'child'});
  const leaf=await createPage({title:'Leaf',slug:'leaf',parentId:child});
  await editor.mutation(api.pages.mutations.setParent,{pageId:child,parentId:root});
  expect((await t.run(ctx=>ctx.db.get('posts',child)))?.depth).toBe(1);
  expect((await t.run(ctx=>ctx.db.get('posts',leaf)))?.depth).toBe(2);
  await editor.mutation(api.pages.mutations.setParent,{pageId:child});
  expect((await t.run(ctx=>ctx.db.get('posts',leaf)))?.depth).toBe(1);
  await editor.mutation(api.canonicalDocuments.updateMetadata,{postId:child,expectedRevision:(await t.run(ctx=>ctx.db.get(child)))!.blocksRevision!,parentId:root});
  expect((await t.run(ctx=>ctx.db.get('posts',child)))?.depth).toBe(1);
  expect((await t.run(ctx=>ctx.db.get('posts',leaf)))?.path).toBe('/root/child/leaf');
  let deepParent=root;
  for(let depth=1;depth<=3;depth++) deepParent=await createPage({title:`Branch ${depth}`,slug:`branch-${depth}`,parentId:deepParent});
  await expect(editor.mutation(api.pages.mutations.setParent,{pageId:child,parentId:deepParent})).rejects.toThrow('Maximum page nesting depth');
  expect((await t.run(ctx=>ctx.db.get('posts',leaf)))?.path).toBe('/root/child/leaf');
});

test('drag reorder and deletion reparenting store the actual child depth', async () => {
  const {t,editor,createPage}=await fixture();
  const root=await createPage({title:'Root',slug:'root'});
  const child=await createPage({title:'Child',slug:'child'});
  const leaf=await createPage({title:'Leaf',slug:'leaf',parentId:child});
  await editor.mutation(api.pages.mutations.reorder,{items:[{pageId:child,parentId:root,menuOrder:0}]});
  expect((await t.run(ctx=>ctx.db.get('posts',child)))?.depth).toBe(1);
  expect((await t.run(ctx=>ctx.db.get('posts',leaf)))?.depth).toBe(2);
  // A trashed intermediary can still have children when removed permanently.
  await t.run(ctx=>ctx.db.patch('posts',child,{status:'trash'}));
  await editor.mutation(api.pages.mutations.permanentDelete,{pageId:child});
  const remaining=await t.run(ctx=>ctx.db.get('posts',leaf));
  expect(remaining?.parentId).toBe(root);
  expect(remaining?.depth).toBe(1);
  expect(remaining?.path).toBe('/root/leaf');
});
test('route policy distinguishes exact URLs, dynamic segments, splats and configured dashboard paths', () => {
  expect(reservedPageRoute('/products')).toBe('/products');
  expect(reservedPageRoute('/document-preview')).toBe('/document-preview');
  expect(reservedPageRoute('/document-preview-story')).toBeNull();
  expect(reservedPageRoute('/products/field-kit')).toBe('/products/$slug');
  expect(reservedPageRoute('/api/downloads/receipt')).toBe('/api/downloads/$leaseId');
  expect(reservedPageRoute('/api/lead-magnets/receipt')).toBe('/api/lead-magnets/$leaseId');
  expect(reservedPageRoute('/api/public-files/portrait')).toBe('/api/public-files/$storageId');
  expect(reservedPageRoute('/api/public-files-story')).toBeNull();
  expect(reservedPageRoute('/api/download-story')).toBeNull();
  expect(reservedPageRoute('/product-story')).toBeNull();
  expect(reservedPageRoute('/account')).toBeNull();
  expect(reservedPageRoute('/account/courses')).toBe('/account/courses');
  expect(reservedPageRoute('/members/events','/members')).toBe('/members');
  expect(reservedPageRoute('/page/about/team')).toBe('/page/$');
});
test('canonical HTTP create rejects reserved routes', async () => {
  const {t,editor,authorId,createPage}=await fixture();
  await t.run(ctx=>ctx.db.insert('posts',{type:'page',title:'Legacy',slug:'products',path:'/products',status:'draft',visibility:'public',authorId,commentStatus:'closed',createdAt:1,updatedAt:1}));
  await expect(createPage({title:'Products',slug:'products'})).rejects.toThrow('built-in website route');
  await expect(createPage({title:'Private preview collision',slug:'document-preview'})).rejects.toThrow('built-in website route');
  expect((await t.run(ctx=>ctx.db.query('posts').collect())).length).toBe(1);
});
test('existing canonical route collision permits title edits but a rename into a reserved route is rejected', async () => {
  const {t,editor,authorId,createPage}=await fixture();
  const pageId=await createPage({title:'Existing page',slug:'existing-page'});
  await t.run(ctx=>ctx.db.patch(pageId,{slug:'events',path:'/events'}));
  await editor.mutation(api.canonicalDocuments.updateMetadata,{postId:pageId,expectedRevision:1,title:'Edited existing title'});
  expect((await t.run(ctx=>ctx.db.get(pageId)))?.title).toBe('Edited existing title');
  await expect(editor.mutation(api.canonicalDocuments.updateMetadata,{postId:pageId,expectedRevision:2,slug:'products'})).rejects.toThrow('built-in website route');
});
test('configured dashboard namespace blocks new page creation', async () => {
  const {t,editor,authorId,createPage}=await fixture();
  await t.run(ctx=>ctx.db.insert('settings',{section:'dashboard',values:{basePath:'/members'},updatedAt:1,updatedBy:authorId}));
  await expect(createPage({title:'Members'})).rejects.toThrow('built-in website route');
});

test('reparenting cannot move a descendant into a configured dashboard and leaves the tree intact', async () => {
 const {t,editor,authorId,createPage}=await fixture();
 await t.run(ctx=>ctx.db.insert('settings',{section:'dashboard',values:{basePath:'/new/portal'},updatedAt:1,updatedBy:authorId}));
 const parentId=await createPage({title:'Old',slug:'old'});
 const childId=await createPage({title:'Portal',slug:'portal',parentId});
 await expect(editor.mutation(api.canonicalDocuments.updateMetadata,{postId:parentId,expectedRevision:1,slug:'new'})).rejects.toThrow('built-in website route');
 expect((await t.run(ctx=>ctx.db.get(childId)))?.path).toBe('/old/portal');
 expect((await t.run(ctx=>ctx.db.get(parentId)))?.slug).toBe('old');
});
test('REST internal create follows the same reserved route policy', async () => {
 const {t,authorId}=await fixture();
 const previous=process.env.AUTH_ISSUER_URL;process.env.AUTH_ISSUER_URL='https://fixture.convex.site';
 try {
 const keyId=await t.run(ctx=>ctx.db.insert('apiKeys',{name:'Route fixture',keyPrefix:'fixture',keyHash:'fixture',userId:authorId,environmentBinding:process.env.AUTH_ISSUER_URL,scopes:['write:posts'],status:'active',rateLimitPerMinute:60,rateLimitPerHour:1000,requestCount:0,createdAt:1,updatedAt:1}));
 await expect(t.mutation(internal.pages.httpInternals.createInternal,{title:'Login',slug:'login',keyId})).rejects.toThrow('built-in website route');
 } finally { if(previous===undefined)delete process.env.AUTH_ISSUER_URL;else process.env.AUTH_ISSUER_URL=previous; }
});
test('both explicit reparent and drag reorder reject a new root collision', async () => {
 const {t,editor,authorId,createPage}=await fixture();
 const {childId,reservedParentId}=await t.run(async ctx=>{
  const common={type:'page' as const,status:'auto-draft' as const,visibility:'public' as const,authorId,commentStatus:'closed' as const,createdAt:1,updatedAt:1};
  const parentId=await ctx.db.insert('posts',{...common,title:'Story',slug:'story',path:'/story',depth:0});
  const reservedParentId=await ctx.db.insert('posts',{...common,title:'Legacy Events',slug:'events',path:'/events',depth:0});
  const childId=await ctx.db.insert('posts',{...common,title:'Products',slug:'products',path:'/story/products',parentId,depth:1});
  return {childId,reservedParentId};
 });
 await expect(editor.mutation(api.pages.mutations.setParent,{pageId:childId})).rejects.toThrow('built-in website route');
 await expect(editor.mutation(api.pages.mutations.reorder,{items:[{pageId:childId,parentId:reservedParentId,menuOrder:0}]})).rejects.toThrow('built-in website route');
 expect((await t.run(ctx=>ctx.db.get(childId)))?.path).toBe('/story/products');
});


test('permanent page deletion removes its topic relationships and preserves other pages', async () => {
 const {t,editor,createPage}=await fixture();
 const pageId=await createPage({title:'Related page',slug:'related-page'});
 const sibling=await createPage({title:'Other page',slug:'other-page'});
 const {category,tag,remaining}=await t.run(async ctx=>{
  const category=await ctx.db.insert('terms',{name:'Studio',slug:'studio',taxonomy:'category',count:0,countReady:true,isDefault:false,createdAt:1,updatedAt:1});
  const tag=await ctx.db.insert('terms',{name:'Materials',slug:'materials',taxonomy:'post_tag',count:0,countReady:true,isDefault:false,createdAt:1,updatedAt:1});
  await ctx.db.insert('termRelationships',{postId:pageId,termId:category});
  await ctx.db.insert('termRelationships',{postId:pageId,termId:tag});
  const remaining=await ctx.db.insert('termRelationships',{postId:sibling,termId:category});
  return {category,tag,remaining};
 });
 await editor.mutation(api.pages.mutations.trash,{pageId});
 await editor.mutation(api.pages.mutations.permanentDelete,{pageId});
 expect(await t.run(ctx=>ctx.db.query('termRelationships').withIndex('by_post',q=>q.eq('postId',pageId)).collect())).toEqual([]);
 expect(await t.run(ctx=>ctx.db.get(remaining))).not.toBeNull();
 expect((await t.run(ctx=>ctx.db.get(category)))?.count).toBe(0);
 expect((await t.run(ctx=>ctx.db.get(tag)))?.count).toBe(0);
});

test('category deletion discards orphan relationships while reassigning existing documents', async () => {
 const {t,editor,createPage}=await fixture();
 const missing=await createPage({title:'Missing',slug:'missing'});
 const surviving=await createPage({title:'Surviving',slug:'surviving'});
 const category=await t.run(async ctx=>{
  const id=await ctx.db.insert('terms',{name:'Studio',slug:'studio',taxonomy:'category',count:0,countReady:true,isDefault:false,createdAt:1,updatedAt:1});
  await ctx.db.insert('termRelationships',{postId:missing,termId:id});
  await ctx.db.insert('termRelationships',{postId:surviving,termId:id});
  await ctx.db.delete(missing);
  return id;
 });
 const result=await editor.mutation(api.taxonomies.mutations.deleteCategory,{termId:category});
 expect(result.reassignedPosts).toBe(1);
 expect(await t.run(ctx=>ctx.db.get(category))).toBeNull();
 const relations=await t.run(ctx=>ctx.db.query('termRelationships').collect());
 expect(relations).toHaveLength(1);expect(relations[0]?.postId).toBe(surviving);
 expect((await t.run(ctx=>ctx.db.get(relations[0]!.termId)))?.isDefault).toBe(true);
});

test('deleting an empty or orphan-only category does not create an unrelated default category', async () => {
 const {t,editor,createPage}=await fixture();
 for(const orphan of [false,true]) {
  const pageId=await createPage({title:'Gone',slug:'gone'});
  const category=await t.run(async ctx=>{
   const id=await ctx.db.insert('terms',{name:'Temporary',slug:'temporary',taxonomy:'category',count:0,countReady:true,isDefault:false,createdAt:1,updatedAt:1});
   if(orphan)await ctx.db.insert('termRelationships',{postId:pageId,termId:id});
   await ctx.db.delete(pageId);return id;
  });
  expect(await editor.mutation(api.taxonomies.mutations.deleteCategory,{termId:category})).toMatchObject({reassignedPosts:0});
  expect(await t.run(ctx=>ctx.db.query('terms').collect())).toEqual([]);
 }
});

test('permanent page deletion removes imported metadata and preserves another document metadata',async()=>{
 const {t,editor,createPage}=await fixture();const pageId=await createPage({title:'Imported',slug:'imported'}),other=await createPage({title:'Retained',slug:'retained'});
 const retained=await t.run(async ctx=>{for(const key of ['_wp_content_rendered','_convexpress_wp_import:accepted'])await ctx.db.insert('postMeta',{postId:pageId,key,value:'Recoverable source'});return ctx.db.insert('postMeta',{postId:other,key:'_wp_content_rendered',value:'Keep this'});});
 await editor.mutation(api.pages.mutations.trash,{pageId});await editor.mutation(api.pages.mutations.permanentDelete,{pageId});
 expect(await t.run(ctx=>ctx.db.query('postMeta').withIndex('by_post',q=>q.eq('postId',pageId)).collect())).toEqual([]);
 expect(await t.run(ctx=>ctx.db.get(retained))).not.toBeNull();
});

test('orphan metadata repair refuses live documents and is bounded and repeatable',async()=>{
 const {t,createPage}=await fixture();const pageId=await createPage({title:'Owned orphan',slug:'owned-orphan'});
 await t.run(async ctx=>{for(let i=0;i<101;i++)await ctx.db.insert('postMeta',{postId:pageId,key:`source-${i}`,value:'retained'});});
 const ref=makeFunctionReference<any,any,any>('pages/internals:deleteOrphanedMetadata');
 await expect(t.mutation(ref,{pageId})).rejects.toMatchObject({data:{code:'DOCUMENT_STILL_EXISTS'}});
 expect(await t.run(ctx=>ctx.db.query('postMeta').withIndex('by_post',q=>q.eq('postId',pageId)).collect())).toHaveLength(101);
 await t.run(ctx=>ctx.db.delete(pageId));
 expect(await t.mutation(ref,{pageId})).toEqual({deleted:100,hasMore:true});
 expect(await t.mutation(ref,{pageId})).toEqual({deleted:1,hasMore:false});
 expect(await t.mutation(ref,{pageId})).toEqual({deleted:0,hasMore:false});
});
