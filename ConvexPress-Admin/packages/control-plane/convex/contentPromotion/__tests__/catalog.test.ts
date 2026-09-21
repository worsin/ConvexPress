import {expect,test} from "bun:test";
import type {ActionCtx} from "../../_generated/server";
import {fixture} from "./harness";
import {catalogPair} from "../records";
import {runCatalog, type CatalogTransport} from "../catalog";
import {assertPromotionIdentity} from "../policy";
import {CURRENT_SITE_CONTRACT_VERSION} from "@convexpress/site-contract";
import {sourceStorageUrl,targetStorageUploadUrl} from "../mediaTransferProtocol";

async function setup() {
  const f=await fixture();
  const ctx={...f.context,runQuery:async(_ref:unknown,args:unknown)=>f.invoke(catalogPair,args)} as ActionCtx;
  const args={sourceConnectionId:f.ids.source.connection,targetConnectionId:f.ids.target.connection,kind:"pageIds" as const,page:1,cursor:null};
  return {...f,ctx,catalogArgs:args};
}
test("controller catalog returns only bounded display fields and rechecks authority",async()=>{
  const f=await setup();let reads=0;
  const data=await runCatalog(f.ctx,f.catalogArgs,async(source,token,path,args)=>{
    reads++;expect(source.connectionId).toBe(f.ids.source.connection);expect(token).toBe("opaque-source-session-secret");expect(path).toBe("posts/queries:list");expect(args).toEqual({type:"page",page:1,perPage:25});
    return {posts:[{_id:"page",title:"Staging content",slug:"content",status:"publish",authorEmail:"private@example.test",body:"private",token},{_id:"trash",title:"Deleted",status:"trash"}],totalPages:2};
  });
  expect(data).toEqual({items:[{id:"page",title:"Staging content",detail:"content · publish"}],more:true,next:{page:2,cursor:null}});
  expect(reads).toBe(1);expect(JSON.stringify(data)).not.toContain("private");expect(JSON.stringify(data)).not.toContain("secret");
});
test("unauthorized and changed connections do not return catalog content",async()=>{
  const f=await setup();let reads=0;
  const denied={...f.ctx,runQuery:async(_ref:unknown,args:unknown)=>f.invoke(catalogPair,args,f.ids.other)} as ActionCtx;
  await expect(runCatalog(denied,f.catalogArgs,async()=>{reads++;return null;})).rejects.toThrow();expect(reads).toBe(0);
  await expect(runCatalog(f.ctx,f.catalogArgs,async()=>{
    await f.t.run(ctx=>ctx.db.patch(f.ids.source.connection,{isActive:false,status:"revoked"}));
    return {posts:[{_id:"page",title:"No longer authorized"}],totalPages:1};
  })).rejects.toThrow();
});
test("catalog rejects invalid positions, oversized results, bad pagination, and reflected session tokens",async()=>{
  const f=await setup();
  for(const page of [0,1.5,10001,Infinity])await expect(runCatalog(f.ctx,{...f.catalogArgs,page},async()=>{throw Error("Unexpected network");})).rejects.toThrow("position");
  for(const response of [{posts:[],totalPages:"1"},{posts:Array.from({length:26},(_,i)=>({_id:String(i),title:"Page"})),totalPages:1},{posts:[{_id:"x",title:"opaque-source-session-secret"}],totalPages:1}])await expect(runCatalog(f.ctx,f.catalogArgs,async()=>response)).rejects.toThrow();
});
test("all supported catalog kinds use fixed queries and bounded display pages",async()=>{
  const f=await setup();
  for(const [kind,path] of [["postIds","posts/queries:list"],["productIds","commerce/products:list"],["mediaIds","media/queries:list"],["eventIds","extensions/events/queries:list"],["menuIds","menus/queries:listMenus"],["productCategoryIds","commerce/categories:list"],["courseIds","lms/courses/queries:list"],["planIds","membership/queries:listPublicPlans"]] as const){
    const read:CatalogTransport=async(_source,_token,actual)=>{
      expect(actual).toBe(path);const values=[{_id:"item",name:"Item"}];
      if(kind==="postIds")return {posts:values,totalPages:1};
      if(kind==="productIds")return {items:values,totalPages:1};
      if(kind==="mediaIds"||kind==="eventIds")return {page:values,isDone:true,continueCursor:"done"};
      return values;
    };
    expect((await runCatalog(f.ctx,{...f.catalogArgs,kind},read)).items).toEqual([{id:"item",title:"Item",detail:""}]);
  }
  await expect(runCatalog(f.ctx,{...f.catalogArgs,kind:"mediaIds"},async()=>({page:[],isDone:false,continueCursor:"next",pageStatus:"SplitRequired"}))).rejects.toThrow("Incomplete");
});
test("registered self-hosted promotion transport preserves exact origin and version checks",async()=>{
  const identity={deploymentOrigin:"http://192.168.1.246:4860",managementOrigin:"http://192.168.1.246:4861",siteOrigin:"http://192.168.1.246:4861",siteContractVersion:CURRENT_SITE_CONTRACT_VERSION,schemaVersion:"1",compatibility:"compatible",provisioning:"ready"};
  expect(()=>assertPromotionIdentity(identity)).not.toThrow();
  for(const origin of ["file:///tmp/db","http://user:pass@192.168.1.246:4860","http://192.168.1.246:4860/path","http://192.168.1.246:4860?x=1","http://192.168.1.246:4860/"])expect(()=>assertPromotionIdentity({...identity,deploymentOrigin:origin})).toThrow();
  expect(()=>assertPromotionIdentity({...identity,deploymentOrigin:"https://example.convex.cloud",managementOrigin:identity.managementOrigin})).toThrow();
  expect(()=>assertPromotionIdentity({...identity,provisioning:"error"})).toThrow();
  expect(sourceStorageUrl(identity.deploymentOrigin+"/api/storage/file",identity.deploymentOrigin)).toBe(identity.deploymentOrigin+"/api/storage/file");
  expect(targetStorageUploadUrl(identity.deploymentOrigin+"/api/storage/upload?token=opaque",identity.deploymentOrigin)).toContain("/api/storage/upload?");
  expect(()=>sourceStorageUrl("http://192.168.1.246:4870/api/storage/file",identity.deploymentOrigin)).toThrow();
  const f=await setup();
  await f.t.run(ctx=>ctx.db.patch(f.ids.source.instance,{deploymentOrigin:identity.deploymentOrigin,managementOrigin:identity.managementOrigin}));
  const data=await runCatalog(f.ctx,f.catalogArgs,async(source)=>{expect(source.identity.deploymentOrigin).toBe(identity.deploymentOrigin);return {posts:[],totalPages:0};});
  expect(data.items).toEqual([]);
});
