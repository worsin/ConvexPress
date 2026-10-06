import {test,expect} from "bun:test";
import {productHistoryKey,parseProductHistory,readProductHistory,recordProductVisit,PRODUCT_HISTORY_MAX_AGE} from "./product-history";
function storage(){const data=new Map<string,string>();return {data,getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}};}
const scope={backendUrl:"https://site.convex.cloud",instanceKey:"staging",viewerKey:"anonymous"};
test("browser history keys separate backend, environment and signed-in visitor, and reject unsafe scope",()=>{
 const key=productHistoryKey(scope)!;
 expect(productHistoryKey({...scope,backendUrl:scope.backendUrl+"/"})).toBe(key);
 for(const other of [{backendUrl:"https://other.convex.cloud"},{instanceKey:"production"},{viewerKey:"user:alice"},{viewerKey:"user:bob"}])expect(productHistoryKey({...scope,...other})).not.toBe(key);
 expect(productHistoryKey({...scope,instanceKey:""})).toBeNull();expect(productHistoryKey({...scope,backendUrl:"javascript:alert(1)"})).toBeNull();expect(productHistoryKey({...scope,backendUrl:"https://user:secret@site.convex.cloud"})).toBeNull();
});
test("real visits keep latest unique order, cap48 and never alter another site or account",()=>{
 const s=storage(),key=productHistoryKey(scope)!,other=productHistoryKey({...scope,viewerKey:"user:alice"})!;
 for(let i=0;i<60;i++) expect(recordProductVisit(s,key,`product-${i}`,1000+i)).toBe(true);
 expect(readProductHistory(s,key,1060)).toHaveLength(48);expect(readProductHistory(s,key,1060)[0]?.id).toBe("product-59");
 recordProductVisit(s,key,"product-20",1061);expect(readProductHistory(s,key,1061).slice(0,2).map(v=>v.id)).toEqual(["product-20","product-59"]);
 expect(readProductHistory(s,other,1061)).toEqual([]);expect(s.data.size).toBe(1);
});
test("expired malformed oversized and inaccessible storage do not break browsing or surface stale visits",()=>{
 const now=PRODUCT_HISTORY_MAX_AGE+1000;
 const raw=JSON.stringify({version:1,visits:[{id:"expired",viewedAt:1},{id:"valid",viewedAt:now},{id:"valid",viewedAt:now-1},{id:"far-future",viewedAt:now+400000},{id:"invalid space",viewedAt:now}]});
 expect(parseProductHistory(raw,now)).toEqual([{id:"valid",viewedAt:now}]);
 for(const bad of ["{",JSON.stringify({version:2,visits:[]}),"x".repeat(20001),JSON.stringify({version:1,visits:Array(49).fill({id:"x",viewedAt:now})})])expect(parseProductHistory(bad,now)).toEqual([]);
 const denied={getItem:()=>{throw Error("denied");},setItem:()=>{throw Error("denied");},removeItem:()=>{throw Error("denied");}};
 expect(readProductHistory(denied,"key",now)).toEqual([]);expect(recordProductVisit(denied,"key","product",now)).toBe(false);
});


test("pending and changing authentication cannot fall through to anonymous history", async () => {
 const {productHistoryScope}=await import("./product-history");
 const ready={backendUrl:"https://fixture.convex.cloud",instanceKey:"stage",loaded:true,signedIn:true,userId:"a",backendLoading:false,backendAuthenticated:true};
 expect(productHistoryScope(ready)).toContain("user:a");
 for(const change of [{loaded:false},{backendLoading:true},{backendAuthenticated:false},{userId:null},{signedIn:false}]) expect(productHistoryScope({...ready,...change})).toBeNull();
 expect(productHistoryScope({...ready,signedIn:false,userId:null,backendAuthenticated:false})).toContain("anonymous");
});


test("operator history cannot read or write the customer or anonymous bucket",async()=>{
 const {productHistoryScope}=await import('./product-history');
 const identity={backendUrl:scope.backendUrl,instanceKey:'stage',loaded:true,signedIn:true,userId:'same-subject',backendLoading:false,backendAuthenticated:true};
 const customer=productHistoryScope(identity)!,operator=productHistoryScope({...identity,viewerKind:'operator'})!;
 expect(operator).not.toBe(customer);expect(operator).toContain('operator:same-subject');
 const store=storage();recordProductVisit(store,customer,'customer-product');recordProductVisit(store,operator,'operator-product');
 expect(readProductHistory(store,customer).map(v=>v.id)).toEqual(['customer-product']);
 expect(readProductHistory(store,operator).map(v=>v.id)).toEqual(['operator-product']);
 expect(productHistoryScope({...identity,viewerKind:'operator',backendAuthenticated:false})).toBeNull();
});
