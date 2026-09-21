"use node";

import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference, type RegisteredAction } from "convex/server";
import { v, type Infer } from "convex/values";
import { action, type ActionCtx } from "../_generated/server";
import { boundedSiteFetch, exchangeBrokerSession } from "./review";
import type { BrokerTarget } from "./policy";

const argsValidator = v.object({
  sourceConnectionId: v.id("overseer_connections"), targetConnectionId: v.id("overseer_connections"),
  kind: v.union(v.literal("pageIds"), v.literal("postIds"), v.literal("menuIds"), v.literal("mediaIds"), v.literal("eventIds"), v.literal("productIds"), v.literal("productCategoryIds"), v.literal("courseIds"), v.literal("planIds")),
  page: v.number(), cursor: v.union(v.string(), v.null()),
});
type Args = Infer<typeof argsValidator>;
const resultValidator = v.object({ items: v.array(v.object({id:v.string(),title:v.string(),detail:v.string()})), more:v.boolean(), next:v.object({page:v.number(),cursor:v.union(v.string(),v.null())}) });
type Result = Infer<typeof resultValidator>;
type Pair = {source:BrokerTarget;target:BrokerTarget;authorityHash:string};
const pairRef = makeFunctionReference<"query",Pick<Args,"sourceConnectionId"|"targetConnectionId">,Pair>("contentPromotion/records:catalogPair");
function record(value: unknown): Record<string,unknown> {
  if (!value || typeof value!=="object" || Array.isArray(value)) throw Error("Invalid catalog response");
  return value as Record<string,unknown>;
}
function rows(value:unknown):unknown[] {
  if(!Array.isArray(value)||value.length>1000)throw Error("Catalog response exceeds its limit");
  return value;
}
function candidates(values:unknown[]):Result["items"] {
  const selected = new Map<string,Result["items"][number]>();
  for(const item of values) {
    const value=record(item), id=value._id??value.id;
    if(["trash","trashed","auto-draft","future"].includes(String(value.status)))continue;
    const title=[value.title,value.name,value.originalFilename,value.fileName,value.filename,value.slug].find(v=>typeof v==="string"&&v.trim());
    if(typeof id!=="string"||id.length<1||id.length>200||typeof title!=="string"||title.length>2000)throw Error("Invalid catalog item");
    const detail=[value.slug,value.status].filter((v):v is string=>typeof v==="string").join(" · ");
    if(detail.length>2000)throw Error("Invalid catalog item");
    selected.set(id,{id,title,detail});
  }
  return [...selected.values()];
}
export type CatalogTransport = (source:BrokerTarget,token:string,path:string,args:Record<string,unknown>)=>Promise<unknown>;
const transport:CatalogTransport=async(source,token,path,args)=>{
  const client=new ConvexHttpClient(source.identity.deploymentOrigin,{auth:token,logger:false,fetch:boundedSiteFetch(source.identity.deploymentOrigin)});
  try{return await client.query(makeFunctionReference<"query",Record<string,unknown>,unknown>(path),args);}
  finally{client.clearAuth();}
};
export async function runCatalog(ctx:ActionCtx,args:Args,read:CatalogTransport=transport):Promise<Result> {
  if(!Number.isSafeInteger(args.page)||args.page<1||args.page>10000||(args.cursor!==null&&args.cursor.length>4000))throw Error("Invalid catalog position");
  const pairArgs={sourceConnectionId:args.sourceConnectionId,targetConnectionId:args.targetConnectionId};
  const pair=await ctx.runQuery(pairRef,pairArgs), session=await exchangeBrokerSession(ctx,pair.source);
  const query=(path:string,values:Record<string,unknown>)=>read(pair.source,session.token,path,values);
  let result:Result;
  const paginationOpts={numItems:25,cursor:args.cursor};
  if(args.kind==="pageIds"||args.kind==="postIds"||args.kind==="productIds") {
    if(args.cursor!==null)throw Error("Invalid catalog position");
    const products=args.kind==="productIds";
    const value=record(await query(products?"commerce/products:list":"posts/queries:list",{...(products?{}:{type:args.kind==="pageIds"?"page":"post"}),page:args.page,perPage:25}));
    if(!Number.isSafeInteger(value.totalPages)||Number(value.totalPages)<0)throw Error("Invalid catalog pagination");
    const page=rows(value[products?"items":"posts"]);if(page.length>25)throw Error("Invalid catalog page");
    result={items:candidates(page),more:args.page<Number(value.totalPages),next:{page:args.page+1,cursor:null}};
  } else if(args.kind==="mediaIds"||args.kind==="eventIds") {
    const media=args.kind==="mediaIds";
    const value=record(await query(media?"media/queries:list":"extensions/events/queries:list",{paginationOpts,...(media?{status:"active",trashView:"active"}:{})}));
    if(value.pageStatus==="SplitRequired"||typeof value.isDone!=="boolean"||typeof value.continueCursor!=="string"||value.continueCursor.length>4000)throw Error("Incomplete catalog page");
    const page=rows(value.page);if(page.length>25)throw Error("Invalid catalog page");
    result={items:candidates(page),more:!value.isDone,next:{page:1,cursor:value.continueCursor}};
  } else {
    if(args.cursor!==null)throw Error("Invalid catalog position");
    const path=args.kind==="menuIds"?"menus/queries:listMenus":args.kind==="productCategoryIds"?"commerce/categories:list":args.kind==="courseIds"?"lms/courses/queries:list":"membership/queries:listPublicPlans";
    const all=candidates(rows(await query(path,args.kind==="productCategoryIds"?{includeHidden:true}:{})));
    const start=(args.page-1)*25;
    result={items:all.slice(start,start+25),more:start+25<all.length,next:{page:args.page+1,cursor:null}};
  }
  if(JSON.stringify(result).includes(session.token))throw Error("Session material appeared in catalog response");
  const current=await ctx.runQuery(pairRef,pairArgs);
  if(current.authorityHash!==pair.authorityHash)throw Error("Catalog authority changed");
  return result;
}
export const list:RegisteredAction<"public",Args,Promise<Result>>=action({args:argsValidator.fields,returns:resultValidator,handler:async(ctx,args)=>{
  try{return await runCatalog(ctx,args);}catch{throw Error("Content could not be loaded. Check the connection, permissions, and content plugin.");}
}});
