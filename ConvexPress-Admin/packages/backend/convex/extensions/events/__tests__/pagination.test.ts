import { expect, test } from "bun:test";
import { commerceHarness } from "../../../commerce/__tests__/handlerHarness.test-support";
import { upcoming } from "../queries";
// Model the provider's cursor/query fingerprint invariant around the real
// registered handler. The generic harness does not reject changed index ranges.
function fixture() {
 const ctx=commerceHarness({settings:[{_id:'plugins',section:'plugins',values:{eventsEnabled:true}}],extension_events:[
  {_id:'past',title:'Past',slug:'past',description:'Past',startsAt:10,endsAt:20,status:'published'},
  {_id:'first',title:'First',slug:'first',description:'Original',startsAt:100_100,endsAt:100_200,status:'published'},
  {_id:'second',title:'Second',slug:'second',description:'Next',startsAt:200_100,endsAt:200_200,status:'published'},
  {_id:'draft',title:'Draft',slug:'draft',description:'Private',startsAt:200_100,endsAt:200_200,status:'draft'},
 ]},null);
 const query=ctx.db.query;
 ctx.db.query=(table:string)=>{
  const base=query(table);if(table!=='extension_events')return base;
  const bounds:unknown[]=[];let wrapper:any;
  wrapper={...base,withIndex(name:string,fn:any){bounds.push(name);base.withIndex(name,(index:any)=>{let tracked:any;tracked=new Proxy(index,{get(target,key){const value=target[key];return typeof value==='function'?(...args:any[])=>{bounds.push([key,...args]);value(...args);return tracked;}:value;}});return fn(tracked);});return wrapper;},order(direction:string){base.order(direction);return wrapper;},async paginate(options:any){
   const signature=JSON.stringify(bounds);
   const decode=(cursor:string|null|undefined)=>cursor?JSON.parse(cursor):null;
   for(const cursor of [options.cursor,options.endCursor])if(cursor&&decode(cursor).signature!==signature)throw Error('InvalidCursor: different query');
   const page=await base.paginate({...options,cursor:decode(options.cursor)?.offset??null});
   return {...page,continueCursor:JSON.stringify({signature,offset:page.continueCursor})};
  }};return wrapper;
 };
 return ctx;
}
const run=(ctx:any,args:any)=>(upcoming as any)._handler(ctx,args);
test('anchored reactive edits and later pages retain their index fingerprint as time advances',async()=>{
 const ctx=fixture(), original=Date.now;let now=100_000;Date.now=()=>now;
 try{
  const args={startsAtOrAfter:100_000,paginationOpts:{numItems:1,cursor:null}};
  const first=await run(ctx,args);expect(first.page[0]._id).toBe('first');
  now+=5_000;ctx.tables.extension_events[1].description='Edited live';
  const replay=await run(ctx,{...args,paginationOpts:{...args.paginationOpts,endCursor:first.continueCursor}});
  expect(replay.page[0].description).toBe('Edited live');
  const next=await run(ctx,{...args,paginationOpts:{numItems:1,cursor:first.continueCursor}});
  expect(next.page[0]._id).toBe('second');expect(next.page.some((event:any)=>event._id==='draft')).toBe(false);
 }finally{Date.now=original;}
});
test('legacy unanchored subscriptions use a stable bounded range and filter expired events after pagination',async()=>{
 const ctx=fixture(),original=Date.now;let now=100_000;Date.now=()=>now;
 try{
  const args={paginationOpts:{numItems:2,cursor:null}};
  const first=await run(ctx,args);expect(first.page.map((event:any)=>event._id)).toEqual(['first']);
  now+=5_000;
  const replay=await run(ctx,{paginationOpts:{...args.paginationOpts,endCursor:first.continueCursor}});
  expect(replay.page).toEqual([]);expect(replay.isDone).toBe(false);
  const next=await run(ctx,{paginationOpts:{numItems:2,cursor:first.continueCursor}});
  expect(next.page.map((event:any)=>event._id)).toEqual(['second']);
 }finally{Date.now=original;}
});
