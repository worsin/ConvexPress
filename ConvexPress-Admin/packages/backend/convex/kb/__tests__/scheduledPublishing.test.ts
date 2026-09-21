import { expect, test } from 'bun:test';
import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import schema from '../../schema';
import { publishScheduledBatch } from '../internals';
import type { MutationCtx } from '../../_generated/server';
const modules={ './convex/_generated/server.js':()=>import('../../_generated/server.js'), './convex/_generated/api.js':()=>import('../../_generated/api.js'), './convex/kb/mutations.ts':()=>import('../mutations'), './convex/kb/internals.ts':()=>import('../internals') };
async function fixture(unscheduled=0,nonDraftScheduled=0,due=1){
 const t=convexTest({schema,modules});const ids=await t.run(async ctx=>{
  const role=await ctx.db.insert('roles',{name:'Scheduled publisher',slug:'scheduled-publisher',description:'Fixture',level:50,type:'internal',status:'active',isDefault:false,isProtected:false,pageAccess:[],capabilities:['kb.publish'],createdAt:1,updatedAt:1});
  const user=await ctx.db.insert('users',{authSource:'local',email:'scheduled-test@example.invalid',emailVerified:true,status:'active',roleId:role,createdAt:1,updatedAt:1});
  const plugins=await ctx.db.insert('settings',{section:'plugins',values:{knowledgeBaseEnabled:true},updatedBy:user,updatedAt:1});
  const category=await ctx.db.insert('kb_categories',{name:'Scheduled fixtures',slug:'scheduled-fixtures',order:0,isActive:true,isPublished:true,articleCount:0,createdAt:1,updatedAt:1});
  const base={excerpt:'Scheduled fixture',content:'{"type":"doc"}',contentPlainText:'Scheduled fixture content',authorId:user,contributors:[],categoryId:category,keywords:[],viewCount:0,uniqueViewCount:0,helpfulVotes:0,notHelpfulVotes:0,readingTimeMinutes:1,version:1,isFeatured:false,sortOrder:0,meilisearchSynced:true,ragSynced:true,createdAt:1,updatedAt:1};
  for(let i=0;i<unscheduled;i++)await ctx.db.insert('kb_articles',{...base,title:'Ordinary draft '+i,slug:'draft-'+i,status:'draft'});
  for(let i=0;i<nonDraftScheduled;i++)await ctx.db.insert('kb_articles',{...base,title:'Archived schedule '+i,slug:'archived-'+i,status:'archived',scheduledAt:1});
  const articles=[];for(let i=0;i<due;i++)articles.push(await ctx.db.insert('kb_articles',{...base,title:'Due '+i,slug:'due-'+i,status:'draft',scheduledAt:Date.now()-1000}));
  const future=await ctx.db.insert('kb_articles',{...base,title:'Future',slug:'future',status:'draft',scheduledAt:Date.now()+86400000});
  return {user,plugins,category,articles,future};
 });return {t,ids};
}
// Capture only the scheduling boundary so a broken zero-progress reschedule
// cannot run forever in the regression. The handler uses the real test database.
async function batch(f:Awaited<ReturnType<typeof fixture>>){
 let scheduled=0;const result=await f.t.run(ctx=>(publishScheduledBatch as unknown as { _handler:(ctx:MutationCtx,args:Record<string,never>)=>Promise<{published:number}> })._handler({...ctx,scheduler:{...ctx.scheduler,runAfter:async()=>{scheduled++;return 'synthetic-scheduled-id' as never;}}},{}));return {...result,scheduled};
}
test('1005 unscheduled drafts and250 archived schedules cannot hide a due article or trigger a no-progress loop',async()=>{
 const f=await fixture(1005,250,1),result=await batch(f);expect(result).toEqual({published:1,scheduled:0});
 await f.t.run(async ctx=>{expect((await ctx.db.get(f.ids.articles[0]!))!.status).toBe('published');expect((await ctx.db.get(f.ids.future))!.status).toBe('draft');expect((await ctx.db.query('kb_articles').withIndex('by_status',q=>q.eq('status','draft')).collect())).toHaveLength(1006);});
});
test('101 due articles continue immediately until every article is published exactly once',async()=>{
 const f=await fixture(0,0,101);let total=0,reschedules=0;
 for(let i=0;i<10;i++){const result=await batch(f);total+=result.published;reschedules+=result.scheduled;if(!result.scheduled)break;}
 expect(total).toBe(101);expect(reschedules).toBe(2);expect(await batch(f)).toEqual({published:0,scheduled:0});
 await f.t.run(async ctx=>{expect((await ctx.db.get(f.ids.category))!.articleCount).toBe(101);expect(await ctx.db.query('events').collect()).toHaveLength(101);});
});
test('registered scheduled publishing invalidates search state, preserves future schedules and is idempotent',async()=>{
 const f=await fixture(0,0,2),fn=makeFunctionReference<'mutation'>('kb/internals:publishScheduledBatch');expect(await f.t.mutation(fn,{})).toEqual({published:2});expect(await f.t.mutation(fn,{})).toEqual({published:0});
 await f.t.run(async ctx=>{for(const id of f.ids.articles){const article=(await ctx.db.get(id))!;expect(article.status).toBe('published');expect(article.scheduledAt).toBeUndefined();expect(article.meilisearchSynced).toBe(false);expect(article.ragSynced).toBe(false);}expect((await ctx.db.get(f.ids.category))!.articleCount).toBe(2);expect((await ctx.db.get(f.ids.future))!.scheduledAt).toBeGreaterThan(Date.now());await ctx.db.patch(f.ids.plugins,{values:{knowledgeBaseEnabled:false}});});
 await expect(f.t.mutation(fn,{})).rejects.toThrow();
});


test('scheduling a future article never emits a premature publication event',async()=>{
 const f=await fixture(0,0,0),client=f.t.withIdentity({subject:f.ids.user,issuer:'https://convexpress-admin.local'});
 await client.mutation(makeFunctionReference<'mutation'>('kb/mutations:publish'),{articleId:f.ids.future,scheduledAt:Date.now()+86400000});
 await f.t.run(async ctx=>{expect((await ctx.db.get(f.ids.future))!.status).toBe('draft');expect((await ctx.db.query('events').collect()).map(event=>event.code)).toEqual(['kb.article_scheduled']);expect((await ctx.db.get(f.ids.category))!.articleCount).toBe(0);});
});
test('invalid scheduled timestamps are rejected before any publication changes',async()=>{
 const f=await fixture(0,0,0),client=f.t.withIdentity({subject:f.ids.user,issuer:'https://convexpress-admin.local'});
 for(const scheduledAt of [NaN,Infinity,-Infinity,-1,0,1.5])await expect(client.mutation(makeFunctionReference<'mutation'>('kb/mutations:publish'),{articleId:f.ids.future,scheduledAt})).rejects.toThrow();
 expect(await f.t.run(ctx=>ctx.db.query('events').collect())).toHaveLength(0);
});
