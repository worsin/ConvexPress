import { getFunctionName } from "convex/server";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { begin, finish, failReview, get } from "../records";
import type { ReviewTransport } from "../review";
import { CURRENT_SITE_CONTRACT_VERSION } from "@convexpress/site-contract";
import { hash } from "../policy";
import { promotionReviewedRecords } from '@convexpress/site-contract/content-promotion';
export const modules={"./convex/_generated/server.js":()=>import("../../_generated/server.js")};
export function addReusableTransfer(f: {remote: ReviewTransport}) {
 const original=f.remote.export;
 f.remote.export=async(...args)=>{
  const result=await original(...args) as {manifest:import('@convexpress/site-contract/content-promotion').ContentPromotionManifest;downloadUrls:Array<{key:string;url:string}>};
  const m=result.manifest;
  m.records[0].data={...m.records[0].data,blocksVersion:2,contentMode:'blocks',canonical:{contract:'canonical-promotion-tree-v1',blocks:[{id:'shared',name:'core/synced',version:1,attrs:{syncedBlock:'promotion-reference-0',revisionPolicy:'latest'}}],references:[{blockId:'shared',path:['syncedBlock'],kind:'syncedBlock',storage:'id',key:'@promotion:synced:source-shared'}]}};
  m.synced={contract:'synced-promotion-closure-v1',scope:{websiteKey:m.source.websiteKey,instanceKey:m.source.instanceKey,deploymentOrigin:m.source.deploymentOrigin},sources:[{key:'@promotion:synced:source-shared',generation:3,publishedRevision:2,revisions:[{revision:2,title:'Shared studio section',tree:{contract:'canonical-promotion-tree-v1',blocks:[{id:'text',name:'core/paragraph',version:2,attrs:{}}],references:[]}}]}]};
  return result;
 };
 f.remote.dryRun=async(_target,_token,manifest)=>({ready:true,digest:hash(manifest),receiptId:'site-review',issues:[],changes:promotionReviewedRecords(manifest).map(r=>({key:r.key,kind:r.kind,targetId:null,beforeRevision:hash(null),fields:Object.keys(r.data)}))});
}
export async function fixture() {
  const t=convexTest({schema,modules});
  const ids=await t.run(async ctx=>{
    const operator=await ctx.db.insert("overseer_users",{role:"owner",authUserId:"auth-owner",isActive:true,createdAt:1});
    const other=await ctx.db.insert("overseer_users",{role:"member",authUserId:"auth-other",isActive:true,createdAt:1});
    const organization=await ctx.db.insert("overseer_organizations",{name:"Aster",slug:"aster",isActive:true,createdAt:1,updatedAt:1});
    const business=await ctx.db.insert("overseer_businesses",{organizationId:organization,name:"Aster",slug:"aster",isActive:true,order:0,createdAt:1,updatedAt:1});
    const stamps={organization_id:organization,business_id:business};
    const website=await ctx.db.insert("overseer_websites",{...stamps,websiteKey:"aster",engine:"convexpress",title:"Aster",primaryDomain:"aster.example",status:"active",createdAt:1,updatedAt:1});
    async function environment(kind:"staging"|"live") {
      const instance=await ctx.db.insert("overseer_websiteInstances",{...stamps,website_id:website,instanceKey:`aster:${kind}`,kind,deploymentOrigin:`https://aster-${kind}.convex.cloud`,managementOrigin:`https://aster-${kind}.convex.site`,siteOrigin:`https://${kind}.aster.example`,siteContractVersion:CURRENT_SITE_CONTRACT_VERSION,schemaVersion:"1",compatibility:"compatible",provisioning:"ready",health:"ok",status:"active",createdAt:1,updatedAt:1});
      const connection=await ctx.db.insert("overseer_connections",{...stamps,website_id:website,instance_id:instance,owner_id:String(operator),name:kind,serviceId:"convexpress",provider:"convexpress",track:"native",status:"connected",isActive:true,credentials:{encrypted:"encrypted-fixture",iv:"fixture",authTag:"fixture",version:1},createdAt:1,updatedAt:1});
      await ctx.db.patch(instance,{connection_id:connection});return {instance,connection};
    }
    return {operator,other,website,organization,source:await environment("staging"),target:await environment("live")};
  });
  const invoke=(fn:any,args:any,operator=ids.operator)=>t.run(async ctx=>{
    const user=(await ctx.db.get(operator))!;
    return fn._handler({...ctx,auth:{getUserIdentity:async()=>({subject:user.authUserId,sessionId:"fixture-session"})},runQuery:async(_ref:any,args:any)=>args.model==="session"?{_id:"fixture-session",expiresAt:Date.now()+60_000}:{_id:user.authUserId,userId:String(user._id)}},args);
  });
  const request={requestKey:"aster-review-1",selection:{pageIds:["source-page"],postIds:[],menuIds:[],mediaIds:[],eventIds:[],includePresentation:false},mediaBindings:[],dependencyBindings:[]};
  const args={sourceConnectionId:ids.source.connection,targetConnectionId:ids.target.connection,requestJson:JSON.stringify(request)};
  const calls:string[]=[];
  const context:any={runMutation:async(ref:any,args:any)=>{const name=getFunctionName(ref);calls.push(name);return invoke(name.endsWith(":begin")?begin:name.endsWith(":finish")?finish:failReview,args);},runQuery:async(_ref:any,args:any)=>invoke(get,args),runAction:async(_ref:any,args:any)=>{calls.push("siteBroker/session:exchange");const isSource=args.connectionId===ids.source.connection;return {token:isSource?"opaque-source-session-secret":"opaque-target-session-secret",websiteKey:"aster",instanceKey:`aster:${isSource?"staging":"live"}`,siteOrigin:`https://${isSource?"staging":"live"}.aster.example`,capabilities:args.requestedCapabilities,siteRole:"administrator",siteCapabilities:["manage_options"],expiresAt:Date.now()+60_000};}};
  const remote:ReviewTransport={export:async(source,_token,request,target)=>({manifest:{version:1,source:{...source.identity},target:{...target.identity},selection:structuredClone(request.selection),records:[{key:"page:source-page",kind:"page",sourceRevision:"revision-1",data:{title:"Aster",slug:"aster",status:"publish",visibility:"public",commentStatus:"closed"}}],dependencies:[],issues:[]},downloadUrls:[]}),dryRun:async(_target,_token,manifest)=>({ready:true,digest:hash(manifest),receiptId:"site-review",issues:[],changes:manifest.records.map(r=>({key:r.key,kind:r.kind,targetId:null,beforeRevision:hash(null),fields:Object.keys(r.data)}))})};
  return {t,ids,invoke,args,request,calls,context,remote};
}
