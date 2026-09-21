import {expect,test} from "bun:test";
import {canonicalContentDigest} from "../block-data/portable/documentContracts";
import {resolveCanonicalData} from "../block-data/portable/resolve";
import {validateCanonicalTree} from "../block-data/portable/generated/instances";
import {readPublicDisplay} from "./display-state";
import {subscribeCatalogDisplay} from "./catalog-continuation";
import type {PublicReadState} from "./subscription";
const scope={websiteKey:"site",instanceKey:"stage"};
const binding={documentId:"page",instanceKey:"stage",viewerSubject:null,generation:"viewer-one"};
const blocks=validateCanonicalTree([{id:"tiles",name:"commerce/category-tiles",version:2,attrs:{}}]);
const policy={enabledPlugins:["commerce"],capabilities:["viewer.authorization"],disabledBlocks:[]};
async function result(cursor:string|null,nextCursor:string|null){
 const request:Record<string,string>=cursor?{tiles:cursor}:{};
 const data=await resolveCanonicalData(blocks,scope,policy,async()=>null,undefined,undefined,undefined,request,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,async()=>({items:[],state:nextCursor?"counting":"ready",cursor,nextCursor}));
 return {contract:"canonical-public-document-v1",state:"ready",viewerSubject:null,scope,accessLease:{evaluatedAt:Date.now(),expiresAt:Date.now()+60000},
 document:{id:"page",type:"page",title:"Collections",path:"/collections",blocksVersion:2,revision:1,blocks,digest:canonicalContentDigest("Collections",blocks)},
 presentation:{packId:"core",revision:"a".repeat(64)},policy,data,resources:{media:{}}};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
test("host follows exact count requests automatically and retains the final live subscription",async()=>{
 const responses=[await result(null,"one"),await result("one","two"),await result("two",null)];
 readPublicDisplay(responses[0],binding);
 const requested:unknown[]=[];const stopped:number[]=[];const seen:PublicReadState[]=[];const callbacks:Array<()=>void>=[];
 const stop=subscribeCatalogDisplay(request=>{const index=requested.length;requested.push(request);return {localQueryResult:()=>responses[index],onUpdate(callback){callbacks.push(callback);return()=>{stopped.push(index);};}};},binding,state=>seen.push(state),()=>{});
 await tick();expect(requested).toEqual([{}, {tiles:"one"},{tiles:"two"}]);expect(stopped).toEqual([0,1]);
 expect(seen).toHaveLength(3);callbacks[0]!();expect(seen).toHaveLength(3);
 stop();expect(stopped).toEqual([0,1,2]);callbacks[2]!();expect(seen).toHaveLength(3);
});
test("unmount cancels queued continuation; wrong viewer or request cannot start another chunk",async()=>{
 const value=await result(null,"one");let reads=0;const seen:PublicReadState[]=[];
 const watch=()=>{reads++;return {localQueryResult:()=>value,onUpdate:()=>()=>{}};};
 const stop=subscribeCatalogDisplay(watch,binding,state=>seen.push(state),()=>{});stop();await tick();expect(reads).toBe(1);
 const wrong=subscribeCatalogDisplay(watch,{...binding,viewerSubject:"another"},state=>seen.push(state),()=>{});await tick();expect(seen.at(-1)).toEqual({error:true});expect(reads).toBe(2);wrong();
 const other=subscribeCatalogDisplay(watch,{...binding,request:{tiles:"different"}},state=>seen.push(state),()=>{});await tick();expect(seen.at(-1)).toEqual({error:true});expect(reads).toBe(3);other();
});
