import { canonicalPostBody } from "../../__tests__/canonicalPostFixture";
import { test, expect } from 'bun:test';
import { convexTest } from 'convex-test';
import schema from '../../schema';
import { readLatestPosts } from '../latestPosts';
import { RequestReadLedger } from '../../helpers/requestReadLedger';
const modules = {
  './convex/_generated/api.js': () => import('../../_generated/api.js'),
  './convex/_generated/server.js': () => import('../../_generated/server.js'),
  './convex/membership/policyReads.ts': () => import('../../membership/policyReads'),
};
async function fixture() {
  const t = convexTest({schema, modules});
  const ids = await t.run(async ctx => {
    const user = await ctx.db.insert('users', {authSource:'local',email:'private-author@example.invalid',emailVerified:true,status:'active',displayName:'Public pen name',createdAt:1,updatedAt:1});
    await ctx.db.insert('settings',{section:'plugins',values:{membershipEnabled:false},updatedAt:1,updatedBy:user});
    const add = (title:string, publishedAt:number, visibility:'public'|'private'='public', status:'publish'|'draft'='publish') => ctx.db.insert('posts', {
      type:'post',title,slug:title.toLowerCase(),publishedAt,visibility,status,authorId:user,commentStatus:'closed',
      ...canonicalPostBody('private source body'),excerpt:'Public summary',createdAt:1,updatedAt:1,
    });
    const old = await add('Old',10), recent = await add('Recent',20);
    await add('Hidden',30,'private'); await add('Draft',40,'public','draft'); await add('Future',Date.now()+3600000);
    return {user,old,recent};
  });
  return {t,ids};
}
test('latest posts exclude private/draft/future sources and project only public cards in date order', async () => {
  const {t,ids}=await fixture();
  const result=await t.run(ctx=>readLatestPosts(ctx,{count:2}));
  expect(result.items.map(p=>p.id)).toEqual([ids.recent,ids.old]);
  expect(result.items[0]).toEqual({id:ids.recent,title:'Recent',href:'/blog/recent',excerpt:'Public summary',publishedAt:20,image:null,author:'Public pen name'});
  expect(JSON.stringify(result)).not.toContain('private source body');
  expect(JSON.stringify(result)).not.toContain('private-author');
});
test('category and tag slugs are exact typed intersections, and a missing selection does not broaden the query', async () => {
  const {t,ids}=await fixture();
  await t.run(async ctx=>{
    const term=(taxonomy:'category'|'post_tag',slug:string)=>ctx.db.insert('terms',{name:slug,slug,taxonomy,count:99,isDefault:false,createdAt:1,updatedAt:1});
    const category=await term('category','field'),tag=await term('post_tag','field');
    for(const postId of [ids.old,ids.recent]) await ctx.db.insert('termRelationships',{postId,termId:category});
    await ctx.db.insert('termRelationships',{postId:ids.old,termId:tag});
  });
  expect((await t.run(ctx=>readLatestPosts(ctx,{categorySlug:'field',tagSlug:'field'}))).items.map(p=>p.id)).toEqual([ids.old]);
  expect((await t.run(ctx=>readLatestPosts(ctx,{categorySlug:'missing'}))).items).toEqual([]);
});
test('disabled author/excerpt fields are not projected and inactive author identities are omitted', async () => {
  const {t,ids}=await fixture();
  const result=await t.run(ctx=>readLatestPosts(ctx,{count:1,showAuthors:false,showExcerpts:false}));
  expect(result.items[0].author).toBeNull(); expect(result.items[0].excerpt).toBeNull();
  await t.run(ctx=>ctx.db.patch('users',ids.user,{status:'inactive'}));
  expect((await t.run(ctx=>readLatestPosts(ctx,{count:1}))).items[0].author).toBeNull();
});
test('management principals never become public card bylines, while active site editors remain authors', async () => {
  const {t,ids}=await fixture();
  await t.run(ctx=>ctx.db.patch('users',ids.user,{authSource:'management',displayName:'Internal controller label',isInternal:true}));
  expect((await t.run(ctx=>readLatestPosts(ctx,{count:1}))).items[0].author).toBeNull();
  await t.run(ctx=>ctx.db.patch('users',ids.user,{authSource:'local',internalRole:'management'}));
  expect((await t.run(ctx=>readLatestPosts(ctx,{count:1}))).items[0].author).toBeNull();
  await t.run(ctx=>ctx.db.patch('users',ids.user,{internalRole:'editor',displayName:'Public editor'}));
  expect((await t.run(ctx=>readLatestPosts(ctx,{count:1}))).items[0].author).toBe('Public editor');
});
test('invalid request data is rejected before reads, and full source bodies consume the read budget', async () => {
  const {t,ids}=await fixture();
  const budget=new RequestReadLedger();
  await expect(t.run(ctx=>readLatestPosts(ctx,{count:1.5},budget))).rejects.toThrow();
  expect(budget.queries).toBe(0);
  await t.run(ctx=>ctx.db.patch('posts',ids.recent,{...canonicalPostBody('x'.repeat(513*1024))}));
  await expect(t.run(ctx=>readLatestPosts(ctx,{count:1}))).rejects.toThrow();
});

