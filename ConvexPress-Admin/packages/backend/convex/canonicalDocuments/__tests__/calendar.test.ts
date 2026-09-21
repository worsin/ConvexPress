import {expect,test} from 'bun:test';
import {convexTest} from 'convex-test';
import schema from '../../schema';
import {readCalendar} from '../calendar';
import {calendarWindow} from '../foundation/calendarContracts';
import {eventIntervalBucket} from '../foundation/eventIntervalIndex';
import {RequestReadLedger} from '../../helpers/requestReadLedger';
const scope={websiteKey:'calendar-site',instanceKey:'calendar-staging'};
const zone='America/Denver',month='2026-09',window=calendarWindow(month,zone),hour=3_600_000;
const modules={'./convex/_generated/api.js':()=>import('../../_generated/api.js'),'./convex/_generated/server.js':()=>import('../../_generated/server.js'),'./convex/membership/policyReads.ts':()=>import('../../membership/policyReads')};
async function fixture(){
 const t=convexTest({schema,modules});const ids=await t.run(async ctx=>{
  const user=await ctx.db.insert('users',{authSource:'local',email:'calendar-reader@example.invalid',emailVerified:true,status:'active',createdAt:1,updatedAt:1});
  const settings=await ctx.db.insert('settings',{section:'plugins',values:{eventsEnabled:true,membershipEnabled:false},updatedAt:1,updatedBy:user});
  await ctx.db.insert('settings',{section:'general',values:{timezone:zone},updatedAt:1,updatedBy:user});
  const category=await ctx.db.insert('extension_event_categories',{name:'Workshops',slug:'workshops',createdAt:1,updatedAt:1});
  const base={description:'Authored gathering',timeZone:zone,venue:'Studio',venueAddress:'PRIVATE_ADDRESS',registrationUrl:'https://private.example.invalid',createdBy:user,createdAt:1,updatedAt:1};
  const add=async(slug:string,start:number,end:number,group=false,status:'published'|'draft'='published')=>ctx.db.insert('extension_events',{...base,title:slug,slug,startsAt:start,endsAt:end,calendarBucket:eventIntervalBucket(start,end),categoryId:group?category:undefined,status});
  const carry=[await add('long-carryover',window.startsAt-1000*hour,window.startsAt+hour,true),await add('short-carryover',window.startsAt-hour,window.startsAt+2*hour)];
  const started=[];for(let n=0;n<7;n++)started.push(await add(`gathering-${n}`,window.startsAt+n*hour,window.startsAt+(n+1)*hour,n%2===0));
  await add('ends-at-boundary',window.startsAt-hour,window.startsAt);await add('starts-next-month',window.endsAt,window.endsAt+hour);await add('draft-gathering',window.startsAt,window.startsAt+hour,true,'draft');
  for(let n=0;n<360;n++)await add(`outside-${n}`,n%2?window.endsAt+10000+n:window.startsAt-10000-n,n%2?window.endsAt+10001+n:window.startsAt-9999-n);
  return {user,settings,category,carry,started};
 });return {t,ids};
}
test('calendar paginates carryovers and same-month events without scanning unrelated history',async()=>{
 const {t,ids}=await fixture();const seen:string[]=[];let cursor:string|null=null,pages=0;
 do{
  const budget=new RequestReadLedger();const result=await t.run(ctx=>readCalendar(ctx,{month,limit:2,cursor},scope,'page-a',budget));
  expect(result.timeZone).toBe(zone);expect(result.startsAt).toBe(window.startsAt);expect(result.endsAt).toBe(window.endsAt);
  expect(budget.documents).toBeLessThan(25);seen.push(...result.items.map(x=>x.id));cursor=result.nextCursor;pages++;
  for(const value of ['PRIVATE_ADDRESS','private.example.invalid','createdBy','calendarBucket'])expect(JSON.stringify(result)).not.toContain(value);
  if(pages>10)throw Error('Calendar cursor did not finish');
 }while(cursor);
 expect(seen.slice(0,2).sort()).toEqual(ids.carry.sort());expect(seen.slice(2)).toEqual(ids.started);expect(new Set(seen).size).toBe(9);expect(pages).toBe(5);
});
test('category filters, empty categories and cursor bindings cannot cross site, document or month',async()=>{
 const {t,ids}=await fixture();const args={month,limit:1,category:ids.category};const first=await t.run(ctx=>readCalendar(ctx,args,scope,'page-a'));expect(first.items.map(x=>x.id)).toEqual([ids.carry[0]]);expect(first.nextCursor).not.toBe(null);
 for(const changed of [{month:'2026-10'},{timeZone:'UTC'},{category:undefined},{limit:2}])await expect(t.run(ctx=>readCalendar(ctx,{...args,...changed,cursor:first.nextCursor},scope,'page-a'))).rejects.toThrow('another document');
 await expect(t.run(ctx=>readCalendar(ctx,{...args,cursor:first.nextCursor},{...scope,instanceKey:'other'},'page-a'))).rejects.toThrow('another document');
 await expect(t.run(ctx=>readCalendar(ctx,{...args,cursor:first.nextCursor},scope,'page-b'))).rejects.toThrow('another document');
 const forged=JSON.parse(first.nextCursor!);forged.key=['other','published',window.startsAt,1,ids.started[0]];
 await expect(t.run(ctx=>readCalendar(ctx,{...args,cursor:JSON.stringify(forged)},scope,'page-a'))).rejects.toThrow('outside its selected index');
 const empty=await t.run(ctx=>ctx.db.insert('extension_event_categories',{name:'Empty',slug:'empty',createdAt:1,updatedAt:1}));
 expect((await t.run(ctx=>readCalendar(ctx,{month,category:empty},scope,'page-a'))).items).toEqual([]);
 await t.run(ctx=>ctx.db.delete('extension_event_categories',empty));expect((await t.run(ctx=>readCalendar(ctx,{month,category:empty},scope,'page-a'))).items).toEqual([]);
});
test('calendar rechecks published status, plugin state and current route membership',async()=>{
 const {t,ids}=await fixture();await t.run(async ctx=>{
  await ctx.db.patch('extension_events',ids.carry[0],{status:'cancelled'});
  await ctx.db.patch('settings',ids.settings,{values:{eventsEnabled:true,membershipEnabled:true}});
  await ctx.db.insert('membership_restriction_rules',{resourceType:'route',resourceIdOrKey:'/events/short-carryover',ruleMode:'allow_only',planIds:[],teaserMode:'hide',loginRequired:true,createdAt:1,updatedAt:1});
 });
 const visible=await t.run(ctx=>readCalendar(ctx,{month},scope,'page-a'));expect(visible.items.map(x=>x.id)).toEqual(ids.started);
 await t.run(ctx=>ctx.db.insert('membership_restriction_rules',{resourceType:'route',resourceIdOrKey:'/events',ruleMode:'allow_only',planIds:[],teaserMode:'hide',loginRequired:true,createdAt:1,updatedAt:1}));
 expect((await t.run(ctx=>readCalendar(ctx,{month},scope,'page-a'))).items).toEqual([]);
 await t.run(ctx=>ctx.db.patch('settings',ids.settings,{values:{eventsEnabled:false,membershipEnabled:false}}));expect((await t.run(ctx=>readCalendar(ctx,{month},scope,'page-a'))).items).toEqual([]);
});
test('missing or inconsistent derived coordinates refuse without returning a partial calendar',async()=>{
 const {t,ids}=await fixture();await t.run(ctx=>ctx.db.patch('extension_events',ids.started[0],{calendarBucket:undefined}));
 await expect(t.run(ctx=>readCalendar(ctx,{month},scope,'page-a'))).rejects.toThrow('being prepared');
 await t.run(async ctx=>{const row=await ctx.db.get('extension_events',ids.started[0]);await ctx.db.patch('extension_events',ids.started[0],{calendarBucket:'stale-key'});});
 await expect(t.run(ctx=>readCalendar(ctx,{month},scope,'page-a'))).rejects.toThrow('coordinates require repair');
});
