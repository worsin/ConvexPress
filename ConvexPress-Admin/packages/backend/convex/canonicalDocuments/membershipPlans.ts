import {z} from 'zod';
import {streamQuery,type IndexKey} from 'convex-helpers/server/pagination';
import {sha256Hex} from '@convexpress/site-contract';
import schema from '../schema';
import type {Doc} from '../_generated/dataModel';
import type {QueryCtx} from '../_generated/server';
import {RequestReadLedger} from '../helpers/requestReadLedger';
import {isPluginEnabled} from '../helpers/plugins';
import {CanonicalDataError,stableKey,type DataScope} from './foundation/contracts';
import {membershipPlansArgsSchema,membershipPlansResultSchema,publicMembershipPlanSchema,type MembershipPlansResult,type PublicMembershipPlan} from './foundation/membershipPlanContracts';
const cursorSchema=z.discriminatedUnion('selection',[
 z.strictObject({version:z.literal(1),binding:z.string().regex(/^[a-f0-9]{64}$/),selection:z.literal('all'),key:z.tuple([z.literal('active'),z.number().finite(),z.number().finite(),z.string().min(1).max(256)])}),
 z.strictObject({version:z.literal(1),binding:z.string().regex(/^[a-f0-9]{64}$/),selection:z.literal('selected'),offset:z.number().int().min(1).max(12)}),
]);
/** Public catalog projection: no grants, entitlement codes, linked roles, or benefit metadata. */
export async function readMembershipPlans(ctx:QueryCtx,rawArgs:unknown,scope:DataScope,documentId:string,budget=new RequestReadLedger()):Promise<MembershipPlansResult>{
 const args=membershipPlansArgsSchema.parse(rawArgs);
 const binding=sha256Hex(stableKey({scope,documentId,selection:args.selection,plans:args.plans,limit:args.limit}));
 const cursor=args.cursor===null?null:cursorSchema.parse(JSON.parse(args.cursor));
 if(cursor&&(cursor.binding!==binding||cursor.selection!==args.selection))throw new CanonicalDataError('MEMBERSHIP_CURSOR_SCOPE','cursor','Membership cursor belongs to another document, selection or environment');
 const empty=()=>({items:[],cursor:args.cursor,nextCursor:null});
 if(!await isPluginEnabled(ctx,'membership',budget))return empty();
 const project=async(plan:Doc<'membership_plans'>|null):Promise<PublicMembershipPlan|null>=>{
  if(!plan||plan.status!=='active')return null;
  const rows:Doc<'membership_plan_benefits'>[]=[];
  // Absent flags are public by the Membership extension's existing convention.
  // Separate index ranges exclude private benefit metadata before materializing it.
  for(const displayAsFeature of [undefined,true]){
   budget.beforeRead();const page=await ctx.db.query('membership_plan_benefits').withIndex('by_plan_display_feature',q=>q.eq('planId',plan._id).eq('displayAsFeature',displayAsFeature)).take(65);
   for(const row of page)rows.push(budget.record(row));
   if(rows.length>64)throw new CanonicalDataError('MEMBERSHIP_BENEFIT_BUDGET','benefits','Membership plan exceeds 64 displayed benefits; no partial card is returned');
  }
  rows.sort((a,b)=>a._creationTime-b._creationTime||(a._id<b._id?-1:a._id>b._id?1:0));
  return publicMembershipPlanSchema.parse({id:plan._id,title:plan.title,description:plan.description??'',benefits:rows.map(b=>({id:b._id,label:b.label,description:b.description??''}))});
 };
 const items:PublicMembershipPlan[]=[];let nextCursor:string|null=null;
 if(args.selection==='selected'){
  let offset=cursor?.selection==='selected'?cursor.offset:0;
  if(offset>args.plans.length)throw new CanonicalDataError('MEMBERSHIP_CURSOR_RANGE','cursor','Selected membership cursor is outside the selection');
  for(;offset<args.plans.length;offset++){
   if(items.length===args.limit){nextCursor=JSON.stringify({version:1,binding,selection:'selected',offset});break;}
   const id=ctx.db.normalizeId('membership_plans',args.plans[offset]);if(!id)continue;
   budget.beforeRead();const item=await project(budget.record(await ctx.db.get('membership_plans',id)));if(item)items.push(item);
  }
 }else{
  if(cursor?.selection==='all'&&!ctx.db.normalizeId('membership_plans',cursor.key[3]))throw new CanonicalDataError('MEMBERSHIP_CURSOR_RANGE','cursor','Membership cursor has an invalid plan identity');
  const iterator=streamQuery(ctx,{schema,table:'membership_plans',index:'by_status_priority',order:'asc',startIndexKey:cursor?.selection==='all'?cursor.key:['active'],startInclusive:cursor===null,endIndexKey:['active'],endInclusive:true});
  let lastKey:IndexKey|null=null;
  try{while(true){
   budget.beforeRead();const next=await iterator.next();if(next.done)break;
   const [plan,key]=next.value;budget.record(plan);
   if(items.length===args.limit){if(lastKey)nextCursor=JSON.stringify({version:1,binding,selection:'all',key:lastKey});break;}
   const item=await project(plan);if(item)items.push(item);lastKey=key;
  }}finally{await iterator.return(undefined);}
 }
 return membershipPlansResultSchema.parse({items,cursor:args.cursor,nextCursor});
}
