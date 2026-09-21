import {test,expect} from 'bun:test';
import {convexTest} from 'convex-test';
import schema from '../../schema';
import {readMembershipPlans} from '../membershipPlans';
import {RequestReadLedger} from '../../helpers/requestReadLedger';
const modules={'./convex/_generated/api.js':()=>import('../../_generated/api.js'),'./convex/_generated/server.js':()=>import('../../_generated/server.js')};
const scope={websiteKey:'studio',instanceKey:'staging'};
async function fixture(){
 const t=convexTest({schema,modules});
 const ids=await t.run(async ctx=>{
  const user=await ctx.db.insert('users',{authSource:'local',email:'plans@example.invalid',emailVerified:true,status:'active',createdAt:1,updatedAt:1});
  const setting=await ctx.db.insert('settings',{section:'plugins',values:{membershipEnabled:true},updatedBy:user,updatedAt:1});
  const plans=[];
  for(let i=0;i<19;i++)plans.push(await ctx.db.insert('membership_plans',{title:`Plan ${i}`,slug:`plan-${i}`,description:`Description ${i}`,status:i===0?'draft':i===1?'archived':'active',grantMode:'manual',priority:Math.floor((19-i)/3),linkedSubscriptionCode:'PRIVATE ENTITLEMENT',linkedCapabilities:['PRIVATE CAPABILITY'],createdAt:1,updatedAt:1}));
  for(const [i,displayAsFeature] of [undefined,true,false].entries())await ctx.db.insert('membership_plan_benefits',{planId:plans[2],code:`PRIVATE CODE ${i}`,label:`Benefit ${i}`,description:`Description ${i}`,displayAsFeature,metadata:{secret:'PRIVATE METADATA'},createdAt:1,updatedAt:1});
  return {setting,plans};
 });
 const read=(args:unknown,readScope=scope,documentId='document-a')=>t.run(ctx=>readMembershipPlans(ctx,args,readScope,documentId));return {t,ids,read};
}
test('all membership plans traverse the complete active catalog in indexed priority order with no duplicates',async()=>{
 const {t,ids,read}=await fixture();const expected=await t.run(async ctx=>(await ctx.db.query('membership_plans').withIndex('by_status_priority',q=>q.eq('status','active')).collect()).map(p=>p._id));
 let cursor:string|null=null;const seen:string[]=[];let pages=0;
 do{const result=await read({limit:4,cursor});expect(result.cursor).toBe(cursor);expect(result.items.length).toBeLessThanOrEqual(4);seen.push(...result.items.map(p=>p.id));cursor=result.nextCursor;expect(++pages).toBeLessThan(10);}while(cursor);
 expect(seen).toEqual(expected);expect(seen).toHaveLength(17);expect(new Set(seen).size).toBe(17);expect(seen).not.toContain(ids.plans[0]);expect(seen).not.toContain(ids.plans[1]);
});
test('selected membership order, unconfigured selection and private benefits are preserved correctly',async()=>{
 const {ids,read}=await fixture();const plans=[ids.plans[2],ids.plans[7],ids.plans[0],ids.plans[4]];
 const first=await read({selection:'selected',plans,limit:2});expect(first.items.map(p=>p.id)).toEqual(plans.slice(0,2));expect(first.nextCursor).not.toBeNull();
 const last=await read({selection:'selected',plans,limit:2,cursor:first.nextCursor});expect(last.items.map(p=>p.id)).toEqual([ids.plans[4]]);expect(last.nextCursor).toBeNull();
 expect(first.items[0].benefits.map(b=>b.label)).toEqual(['Benefit 0','Benefit 1']);expect(JSON.stringify(first)).not.toContain('PRIVATE');expect(first.items[0].description).toBe('Description 2');
 expect((await read({selection:'selected',plans:[]})).items).toEqual([]);
 await expect(read({selection:'selected',plans:[ids.plans[2],ids.plans[2]]})).rejects.toThrow('only once');
});
test('continuations cannot cross website, environment, document, limit or selected plan order',async()=>{
 const {ids,read}=await fixture();const {nextCursor:cursor}=await read({limit:2});expect(cursor).not.toBeNull();
 for(const scope of [{websiteKey:'other',instanceKey:'staging'},{websiteKey:'studio',instanceKey:'live'}])await expect(read({limit:2,cursor},scope)).rejects.toThrow('another document');
 await expect(read({limit:2,cursor},scope,'document-b')).rejects.toThrow();await expect(read({limit:3,cursor})).rejects.toThrow();
 const plans=ids.plans.slice(2,7);const selected=await read({selection:'selected',plans,limit:2});await expect(read({selection:'selected',plans:[...plans].reverse(),limit:2,cursor:selected.nextCursor})).rejects.toThrow();
 const forged=JSON.parse(cursor!);forged.key[0]='draft';await expect(read({limit:2,cursor:JSON.stringify(forged)})).rejects.toThrow();
 forged.key=['active',0,0,'not-an-id'];await expect(read({limit:2,cursor:JSON.stringify(forged)})).rejects.toThrow('invalid plan identity');
});
test('plan withdrawal and disabled membership take effect on the next page without an old catalog cache',async()=>{
 const {t,ids,read}=await fixture();const first=await read({limit:2});await t.run(ctx=>ctx.db.patch(ids.plans[2],{status:'archived'}));
 expect((await read({selection:'selected',plans:[ids.plans[2]]})).items).toEqual([]);
 await t.run(ctx=>ctx.db.patch(ids.setting,{values:{membershipEnabled:false}}));expect(await read({limit:2,cursor:first.nextCursor})).toEqual({items:[],cursor:first.nextCursor,nextCursor:null});
});
test('private benefits do not consume the public scan; oversized public cards and read budgets fail explicitly',async()=>{
 const {t,ids,read}=await fixture();await t.run(async ctx=>{for(let i=0;i<129;i++)await ctx.db.insert('membership_plan_benefits',{planId:ids.plans[3],code:`b-${i}`,label:'Hidden benefit',displayAsFeature:false,createdAt:1,updatedAt:1});});
 expect((await read({selection:'selected',plans:[ids.plans[3]]})).items[0].benefits).toEqual([]);
 await t.run(async ctx=>{for(let i=0;i<65;i++)await ctx.db.insert('membership_plan_benefits',{planId:ids.plans[3],code:`public-${i}`,label:'Public benefit',displayAsFeature:true,createdAt:1,updatedAt:1});});
 await expect(read({selection:'selected',plans:[ids.plans[3]]})).rejects.toThrow('64 displayed benefits');
 const budget=new RequestReadLedger({queries:1,documents:10,bytes:10000,documentBytes:10000});await expect(t.run(ctx=>readMembershipPlans(ctx,{},scope,'document-a',budget))).rejects.toThrow('safe read budget');
});
