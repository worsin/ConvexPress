import {expect,test} from 'bun:test';
import {exportSyncedPromotionClosure,importSyncedPromotionClosure,parseSyncedPromotionClosure} from './syncedPromotion';
import {syncedContentDigest,type SyncedRequest} from './syncedContent';

const scope={websiteKey:'site',instanceKey:'staging',deploymentOrigin:'https://source.convex.cloud'};
const target={...scope,instanceKey:'live',deploymentOrigin:'https://target.convex.cloud'};
const text=(id='text')=>({id,name:'core/paragraph',version:2,attrs:{}});
const shared=(id:string,source:string,revision:number|'latest')=>({id,name:'core/synced',version:1,attrs:{syncedBlock:source,revisionPolicy:revision==='latest'?'latest':'pinned',...(revision==='latest'?{}:{revision})}});
const version=(id:string,revision:number,blocks:unknown[])=>({id,revision,title:`${id} revision ${revision}`,blocks,scope,published:true as const,digest:syncedContentDigest(`${id} revision ${revision}`,blocks)});
function fixture(){
 const versions=[version('inner',6,[text('old')]),version('inner',8,[text('new')]),version('parent',2,[shared('latest','inner','latest'),shared('pinned','inner',6)])];
 const heads=new Map([['inner',{id:'inner',generation:20,publishedRevision:8,scope}],['parent',{id:'parent',generation:3,publishedRevision:2,scope}]]);
 const calls:SyncedRequest[]=[];
 const read=async(request:SyncedRequest)=>{calls.push(request);const source=heads.get(request.id);const revision=versions.find(v=>v.id===request.id&&v.revision===(request.revisionPolicy==='latest'?source?.publishedRevision:request.revision));return source&&revision?{source,revision}:null;};
 return{versions,heads,calls,read};
}
const unused=async()=>{throw Error('unexpected ordinary dependency');};
test('nested latest and pinned content transfers to different IDs and revision numbers',async()=>{
 const f=fixture(),original=[{key:'page:studio',blocks:[shared('collection','parent','latest')]}],before=structuredClone(original);
 const exported=await exportSyncedPromotionClosure(original,scope,f.read,unused);
 expect(original).toEqual(before);expect(exported.sources).toHaveLength(2);
 expect(exported.sources.find(s=>s.key==='@promotion:synced:inner')?.revisions.map(r=>r.revision)).toEqual([6,8]);
 expect(new Set(f.calls.map(c=>JSON.stringify(c))).size).toBe(f.calls.length);
 const imported=await importSyncedPromotionClosure(exported,target,[
  {key:'@promotion:synced:inner',id:'target-inner',revisions:[{source:6,target:11},{source:8,target:13}]},
  {key:'@promotion:synced:parent',id:'target-parent',revisions:[{source:2,target:4}]},
 ],unused);
 expect(imported.documents[0].blocks[0].attrs).toEqual({syncedBlock:'target-parent',revisionPolicy:'latest'});
 const parent=imported.sources.find(s=>s.id==='target-parent')!;
 expect(parent.publishedRevision).toBe(4);expect(parent.revisions[0].blocks[1].attrs).toEqual({syncedBlock:'target-inner',revisionPolicy:'pinned',revision:11});
 expect(parent.revisions[0].digest).toBe(syncedContentDigest(parent.revisions[0].title,parent.revisions[0].blocks));
 expect(imported.sources.find(s=>s.id==='target-inner')?.publishedRevision).toBe(13);
});
test('a pinned-only placement carries the current publication as well as the pinned revision',async()=>{
 const f=fixture(),value=await exportSyncedPromotionClosure([{key:'page:pin',blocks:[shared('pin','inner',6)]}],scope,f.read,unused);
 expect(value.sources[0].publishedRevision).toBe(8);expect(value.sources[0].revisions.map(r=>r.revision)).toEqual([6,8]);
});
test('missing, withdrawn, foreign and corrupted revisions are refused',async()=>{
 for(const kind of ['missing','foreign','corrupt','unpublished'] as const){
  const f=fixture();const read=async(r:SyncedRequest)=>{const result=await f.read(r);if(!result||kind==='missing')return null;if(kind==='foreign')return{...result,source:{...result.source,scope:target}};if(kind==='corrupt')return{...result,revision:{...result.revision,digest:'0'.repeat(64)}};return{...result,revision:{...result.revision,published:false}};};
  await expect(exportSyncedPromotionClosure([{key:'page',blocks:[shared('pin','inner',6)]}],scope,read,unused)).rejects.toBeDefined();
 }
});
test('cycles and mutable source heads fail before transfer',async()=>{
 const f=fixture();f.versions[2]=version('parent',2,[shared('cycle','parent','latest')]);
 await expect(exportSyncedPromotionClosure([{key:'page',blocks:[shared('ref','parent','latest')]}],scope,f.read,unused)).rejects.toBeDefined();
 const g=fixture();let reads=0;
 await expect(exportSyncedPromotionClosure([{key:'page',blocks:[shared('a','inner',6)]}],scope,async r=>{const result=await g.read(r);return result?{...result,source:{...result.source,generation:++reads}}:null;},unused)).rejects.toBeDefined();
});
test('ordinary resources inside old and current revisions are remapped once and aliases are rejected',async()=>{
 const f=fixture(),featured=(page:string)=>({id:'featured',name:'core/featured-page',version:1,attrs:{page,ctaLabel:'Read more'}});
 f.versions[0]=version('inner',6,[featured('source-page')]);f.versions[1]=version('inner',8,[featured('source-page')]);
 const exports:string[]=[];const value=await exportSyncedPromotionClosure([{key:'page',blocks:[shared('a','inner',6)]}],scope,f.read,async r=>{exports.push(r.value);return '@promotion:page:shared';});
 expect(exports).toEqual(['source-page']);const imports:string[]=[];
 const imported=await importSyncedPromotionClosure(value,target,[{key:'@promotion:synced:inner',id:'target-inner',revisions:[{source:6,target:2},{source:8,target:3}]}],async r=>{imports.push(r.key);return 'target-page';});
 expect(imports).toEqual(['@promotion:page:shared']);expect(imported.sources[0].revisions.every(v=>v.blocks[0].attrs.page==='target-page')).toBe(true);
 f.versions[1]=version('inner',8,[featured('different-page')]);
 await expect(exportSyncedPromotionClosure([{key:'page',blocks:[shared('a','inner',6)]}],scope,f.read,async()=> '@promotion:page:alias')).rejects.toMatchObject({code:'SYNCED_PROMOTION_REFERENCE'});
});
test('one product can be referenced by ID and slug across reusable revisions',async()=>{
 const f=fixture();
 f.versions[0]=version('inner',6,[{id:'product',name:'commerce/product-hero',version:1,attrs:{product:'source-product-id'}}]);
 f.versions[1]=version('inner',8,[{id:'products',name:'commerce/product-showcase',version:2,attrs:{source:'slugs',productSlugs:['source-product-slug']}}]);
 const value=await exportSyncedPromotionClosure([{key:'page',blocks:[shared('a','inner',6)]}],scope,f.read,async()=> '@promotion:product:one');
 const imported=await importSyncedPromotionClosure(value,target,[{key:'@promotion:synced:inner',id:'target-inner',revisions:[{source:6,target:1},{source:8,target:2}]}],async r=>r.storage==='id'?'target-product-id':'target-product-slug');
 expect(imported.sources[0].revisions[0].blocks[0].attrs.product).toBe('target-product-id');
 expect(imported.sources[0].revisions[1].blocks[0].attrs.productSlugs).toEqual(['target-product-slug']);
});
test('parser rejects missing pins, orphan revisions and cycles before any target resolver runs',async()=>{
 const f=fixture(),value=await exportSyncedPromotionClosure([{key:'page',blocks:[shared('a','inner',6)]}],scope,f.read,unused);
 const missing=structuredClone(value);missing.sources[0].revisions=missing.sources[0].revisions.filter(r=>r.revision!==6);
 expect(()=>parseSyncedPromotionClosure(missing)).toThrow();
 const extra=structuredClone(value);extra.sources[0].revisions.push({...extra.sources[0].revisions[0],revision:7});
 expect(()=>parseSyncedPromotionClosure(extra)).toThrow();
 const cycle=structuredClone(value);cycle.sources[0].revisions[0].tree=cycle.documents[0].tree;
 expect(()=>parseSyncedPromotionClosure(cycle)).toThrow();
});
test('a latest read cannot disagree with its head even if that head revision was read pinned',async()=>{
 const f=fixture();
 await expect(exportSyncedPromotionClosure([{key:'page',blocks:[shared('a','inner',8)]}],scope,async r=>{const value=await f.read(r);return value&&r.revisionPolicy==='latest'?{...value,revision:f.versions[0]}:value;},unused)).rejects.toMatchObject({code:'SYNCED_PROMOTION_CHANGED'});
});
test('published closure discovery includes new dependencies reached only through the current publication',async()=>{
 const f=fixture();f.versions[1]=version('inner',8,[shared('nested','new-source','latest')]);
 f.heads.set('new-source',{id:'new-source',generation:1,publishedRevision:1,scope});f.versions.push(version('new-source',1,[text()]));
 const value=await exportSyncedPromotionClosure([{key:'page',blocks:[shared('pin','inner',6)]}],scope,f.read,unused);
 expect(value.sources.map(s=>s.key)).toEqual(['@promotion:synced:inner','@promotion:synced:new-source']);
});
test('selection limits and unsafe bindings are rejected without database or resolver writes',async()=>{
 const f=fixture();let reads=0;
 await expect(exportSyncedPromotionClosure([{key:'page',blocks:[text()],extra:'x'.repeat(500_001)}],scope,async r=>{reads++;return f.read(r);},unused)).rejects.toMatchObject({code:'SYNCED_PROMOTION_BUDGET'});expect(reads).toBe(0);
 await expect(exportSyncedPromotionClosure([{key:'same',blocks:[text()]},{key:'same',blocks:[text()]}],scope,f.read,unused)).rejects.toMatchObject({code:'SYNCED_PROMOTION_DUPLICATE'});
 const value=await exportSyncedPromotionClosure([{key:'page',blocks:[shared('ref','parent','latest')]}],scope,f.read,unused);
 await expect(importSyncedPromotionClosure(value,target,[{key:'@promotion:synced:inner',id:'duplicate',revisions:[{source:6,target:1},{source:8,target:2}]},{key:'@promotion:synced:parent',id:'duplicate',revisions:[{source:2,target:1}]}],unused)).rejects.toMatchObject({code:'SYNCED_PROMOTION_BINDING'});
});
test('import requires exact, injective revision coverage and cannot carry runtime fields',async()=>{
 const f=fixture(),value=await exportSyncedPromotionClosure([{key:'page',blocks:[shared('a','inner',6)]}],scope,f.read,unused);
 const binding={key:'@promotion:synced:inner',id:'target-inner',revisions:[{source:6,target:1},{source:8,target:2}]};
 for(const bindings of [[],[{...binding,revisions:[{source:6,target:1}]}],[{...binding,revisions:[{source:6,target:1},{source:8,target:1}]}],[binding,{...binding,key:'unknown'}]]){
  await expect(importSyncedPromotionClosure(value,target,bindings,unused)).rejects.toBeDefined();
 }
 const malformed=structuredClone(value) as any;malformed.sources[0].authority={token:'must-never-transfer'};
 expect(()=>parseSyncedPromotionClosure(malformed)).toThrow();
 await expect(importSyncedPromotionClosure(value,scope,[binding],unused)).rejects.toBeDefined();
});
