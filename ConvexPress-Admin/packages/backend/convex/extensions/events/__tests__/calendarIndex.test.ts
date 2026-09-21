import {expect,test} from 'bun:test';
import {convexTest} from 'convex-test';
import {makeFunctionReference} from 'convex/server';
import schema from '../../../schema';
import {eventIntervalBucket,eventCarryoverRanges} from '../../../canonicalDocuments/foundation/eventIntervalIndex';
import {assertCalendarIndexReady,eventCarryoverQuery} from '../calendarIndex';
import {RequestReadLedger} from '../../../helpers/requestReadLedger';
const modules={
 './convex/_generated/api.js':()=>import('../../../_generated/api.js'),
 './convex/_generated/server.js':()=>import('../../../_generated/server.js'),
 './convex/extensions/events/mutations.ts':()=>import('../mutations'),
 './convex/extensions/events/calendarIndex.ts':()=>import('../calendarIndex'),
};
async function fixture(){
 const t=convexTest({schema,modules});const user=await t.run(async ctx=>{
  const role=await ctx.db.insert('roles',{name:'Manager',slug:'manager',description:'Fixture',level:80,type:'internal',isDefault:false,isProtected:false,capabilities:['manage_options'],pageAccess:[],status:'active',createdAt:1,updatedAt:1});
  const id=await ctx.db.insert('users',{authSource:'local',email:'calendar@example.invalid',emailVerified:true,roleId:role,status:'active',createdAt:1,updatedAt:1});
  await ctx.db.insert('settings',{section:'plugins',values:{eventsEnabled:true},updatedAt:1,updatedBy:id});return id;
 });return {t,user,client:t.withIdentity({subject:user,tokenIdentifier:`https://convexpress-admin.local|${user}`})};
}
const fields={title:'A gathering',slug:'a-gathering',description:'Staging fixture',startsAt:100,endsAt:200,timeZone:'UTC',venue:'Studio',venueAddress:''};
test('native writes derive and move calendar coordinates, refusing caller-supplied keys',async()=>{
 const {t,client}=await fixture();const create=makeFunctionReference<'mutation'>('extensions/events/mutations:create'),update=makeFunctionReference<'mutation'>('extensions/events/mutations:update');
 await expect(client.mutation(create,{...fields,calendarBucket:'injected'})).rejects.toThrow();
 const id=await client.mutation(create,fields);const before=await t.run(ctx=>ctx.db.get('extension_events',id));expect(before!.calendarBucket).toBe(eventIntervalBucket(100,200));
 await client.mutation(update,{...fields,id,expectedUpdatedAt:before!.updatedAt,status:'published',startsAt:2**40-1,endsAt:2**40+1});
 const after=await t.run(ctx=>ctx.db.get('extension_events',id));expect(after!.calendarBucket).toBe('41:0');
 const old=await t.run(ctx=>ctx.db.query('extension_events').withIndex('by_calendar_bucket',q=>q.eq('calendarBucket',before!.calendarBucket)).collect());expect(old).toHaveLength(0);
});
test('legacy/imported rows refuse until bounded recovery derives keys without changing edit versions',async()=>{
 const {t,user}=await fixture();await t.run(async ctx=>{for(let i=0;i<19;i++)await ctx.db.insert('extension_events',{...fields,slug:`legacy-${i}`,startsAt:i*1000,endsAt:i*1000+100,status:'published',createdBy:user,createdAt:1,updatedAt:17});});
 await expect(t.run(ctx=>assertCalendarIndexReady(ctx,new RequestReadLedger()))).rejects.toThrow('being prepared');
 const recover=makeFunctionReference<'mutation'>('extensions/events/calendarIndex:recover');await t.mutation(recover,{});
 await expect(t.run(ctx=>assertCalendarIndexReady(ctx,new RequestReadLedger()))).rejects.toThrow('being prepared');await t.mutation(recover,{});
 await t.run(ctx=>assertCalendarIndexReady(ctx,new RequestReadLedger()));
 const rows=await t.run(ctx=>ctx.db.query('extension_events').collect());expect(rows).toHaveLength(19);expect(rows.every(row=>row.calendarBucket===eventIntervalBucket(row.startsAt,row.endsAt)&&row.updatedAt===17)).toBe(true);
});
test('indexed carryover ranges return only matching published events and preserve category boundaries',async()=>{
 const {t,user}=await fixture(),point=2**40;
 const ids=await t.run(async ctx=>{
  const category=await ctx.db.insert('extension_event_categories',{name:'Workshops',slug:'workshops',createdAt:1,updatedAt:1});const matching=[];
  for(let i=0;i<500;i++){
   const start=i%2?point+10000+i:point-10000-i,end=start+2;
   await ctx.db.insert('extension_events',{...fields,slug:`outside-${i}`,startsAt:start,endsAt:end,calendarBucket:eventIntervalBucket(start,end),status:'published',createdBy:user,createdAt:1,updatedAt:1});
  }
  for(let i=0;i<12;i++){
   const start=point-(2**i),end=point+(2**(12-i));
   matching.push(await ctx.db.insert('extension_events',{...fields,slug:`overlap-${i}`,startsAt:start,endsAt:end,calendarBucket:eventIntervalBucket(start,end),status:i===11?'draft':'published',categoryId:i%2?category:undefined,createdBy:user,createdAt:1,updatedAt:1}));
  }return {category,matching};
 });
 const read=async(category?:typeof ids.category)=>t.run(async ctx=>{const results=[];for(const range of eventCarryoverRanges(point))results.push(...await eventCarryoverQuery(ctx,range,category).collect());return results.map(row=>row._id).sort();});
 expect(await read()).toEqual(ids.matching.slice(0,11).sort());expect(await read(ids.category)).toEqual(ids.matching.filter((_,i)=>i%2===1&&i<11).sort());
});
