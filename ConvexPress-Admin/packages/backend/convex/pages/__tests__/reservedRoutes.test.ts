import { expect, test } from 'bun:test';
import { convexTest } from 'convex-test';
import { api, internal } from '../../_generated/api';
import schema from '../../schema';
import { reservedPageRoute } from '../../helpers/pageRoutePolicy';
const modules = {
  './convex/_generated/server.js': () => import('../../_generated/server.js'),
  './convex/pages/mutations.ts': () => import('../mutations'),
  './convex/pages/httpInternals.ts': () => import('../httpInternals'),
  './convex/revisions/internals.ts': () => import('../../revisions/internals'),
};
async function fixture() {
  const t = convexTest({schema,modules});
  const authorId = await t.run(async ctx => {
    const roleId = await ctx.db.insert('roles', {name:'Editor',slug:'editor',description:'Fixture',level:80,type:'internal',status:'active',isDefault:false,isProtected:true,capabilities:['page.create','page.update','page.publish','page.set_parent','page.reorder'],pageAccess:[],createdAt:1,updatedAt:1});
    return ctx.db.insert('users',{email:'editor@example.test',emailVerified:true,status:'active',authSource:'local',internalRole:'administrator',roleId,createdAt:1,updatedAt:1});
  });
  const editor = t.withIdentity({subject:authorId,issuer:'https://convexpress-admin.local'});
  return {t,editor,authorId};
}
test('route policy distinguishes exact URLs, dynamic segments, splats and configured dashboard paths', () => {
  expect(reservedPageRoute('/products')).toBe('/products');
  expect(reservedPageRoute('/document-preview')).toBe('/document-preview');
  expect(reservedPageRoute('/document-preview-story')).toBeNull();
  expect(reservedPageRoute('/products/field-kit')).toBe('/products/$slug');
  expect(reservedPageRoute('/api/downloads/receipt')).toBe('/api/downloads/$leaseId');
  expect(reservedPageRoute('/api/lead-magnets/receipt')).toBe('/api/lead-magnets/$leaseId');
  expect(reservedPageRoute('/api/download-story')).toBeNull();
  expect(reservedPageRoute('/product-story')).toBeNull();
  expect(reservedPageRoute('/account')).toBeNull();
  expect(reservedPageRoute('/account/courses')).toBe('/account/courses');
  expect(reservedPageRoute('/members/events','/members')).toBe('/members');
  expect(reservedPageRoute('/page/about/team')).toBe('/page/$');
});
test('real create rejects a reserved page slug instead of renaming it', async () => {
  const {t,editor,authorId}=await fixture();
  await t.run(ctx=>ctx.db.insert('posts',{type:'page',title:'Legacy',slug:'products',path:'/products',content:'',status:'draft',visibility:'public',authorId,commentStatus:'closed',createdAt:1,updatedAt:1}));
  await expect(editor.mutation(api.pages.mutations.create,{title:'Products',slug:'products'})).rejects.toThrow('built-in website route');
  await expect(editor.mutation(api.pages.mutations.create,{title:'Private preview collision',slug:'document-preview'})).rejects.toThrow('built-in website route');
  expect((await t.run(ctx=>ctx.db.query('posts').collect())).length).toBe(1);
});
test('legacy collision permits content-only edits but a rename into a reserved route is rejected', async () => {
  const {t,editor,authorId}=await fixture();
  const pageId=await t.run(ctx=>ctx.db.insert('posts',{type:'page',title:'Legacy',slug:'events',path:'/events',content:'',status:'auto-draft',visibility:'public',authorId,commentStatus:'closed',createdAt:1,updatedAt:1}));
  await editor.mutation(api.pages.mutations.update,{pageId,title:'Edited legacy title'});
  expect((await t.run(ctx=>ctx.db.get(pageId)))?.title).toBe('Edited legacy title');
  await expect(editor.mutation(api.pages.mutations.update,{pageId,slug:'products'})).rejects.toThrow('built-in website route');
});
test('configured dashboard namespace blocks new page creation', async () => {
  const {t,editor,authorId}=await fixture();
  await t.run(ctx=>ctx.db.insert('settings',{section:'dashboard',values:{basePath:'/members'},updatedAt:1,updatedBy:authorId}));
  await expect(editor.mutation(api.pages.mutations.create,{title:'Members'})).rejects.toThrow('built-in website route');
});

test('reparenting cannot move a descendant into a configured dashboard and leaves the tree intact', async () => {
 const {t,editor,authorId}=await fixture();
 const {parentId,childId}=await t.run(async ctx=>{
  await ctx.db.insert('settings',{section:'dashboard',values:{basePath:'/new/portal'},updatedAt:1,updatedBy:authorId});
  const common={type:'page' as const,content:'',status:'auto-draft' as const,visibility:'public' as const,authorId,commentStatus:'closed' as const,createdAt:1,updatedAt:1};
  const parentId=await ctx.db.insert('posts',{...common,title:'Old',slug:'old',path:'/old',depth:0});
  const childId=await ctx.db.insert('posts',{...common,title:'Portal',slug:'portal',path:'/old/portal',parentId,depth:1});
  return {parentId,childId};
 });
 await expect(editor.mutation(api.pages.mutations.update,{pageId:parentId,slug:'new'})).rejects.toThrow('built-in website route');
 expect((await t.run(ctx=>ctx.db.get(childId)))?.path).toBe('/old/portal');
 expect((await t.run(ctx=>ctx.db.get(parentId)))?.slug).toBe('old');
});
test('REST internal create follows the same reserved route policy', async () => {
 const {t,authorId}=await fixture();
 await expect(t.mutation(internal.pages.httpInternals.createInternal,{title:'Login',slug:'login',authorId})).rejects.toThrow('built-in website route');
});
test('both explicit reparent and drag reorder reject a new root collision', async () => {
 const {t,editor,authorId}=await fixture();
 const {childId,reservedParentId}=await t.run(async ctx=>{
  const common={type:'page' as const,content:'',status:'auto-draft' as const,visibility:'public' as const,authorId,commentStatus:'closed' as const,createdAt:1,updatedAt:1};
  const parentId=await ctx.db.insert('posts',{...common,title:'Story',slug:'story',path:'/story',depth:0});
  const reservedParentId=await ctx.db.insert('posts',{...common,title:'Legacy Events',slug:'events',path:'/events',depth:0});
  const childId=await ctx.db.insert('posts',{...common,title:'Products',slug:'products',path:'/story/products',parentId,depth:1});
  return {childId,reservedParentId};
 });
 await expect(editor.mutation(api.pages.mutations.setParent,{pageId:childId})).rejects.toThrow('built-in website route');
 await expect(editor.mutation(api.pages.mutations.reorder,{items:[{pageId:childId,parentId:reservedParentId,menuOrder:0}]})).rejects.toThrow('built-in website route');
 expect((await t.run(ctx=>ctx.db.get(childId)))?.path).toBe('/story/products');
});