test('resource and route membership restrictions hide cards, and revocation removes them for a former member', async () => {
  const {t,ids}=await fixture();
  const grant=await t.run(async ctx=>{
    const setting=await ctx.db.query('settings').withIndex('by_section',q=>q.eq('section','plugins')).unique();
    await ctx.db.patch('settings',setting!._id,{values:{membershipEnabled:true}});
    const plan=await ctx.db.insert('membership_plans',{title:'Readers',slug:'readers',status:'active',grantMode:'manual',priority:1,createdAt:1,updatedAt:1});
    for(const target of [{resourceType:'post',resourceIdOrKey:ids.recent},{resourceType:'route',resourceIdOrKey:'/blog/old'}]) {
      await ctx.db.insert('membership_restriction_rules',{...target,ruleMode:'allow_only',planIds:[plan],teaserMode:'excerpt',loginRequired:true,createdAt:1,updatedAt:1});
    }
    return ctx.db.insert('membership_grants',{userId:ids.user,planId:plan,sourceType:'manual',status:'active',startsAt:1,createdAt:1,updatedAt:1});
  });
  expect((await t.run(ctx=>readLatestPosts(ctx,{}))).items).toEqual([]);
  const member=t.withIdentity({subject:ids.user,tokenIdentifier:`https://convexpress-admin.local|${ids.user}`});
  expect((await member.run(ctx=>readLatestPosts(ctx,{}))).items.map(p=>p.id)).toEqual([ids.recent,ids.old]);
  await t.run(ctx=>ctx.db.patch('membership_grants',grant,{status:'revoked'}));
  expect((await member.run(ctx=>readLatestPosts(ctx,{}))).items).toEqual([]);
});

test('only active image media is projected; invalid image URLs fail the closed result contract', async () => {
  const {t,ids}=await fixture();
  const media=await t.run(async ctx=>{
    const id=await ctx.db.insert('media',{title:'Public image',fileName:'field.jpg',slug:'field',url:'https://images.example.invalid/field.jpg',mimeType:'image/jpeg',fileSize:42,mediaType:'image',status:'active',uploadedBy:ids.user,createdAt:1,updatedAt:1,altText:'A field at dawn'});
    await ctx.db.patch('posts',ids.recent,{featuredImageId:id});return id;
  });
  expect((await t.run(ctx=>readLatestPosts(ctx,{count:1}))).items[0].image).toEqual({src:'https://images.example.invalid/field.jpg',alt:'A field at dawn'});
  for(const status of ['trashed','failed','processing'] as const) {
    await t.run(ctx=>ctx.db.patch('media',media,{status}));
    expect((await t.run(ctx=>readLatestPosts(ctx,{count:1}))).items[0].image).toBeNull();
  }
  await t.run(ctx=>ctx.db.patch('media',media,{status:'active',url:'javascript:alert(1)'}));
  await expect(t.run(ctx=>readLatestPosts(ctx,{count:1}))).rejects.toThrow();
});

test('exhausted discovery budgets fail explicitly instead of silently returning a partial list', async () => {
  const {t,ids}=await fixture();
  await t.run(async ctx=>{
    const template=await ctx.db.get('posts',ids.recent);if(!template)throw Error('missing fixture');
    const {_id,_creationTime,...fields}=template;
    for(let i=0;i<161;i++) await ctx.db.insert('posts',{...fields,publishedAt:100+i,visibility:'private'});
  });
  await expect(t.run(ctx=>readLatestPosts(ctx,{count:1}))).rejects.toThrow('bounded source scan');
});
