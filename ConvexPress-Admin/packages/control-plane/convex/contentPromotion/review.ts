"use node";
import { reviewResultValidator } from "./validators";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { z } from "zod";
import { action, type ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { ContentPromotionManifest } from "@convexpress/site-contract/content-promotion";
import { requestSchema, siteReviewSchema, validateExport, safeFailureCode, type BrokerRequest, type BrokerTarget } from "./policy";
import type { publicReceipt } from "./records";

type Summary = ReturnType<typeof publicReceipt>;
type BeginResult = {receiptId:Id<"overseer_contentPromotionReviews">;execute:boolean;source:BrokerTarget;target:BrokerTarget};
const beginRef=makeFunctionReference<"mutation",{sourceConnectionId:Id<"overseer_connections">;targetConnectionId:Id<"overseer_connections">;requestJson:string},BeginResult>("contentPromotion/records:begin");
const finishRef=makeFunctionReference<"mutation",{receiptId:Id<"overseer_contentPromotionReviews">;manifestJson:string;reviewJson:string},null>("contentPromotion/records:finish");
const failRef=makeFunctionReference<"mutation",{receiptId:Id<"overseer_contentPromotionReviews">;failureCode:string},null>("contentPromotion/records:failReview");
const getRef=makeFunctionReference<"query",{receiptId:Id<"overseer_contentPromotionReviews">},Summary>("contentPromotion/records:get");
const exchangeRef=makeFunctionReference<"action",{connectionId:Id<"overseer_connections">;requestedCapabilities:string[];requestedSiteRole:"administrator"},unknown>("siteBroker/session:exchange");
const exportRef=makeFunctionReference<"query",{target:BrokerTarget["identity"];selection:BrokerRequest["selection"]},unknown>("contentPromotion/operations:exportManifest");
const dryRunRef=makeFunctionReference<"mutation",{manifest:ContentPromotionManifest;mediaBindings:BrokerRequest["mediaBindings"];dependencyBindings:BrokerRequest["dependencyBindings"]},unknown>("contentPromotion/operations:dryRun");
const sessionSchema=z.object({token:z.string().min(1).max(20_000),websiteKey:z.string(),instanceKey:z.string(),siteOrigin:z.string(),capabilities:z.array(z.string()).max(100),siteRole:z.string(),siteCapabilities:z.array(z.string()).max(2000),expiresAt:z.number()}).strict();

export function boundedSiteFetch(origin: string, fetcher:typeof fetch=fetch):typeof fetch {
  return async (input,init) => {
    const url=new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if(url.origin!==origin || !["/api/query","/api/mutation"].includes(url.pathname)) throw new Error("Unexpected site API transport");
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15_000);
    try {
      const response=await fetcher(input,{...init,redirect:"error",signal:controller.signal});
      const reader=response.body?.getReader();if(!reader)throw new Error("Empty site response");
      const chunks:Uint8Array[]=[];let size=0;
      while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>2_000_000){await reader.cancel();throw new Error("Site response exceeds review bound");}chunks.push(chunk.value);}
      const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}
      return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
    } finally {clearTimeout(timer);}
  };
}
export interface ReviewTransport {
  export(target:BrokerTarget,token:string,request:BrokerRequest,destination:BrokerTarget):Promise<unknown>;
  dryRun(target:BrokerTarget,token:string,manifest:ContentPromotionManifest,request:BrokerRequest):Promise<unknown>;
}
const transport:ReviewTransport={
  export:async(source,token,request,target)=>new ConvexHttpClient(source.identity.deploymentOrigin,{auth:token,logger:false,fetch:boundedSiteFetch(source.identity.deploymentOrigin)}).query(exportRef,{target:target.identity,selection:request.selection}),
  dryRun:async(target,token,manifest,request)=>new ConvexHttpClient(target.identity.deploymentOrigin,{auth:token,logger:false,fetch:boundedSiteFetch(target.identity.deploymentOrigin)}).mutation(dryRunRef,{manifest,mediaBindings:request.mediaBindings,dependencyBindings:request.dependencyBindings}),
};
export async function exchangeBrokerSession(ctx: ActionCtx, target: BrokerTarget) {
      const result=sessionSchema.parse(await ctx.runAction(exchangeRef,{connectionId:target.connectionId as Id<"overseer_connections">,requestedCapabilities:["session.exchange","site.select","site.promote"],requestedSiteRole:"administrator"}));
      if(result.websiteKey!==target.identity.websiteKey || result.instanceKey!==target.identity.instanceKey || result.siteOrigin!==target.identity.siteOrigin || result.siteRole!=="administrator" || !result.siteCapabilities.includes("manage_options") || result.expiresAt<=Date.now()+10_000 || !["session.exchange","site.select","site.promote"].every(capability=>result.capabilities.includes(capability)))throw new Error("Site session identity mismatch");
      return result;
    }
