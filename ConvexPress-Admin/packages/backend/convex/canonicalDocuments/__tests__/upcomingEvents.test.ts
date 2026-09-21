import {expect,test} from 'bun:test';
import {convexTest} from 'convex-test';
import {makeFunctionReference} from 'convex/server';
import schema from '../../schema';
import {readUpcomingEvents} from '../upcomingEvents';
import {RequestReadLedger} from '../../helpers/requestReadLedger';
const modules={'./convex/_generated/api.js':()=>import('../../_generated/api.js'),'./convex/_generated/server.js':()=>import('../../_generated/server.js'),'./convex/membership/policyReads.ts':()=>import('../../membership/policyReads'),'./convex/extensions/events/queries.ts':()=>import('../../extensions/events/queries')};
async function fixture(){
 const t=convexTest({schema,modules}),now=Date.now();
 const ids=await t.run(async ctx=>{
  const user=await ctx.db.insert('users',{authSource:'local',email:'events-reader@example.invalid',emailVerified:true,status:'active',createdAt:1,updatedAt:1});
  const settings=await ctx.db.insert('settings',{section:'plugins',values:{eventsEnabled:true,membershipEnabled:false},updatedAt:1,updatedBy:user});
  const fields={description:'An authored description',timeZone:'America/Denver',venue:'Studio',venueAddress:'PRIVATE_GRID_ADDRESS',registrationUrl:'https://registration.example.invalid',createdBy:user,createdAt:1,updatedAt:1};
  const events=[];
  for(let n=0;n<4;n++)events.push(await ctx.db.insert('extension_events',{...fields,title:`Event ${n}`,slug:`event-${n}`,status:'published',startsAt:now+86400000+n*1000,endsAt:now+90000000+n*1000}));
  for(let n=0;n<220;n++)await ctx.db.insert('extension_events',{...fields,title:'Past or draft',slug:`ignored-${n}`,status:n%2?'draft':'published',startsAt:n%2?now+1000:now-200000,endsAt:n%2?now+2000:now-100000});
  return {user,settings,events};
 });return {t,ids,now};
}
test('event reader uses the published upcoming index and only returns closed requested summaries',async()=>{
 const {t,ids,now}=await fixture(),budget=new RequestReadLedger();
 const result=await t.run(ctx=>readUpcomingEvents(ctx,{limit:3,showDescription:false},budget));
 expect(result.items.map(x=>x.id)).toEqual(ids.events.slice(0,3));
 expect(result.items.every(x=>x.description===null)).toBe(true);
 expect(result.asOf).toBeGreaterThanOrEqual(now);expect(budget.documents).toBeLessThan(25);
 const json=JSON.stringify(result);for(const value of ['createdBy','createdAt','venueAddress','PRIVATE_GRID_ADDRESS','registration.example'])expect(json).not.toContain(value);
 await t.run(ctx=>ctx.db.patch('extension_events',ids.events[0],{status:'cancelled'}));
 expect((await t.run(ctx=>readUpcomingEvents(ctx,{limit:1}))).items[0].id).toBe(ids.events[1]);
 await t.run(ctx=>ctx.db.patch('extension_events',ids.events[1],{startsAt:now-1}));
 expect((await t.run(ctx=>readUpcomingEvents(ctx,{limit:1}))).items[0].id).toBe(ids.events[2]);
 await t.run(ctx=>ctx.db.patch('settings',ids.settings,{values:{eventsEnabled:false,membershipEnabled:false}}));
 expect((await t.run(ctx=>readUpcomingEvents(ctx,{}))).items).toEqual([]);
});
test('invalid args refuse before reads and invalid legacy schedules never reach a renderer',async()=>{
 const {t,ids}=await fixture(),budget=new RequestReadLedger();
 await expect(t.run(ctx=>readUpcomingEvents(ctx,{limit:100},budget))).rejects.toThrow();expect(budget.queries).toBe(0);
 await t.run(ctx=>ctx.db.patch('extension_events',ids.events[0],{timeZone:'Wrong/Zone'}));
 await expect(t.run(ctx=>readUpcomingEvents(ctx,{limit:1}))).rejects.toThrow('Invalid event time zone');
});
test('canonical cards, direct event reads and the public listing share membership route revocation',async()=>{
 const {t,ids,now}=await fixture();
 const grant=await t.run(async ctx=>{
  await ctx.db.patch('settings',ids.settings,{values:{eventsEnabled:true,membershipEnabled:true}});
  const plan=await ctx.db.insert('membership_plans',{title:'Guests',slug:'guests',status:'active',grantMode:'manual',priority:1,createdAt:1,updatedAt:1});
  await ctx.db.insert('membership_restriction_rules',{resourceType:'route',resourceIdOrKey:'/events/event-0',ruleMode:'allow_only',planIds:[plan],teaserMode:'hide',loginRequired:true,createdAt:1,updatedAt:1});
  return ctx.db.insert('membership_grants',{userId:ids.user,planId:plan,sourceType:'manual',status:'active',startsAt:1,createdAt:1,updatedAt:1});
 });
 const detail=makeFunctionReference<'query'>('extensions/events/queries:getBySlug');
 const list=makeFunctionReference<'query'>('extensions/events/queries:upcoming');
 expect(await t.query(detail,{slug:'event-0'})).toBeNull();
 const page=await t.query(list,{startsAtOrAfter:now,paginationOpts:{cursor:null,numItems:5}});
 expect(page.page.some((event:{_id:string})=>event._id===ids.events[0])).toBe(false);
 expect((await t.run(ctx=>readUpcomingEvents(ctx,{limit:1}))).items[0].id).toBe(ids.events[1]);
 const member=t.withIdentity({subject:ids.user,tokenIdentifier:`https://convexpress-admin.local|${ids.user}`});
 expect(await member.query(detail,{slug:'event-0'})).not.toBeNull();
 expect((await member.run(ctx=>readUpcomingEvents(ctx,{limit:1}))).items[0].id).toBe(ids.events[0]);
 await t.run(ctx=>ctx.db.patch('membership_grants',grant,{status:'revoked'}));
 expect(await member.query(detail,{slug:'event-0'})).toBeNull();
 expect((await member.run(ctx=>readUpcomingEvents(ctx,{limit:1}))).items[0].id).toBe(ids.events[1]);
 await t.run(ctx=>ctx.db.insert('membership_restriction_rules',{resourceType:'route',resourceIdOrKey:'/events',ruleMode:'allow_only',planIds:[],teaserMode:'hide',loginRequired:true,createdAt:1,updatedAt:1}));
 expect((await t.run(ctx=>readUpcomingEvents(ctx,{}))).items).toEqual([]);
 expect(await t.query(detail,{slug:'event-1'})).toBeNull();
});
import {readNextEvent} from '../nextEvent';
test('Next Event uses its category index and never falls back to unrelated events',async()=>{
 const {t,ids}=await fixture();
 const category=await t.run(async ctx=>{const id=await ctx.db.insert('extension_event_categories',{name:'Workshops',slug:'workshops',createdAt:1,updatedAt:1});await ctx.db.patch('extension_events',ids.events[2],{categoryId:id});await ctx.db.patch('extension_events',ids.events[3],{categoryId:id});return id;});
 const budget=new RequestReadLedger(),result=await t.run(ctx=>readNextEvent(ctx,{category},budget));
 expect(result.event?.id).toBe(ids.events[2]);expect(result.categoryId).toBe(category);expect(budget.documents).toBeLessThan(30);
 expect((await t.run(ctx=>readNextEvent(ctx,{}))).event?.id).toBe(ids.events[0]);
 expect((await t.run(ctx=>readNextEvent(ctx,{category:'not-a-category-id'}))).event).toBeNull();
 await t.run(ctx=>ctx.db.patch('extension_events',ids.events[2],{status:'cancelled'}));
 expect((await t.run(ctx=>readNextEvent(ctx,{category}))).event?.id).toBe(ids.events[3]);
 await t.run(async ctx=>{await ctx.db.patch('settings',ids.settings,{values:{eventsEnabled:true,membershipEnabled:true}});await ctx.db.insert('membership_restriction_rules',{resourceType:'route',resourceIdOrKey:'/events/event-3',ruleMode:'allow_only',planIds:[],teaserMode:'hide',loginRequired:true,createdAt:1,updatedAt:1});});
 expect((await t.run(ctx=>readNextEvent(ctx,{category}))).event).toBeNull();
 await t.run(ctx=>ctx.db.delete('extension_event_categories',category));
 expect((await t.run(ctx=>readNextEvent(ctx,{category}))).event).toBeNull();
});
