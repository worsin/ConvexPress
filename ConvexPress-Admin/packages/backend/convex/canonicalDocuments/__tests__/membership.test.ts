import {test,expect,setSystemTime,afterEach} from 'bun:test';
import {convexTest} from 'convex-test';
import {makeFunctionReference} from 'convex/server';
import schema from '../../schema';
import {readMembershipAccess} from '../membership';
import {RequestReadLedger} from '../../helpers/requestReadLedger';
const modules={
 './convex/_generated/api.js':()=>import('../../_generated/api.js'),
 './convex/_generated/server.js':()=>import('../../_generated/server.js'),
 './convex/membership/policyReads.ts':()=>import('../../membership/policyReads'),
 './convex/canonicalDocuments.ts':()=>import('../../canonicalDocuments'),
};
afterEach(()=>setSystemTime());
async function fixture(){
 const t=convexTest({schema,modules});
 const ids=await t.run(async ctx=>{
  const role=await ctx.db.insert('roles',{name:'Editor',slug:'editor',description:'Fixture editor',level:80,type:'internal',isDefault:false,isProtected:false,capabilities:['page.update'],pageAccess:[],status:'active',createdAt:1,updatedAt:1});
  const user=await ctx.db.insert('users',{authSource:'local',email:'private-member@example.invalid',emailVerified:true,status:'active',roleId:role,createdAt:1,updatedAt:1});
  const other=await ctx.db.insert('users',{authSource:'local',email:'other-member@example.invalid',emailVerified:true,status:'active',createdAt:1,updatedAt:1});
  const setting=await ctx.db.insert('settings',{section:'plugins',values:{membershipEnabled:true},updatedAt:1,updatedBy:user});
  const plan=await ctx.db.insert('membership_plans',{title:'Studio Circle',slug:'studio-circle',description:'PRIVATE INTERNAL DESCRIPTION',status:'active',grantMode:'manual',linkedCapabilities:['private.capability'],priority:1,createdAt:1,updatedAt:1});
  const alternate=await ctx.db.insert('membership_plans',{title:'Other plan',slug:'other-plan',status:'active',grantMode:'manual',priority:2,createdAt:1,updatedAt:1});
  const grant=await ctx.db.insert('membership_grants',{userId:user,planId:plan,sourceType:'manual',status:'active',startsAt:1,metadata:{private:'PRIVATE GRANT'},createdAt:1,updatedAt:1});
  const page=await ctx.db.insert('posts',{type:'page',title:'Plan preview',slug:'plan-preview',status:'draft',visibility:'public',authorId:user,commentStatus:'closed',createdAt:1,updatedAt:1});
  return {user,other,setting,plan,alternate,grant,page,role};
 });
 const as=(id:string)=>t.withIdentity({subject:id,tokenIdentifier:`https://convexpress-admin.local|${id}`});
 return {t,ids,client:as(ids.user),other:as(ids.other)};
}
test('membership teaser recognizes only this site user and exact active plan without projecting private data',async()=>{
 const {t,ids,client,other}=await fixture();
 expect(await t.run(ctx=>readMembershipAccess(ctx,{plan:ids.plan}))).toEqual({state:'signed-out',plan:{id:ids.plan,title:'Studio Circle'}});
 const result=await client.run(ctx=>readMembershipAccess(ctx,{plan:ids.plan}));
 expect(result).toEqual({state:'granted',plan:{id:ids.plan,title:'Studio Circle'}});
 for(const text of ['PRIVATE','private-member','userId','linkedCapabilities','metadata','sourceType'])expect(JSON.stringify(result)).not.toContain(text);
 expect((await other.run(ctx=>readMembershipAccess(ctx,{plan:ids.plan}))).state).toBe('missing-plan');
 expect((await client.run(ctx=>readMembershipAccess(ctx,{plan:ids.alternate}))).state).toBe('missing-plan');
 for(const status of ['inactive','banned'] as const){await t.run(ctx=>ctx.db.patch(ids.user,{status}));expect((await client.run(ctx=>readMembershipAccess(ctx,{plan:ids.plan}))).state).toBe('signed-out');}
 await t.run(ctx=>ctx.db.patch(ids.user,{status:'active',authSource:'clerk',clerkUserId:'studio-customer'}));
 expect((await client.run(ctx=>readMembershipAccess(ctx,{plan:ids.plan}))).state).toBe('signed-out');
 const customer=t.withIdentity({subject:'studio-customer',tokenIdentifier:'https://clerk.example.invalid|studio-customer'});
 expect((await customer.run(ctx=>readMembershipAccess(ctx,{plan:ids.plan}))).state).toBe('granted');
});
test('membership teaser handles absent, disabled, removed and unpublished plans without exposing their titles',async()=>{
 const {t,ids,client}=await fixture();
 expect(await t.run(ctx=>readMembershipAccess(ctx,{}))).toEqual({state:'unconfigured',plan:null});
 for(const plan of ['invalid-id',ids.user])expect(await client.run(ctx=>readMembershipAccess(ctx,{plan}))).toEqual({state:'unavailable',plan:null});
 for(const status of ['draft','archived'] as const){await t.run(ctx=>ctx.db.patch(ids.plan,{status}));expect(await client.run(ctx=>readMembershipAccess(ctx,{plan:ids.plan}))).toEqual({state:'unavailable',plan:null});}
 await t.run(ctx=>ctx.db.patch(ids.plan,{status:'active'}));
 await t.run(ctx=>ctx.db.patch(ids.setting,{values:{membershipEnabled:false}}));
 expect(await client.run(ctx=>readMembershipAccess(ctx,{plan:ids.plan}))).toEqual({state:'unavailable',plan:null});
 await t.run(async ctx=>{await ctx.db.patch(ids.setting,{values:{membershipEnabled:true}});await ctx.db.delete(ids.plan);});
 expect(await client.run(ctx=>readMembershipAccess(ctx,{plan:ids.plan}))).toEqual({state:'unavailable',plan:null});
});
test('grant time boundaries, explicit grace and revocation take effect without waiting for maintenance',async()=>{
 setSystemTime(10000);const {t,ids,client}=await fixture();
 const read=()=>client.run(async ctx=>{const budget=new RequestReadLedger();const result=await readMembershipAccess(ctx,{plan:ids.plan},budget);return {state:result.state,recheck:budget.authorizationRecheckAt};});
 await t.run(ctx=>ctx.db.patch(ids.grant,{startsAt:11000,endsAt:12000}));expect(await read()).toEqual({state:'missing-plan',recheck:11000});
 setSystemTime(11000);expect(await read()).toEqual({state:'granted',recheck:12000});
 setSystemTime(12000);expect(await read()).toEqual({state:'missing-plan',recheck:null});
 await t.run(ctx=>ctx.db.patch(ids.grant,{graceEndsAt:13000}));expect(await read()).toEqual({state:'granted',recheck:13000});
 await t.run(ctx=>ctx.db.patch(ids.grant,{status:'grace'}));expect(await read()).toEqual({state:'granted',recheck:13000});
 setSystemTime(13000);expect(await read()).toEqual({state:'missing-plan',recheck:null});
 await t.run(ctx=>ctx.db.patch(ids.grant,{status:'active',endsAt:undefined,graceEndsAt:undefined,revokedAt:12000}));expect((await read()).state).toBe('missing-plan');
 for(const status of ['revoked','expired'] as const){await t.run(ctx=>ctx.db.patch(ids.grant,{status,revokedAt:undefined}));expect((await read()).state).toBe('missing-plan');}
});
test('registered plan picker enforces editing permission, bounded continuation and active-plan projection',async()=>{
 const {t,ids,client,other}=await fixture();
 await t.run(async ctx=>{for(let i=0;i<23;i++)await ctx.db.insert('membership_plans',{title:`Plan ${i}`,slug:`plan-${i}`,status:i===0?'draft':i===1?'archived':'active',grantMode:'manual',priority:0,createdAt:1,updatedAt:1});});
 const ref=makeFunctionReference<'query'>('canonicalDocuments:membershipPlanOptions');
 const args={postId:ids.page,paginationOpts:{cursor:null,numItems:20}};
 await expect(t.query(ref,args)).rejects.toThrow();await expect(other.query(ref,args)).rejects.toThrow();
 const first=await client.query(ref,args);expect(first.page).toHaveLength(20);expect(first.isDone).toBe(false);
 const last=await client.query(ref,{...args,paginationOpts:{cursor:first.continueCursor,numItems:20}});expect(last.page).toHaveLength(3);expect(last.isDone).toBe(true);
 const all=[...first.page,...last.page];expect(new Set(all.map(p=>p.id)).size).toBe(23);
 for(const row of all){expect(Object.keys(row).sort()).toEqual(['id','title']);expect(['Plan 0','Plan 1']).not.toContain(row.title);}
 await t.run(ctx=>ctx.db.patch(ids.setting,{values:{membershipEnabled:false}}));await expect(client.query(ref,args)).rejects.toThrow('Membership');
});