/** Only preview operations live here. This module deliberately has no apply transport. */
export async function runReview(ctx:ActionCtx,args:{sourceConnectionId:Id<"overseer_connections">;targetConnectionId:Id<"overseer_connections">;requestJson:string},remote:ReviewTransport=transport):Promise<Summary> {
  if(new TextEncoder().encode(args.requestJson).length>100_000)throw new Error("Review request is too large");
  const request=requestSchema.parse(JSON.parse(args.requestJson));
  const started=await ctx.runMutation(beginRef,{...args,requestJson:JSON.stringify(request)});
  if(!started.execute)return ctx.runQuery(getRef,{receiptId:started.receiptId});
  try {

    const sourceSession=await exchangeBrokerSession(ctx,started.source),targetSession=await exchangeBrokerSession(ctx,started.target);
    const manifest=validateExport(await remote.export(started.source,sourceSession.token,request,started.target),started.source,started.target);
    if ([sourceSession.token,targetSession.token].some(token=>JSON.stringify(manifest).includes(token))) throw new Error("Session material appeared in source content");
    const review=siteReviewSchema.parse(await remote.dryRun(started.target,targetSession.token,manifest,request));
    const manifestJson=JSON.stringify(manifest),reviewJson=JSON.stringify(review);
    if([sourceSession.token,targetSession.token].some(token=>manifestJson.includes(token)||reviewJson.includes(token)))throw new Error("Session material appeared in a site response");
    await ctx.runMutation(finishRef,{receiptId:started.receiptId,manifestJson,reviewJson});
  } catch (error) {
    try {await ctx.runMutation(failRef,{receiptId:started.receiptId,failureCode:safeFailureCode(error)});} catch {throw new Error("Promotion review authority changed");}
  }
  return ctx.runQuery(getRef,{receiptId:started.receiptId});
}
export const preview=action({args:{sourceConnectionId:v.id("overseer_connections"),targetConnectionId:v.id("overseer_connections"),requestKey:v.string(),selection:v.object({pageIds:v.array(v.string()),postIds:v.array(v.string()),menuIds:v.array(v.string()),mediaIds:v.array(v.string()),eventIds:v.array(v.string()),productIds:v.optional(v.array(v.string())),productCategoryIds:v.optional(v.array(v.string())),productTagIds:v.optional(v.array(v.string())),courseIds:v.optional(v.array(v.string())),planIds:v.optional(v.array(v.string())),includePresentation:v.boolean(),includeRoutePolicies:v.optional(v.boolean())}),mediaBindings:v.array(v.object({key:v.string(),storageId:v.string()})),dependencyBindings:v.array(v.object({key:v.string(),targetId:v.string()}))},returns:reviewResultValidator,handler:async(ctx,args)=>{const {sourceConnectionId,targetConnectionId,...request}=args;return runReview(ctx,{sourceConnectionId,targetConnectionId,requestJson:JSON.stringify(request)});}});
