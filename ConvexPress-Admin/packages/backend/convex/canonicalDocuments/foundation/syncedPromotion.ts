import {z} from 'zod';
import {validateCanonicalTree} from './generated/instances';
import type {CanonicalTree} from './generated/types';
import {canonicalJson,sha256Hex} from './shared/fingerprints';
import {resolveSyncedContent,resolveSyncedContentSnapshot,syncedContentDigest,syncedScopeSchema,type SyncedScope,type SyncedRequest,type SyncedRevision} from './syncedContent';
import {exportCanonicalPromotionTree,importCanonicalPromotionTree,parseCanonicalPromotionTree,type CanonicalReference,type PromotionReference,type PortableCanonicalTree} from './promotionTree';

/** The database adapters still own authorization, target allocation, policy,
 * transactional writes and receipts. This codec never publishes or writes. */
export const SYNCED_PROMOTION_LIMITS=Object.freeze({records:100,reads:64,bytes:500_000});
export class SyncedPromotionError extends Error {
  constructor(public readonly code:string,message:string){super(message);this.name='SyncedPromotionError';}
}
function fail(code:string,message:string):never{throw new SyncedPromotionError(code,message);}
const key=z.string().min(1).max(512).regex(/^[^\u0000-\u001f\u007f]+$/u);
const id=z.string().min(1).max(256);
const revision=z.number().int().min(1).max(1_000_000);
const title=z.string().min(1).max(512);
const headSchema=z.strictObject({id,generation:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),publishedRevision:revision,scope:syncedScopeSchema});
type Head=z.infer<typeof headSchema>;
const sourceKey=(value:string)=>`@promotion:synced:${value}`;
const revisionKey=(value:string,number:number)=>JSON.stringify([value,number]);
const documentSchema=z.strictObject({key,blocks:z.unknown()});
const portableVersionSchema=z.strictObject({revision,title,tree:z.unknown()});
const portableSourceSchema=z.strictObject({key,generation:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),publishedRevision:revision,revisions:z.array(portableVersionSchema).min(1).max(100)});
const portableSchema=z.strictObject({contract:z.literal('synced-promotion-closure-v1'),scope:syncedScopeSchema,documents:z.array(z.strictObject({key,tree:z.unknown()})).min(1).max(100),sources:z.array(portableSourceSchema).max(100)});
type PortableVersion={revision:number;title:string;tree:PortableCanonicalTree};
export type SyncedPromotionClosure={contract:'synced-promotion-closure-v1';scope:SyncedScope;documents:Array<{key:string;tree:PortableCanonicalTree}>;sources:Array<{key:string;generation:number;publishedRevision:number;revisions:PortableVersion[]}>};
function bytes(value:unknown):number{
  let text:string|undefined;try{text=JSON.stringify(value);}catch{fail('SYNCED_PROMOTION_INVALID','Expected serializable authored content.');}
  if(text===undefined)fail('SYNCED_PROMOTION_INVALID','Expected serializable authored content.');
  return new TextEncoder().encode(text).length;
}
function bounded(value:unknown){if(bytes(value)>SYNCED_PROMOTION_LIMITS.bytes)fail('SYNCED_PROMOTION_BUDGET','Split the authored selection into smaller promotion units.');}
function countRecords(documents:number,sources:number,versions:number){if(documents+sources+versions>SYNCED_PROMOTION_LIMITS.records)fail('SYNCED_PROMOTION_BUDGET','The reusable content closure exceeds the promotion record limit.');}
function sameScope(a:SyncedScope,b:SyncedScope){return a.websiteKey===b.websiteKey&&a.instanceKey===b.instanceKey&&a.deploymentOrigin===b.deploymentOrigin;}
function unique(values:readonly(string|number)[],code:string){if(new Set(values).size!==values.length)fail(code,'Duplicate promotion identity.');}

/** Capture required pinned revisions AND every encountered source's current
 * publication. This matters even when a page uses that source only pinned.
 * The reader must use one database snapshot and enforce source read access. */
export async function exportSyncedPromotionClosure(
  input:unknown,installation:SyncedScope,
  read:(request:SyncedRequest)=>Promise<unknown>,
  resolve:(reference:CanonicalReference)=>Promise<string>,
):Promise<SyncedPromotionClosure>{
  bounded(input);const scope=syncedScopeSchema.parse(installation);
  const documents=z.array(documentSchema).min(1).max(100).parse(input).map(d=>({...d,blocks:validateCanonicalTree(d.blocks)}));
  unique(documents.map(d=>d.key),'SYNCED_PROMOTION_DUPLICATE');
  const heads=new Map<string,Head>(),versions=new Map<string,SyncedRevision>(),cache=new Map<string,unknown>();
  let reads=0,readBytes=bytes(documents);
  const stableRead=async(request:SyncedRequest):Promise<unknown>=>{
    const cacheKey=canonicalJson(request);if(cache.has(cacheKey))return cache.get(cacheKey);
    if(++reads>SYNCED_PROMOTION_LIMITS.reads)fail('SYNCED_PROMOTION_BUDGET','Too many reusable source reads in one promotion.');
    const raw=await read({...request});if(raw===null){cache.set(cacheKey,null);return null;}
    readBytes+=bytes(raw);if(readBytes>SYNCED_PROMOTION_LIMITS.bytes)fail('SYNCED_PROMOTION_BUDGET','Reusable source reads exceed the promotion byte budget.');
    const pair=z.strictObject({source:headSchema,revision:z.unknown()}).parse(raw),head=pair.source;
    if(head.id!==request.id||!sameScope(head.scope,scope))fail('SYNCED_PROMOTION_SCOPE','A reusable source belongs to another installation.');
    if(request.revisionPolicy==='latest'&&z.object({revision}).parse(pair.revision).revision!==head.publishedRevision)fail('SYNCED_PROMOTION_CHANGED','The latest revision does not match its publication pointer.');
    const prior=heads.get(head.id);if(prior&&canonicalJson(prior)!==canonicalJson(head))fail('SYNCED_PROMOTION_CHANGED','A reusable source changed during export.');
    heads.set(head.id,head);cache.set(cacheKey,pair.revision);return pair.revision;
  };
  const visit=async(tree:CanonicalTree)=>{
    const graph=await resolveSyncedContent(tree,scope,stableRead,{requireAvailable:true});
    for(const version of graph.revisions){
      const vk=revisionKey(version.id,version.revision),prior=versions.get(vk);
      if(prior&&prior.digest!==version.digest)fail('SYNCED_PROMOTION_CHANGED','An immutable reusable revision changed during export.');
      versions.set(vk,version);
    }
    countRecords(documents.length,heads.size,versions.size);
  };
  for(const document of documents)await visit(document.blocks);
  // Map iteration includes newly discovered heads. One visit per source closes
  // over publications reached only through a pinned revision's dependencies.
  for(const head of heads.values()){
    await visit(validateCanonicalTree([{id:'publication',name:'core/synced',version:1,attrs:{syncedBlock:head.id,revisionPolicy:'latest'}}]));
    if(!versions.has(revisionKey(head.id,head.publishedRevision)))fail('SYNCED_PROMOTION_CHANGED','The current publication does not match its source head.');
  }
  const resolved=new Map<string,string>(),meanings=new Map<string,string>();
  const referenceKey=async(reference:CanonicalReference)=>{
    const meaning=canonicalJson([reference.kind,reference.storage,reference.value]);
    const prior=resolved.get(meaning);if(prior)return prior;
    let result:string;
    if(reference.kind==='syncedBlock'){
      if(reference.storage!=='id'||!heads.has(reference.value))fail('SYNCED_PROMOTION_REFERENCE','Missing reusable source dependency.');
      result=sourceKey(reference.value);
    }else result=await resolve(reference);
    key.parse(result);
    if(reference.kind!=='syncedBlock'&&result.startsWith('@promotion:synced:'))fail('SYNCED_PROMOTION_REFERENCE','Ordinary dependencies cannot use reusable source keys.');
    const identity=canonicalJson([result,reference.storage]);
    const priorMeaning=meanings.get(identity);if(priorMeaning&&priorMeaning!==meaning)fail('SYNCED_PROMOTION_REFERENCE','Distinct dependencies cannot share one promotion key and storage type.');
    meanings.set(identity,meaning);resolved.set(meaning,result);return result;
  };
  const exportedDocuments=[];
  for(const document of [...documents].sort((a,b)=>a.key.localeCompare(b.key)))exportedDocuments.push({key:document.key,tree:await exportCanonicalPromotionTree(document.blocks,referenceKey)});
  const sources:SyncedPromotionClosure['sources']=[];
  for(const head of [...heads.values()].sort((a,b)=>a.id.localeCompare(b.id))){
    const revisions:PortableVersion[]=[];
    for(const version of [...versions.values()].filter(v=>v.id===head.id).sort((a,b)=>a.revision-b.revision))revisions.push({revision:version.revision,title:version.title,tree:await exportCanonicalPromotionTree(version.blocks,referenceKey)});
    sources.push({key:sourceKey(head.id),generation:head.generation,publishedRevision:head.publishedRevision,revisions});
  }
  return parseSyncedPromotionClosure({contract:'synced-promotion-closure-v1',scope,documents:exportedDocuments,sources});
}

/** Treat every transport field as untrusted. Reconstruct reference locations
 * from the catalog and validate graph completeness before target allocation. */
export function parseSyncedPromotionClosure(input:unknown):SyncedPromotionClosure{
  bounded(input);const raw=portableSchema.parse(input);
  const result:SyncedPromotionClosure={...raw,documents:raw.documents.map(d=>({...d,tree:parseCanonicalPromotionTree(d.tree)})),sources:raw.sources.map(s=>({...s,revisions:s.revisions.map(v=>({...v,tree:parseCanonicalPromotionTree(v.tree)}))}))};
  unique(result.documents.map(d=>d.key),'SYNCED_PROMOTION_DUPLICATE');unique(result.sources.map(s=>s.key),'SYNCED_PROMOTION_DUPLICATE');
  countRecords(result.documents.length,result.sources.length,result.sources.reduce((n,s)=>n+s.revisions.length,0));
  const sources=new Map(result.sources.map(s=>[s.key,s]));
  for(const source of result.sources){
    if(!source.key.startsWith('@promotion:synced:'))fail('SYNCED_PROMOTION_REFERENCE','Invalid reusable source key.');
    unique(source.revisions.map(v=>v.revision),'SYNCED_PROMOTION_DUPLICATE');
    if(!source.revisions.some(v=>v.revision===source.publishedRevision))fail('SYNCED_PROMOTION_REFERENCE','The current publication is missing.');
  }
  const meanings=new Map<string,string>();
  for(const tree of [...result.documents.map(d=>d.tree),...result.sources.flatMap(s=>s.revisions.map(v=>v.tree))]){
    for(const reference of tree.references){
      const meaning=reference.kind,prior=meanings.get(reference.key);
      if(prior&&prior!==meaning)fail('SYNCED_PROMOTION_REFERENCE','A dependency key has conflicting meanings.');
      meanings.set(reference.key,meaning);
      if(reference.kind==='syncedBlock'&&(!sources.has(reference.key)||reference.storage!=='id'))fail('SYNCED_PROMOTION_REFERENCE','The reusable dependency closure is incomplete.');
      if(reference.kind!=='syncedBlock'&&reference.key.startsWith('@promotion:synced:'))fail('SYNCED_PROMOTION_REFERENCE','Reusable source keys cannot identify ordinary resources.');
    }
  }
  validatePortableGraph(result);
  return result;
}

/** Give reusable keys temporary, bounded identities to validate the entire
 * graph before any destination IDs or revisions are allocated. Ordinary
 * resources remain transport placeholders and are never resolved here. */
function validatePortableGraph(closure:SyncedPromotionClosure):void{
  const sourceIds=new Map(closure.sources.map(s=>[s.key,sha256Hex(s.key)]));
  const rewrite=(tree:PortableCanonicalTree):CanonicalTree=>{
    const blocks=validateCanonicalTree(tree.blocks),references=new Map(tree.references.filter(r=>r.kind==='syncedBlock').map(r=>[r.blockId,r.key]));
    const visit=(nodes:CanonicalTree)=>{for(const node of nodes){if(node.name==='core/synced'){
      const source=references.get(node.id);if(!source)fail('SYNCED_PROMOTION_REFERENCE','Select a reusable source before promoting.');
      node.attrs.syncedBlock=sourceIds.get(source)!;
    }if(node.children)visit(node.children);}};visit(blocks);return blocks;
  };
  const sources=new Map(closure.sources.map(s=>[sourceIds.get(s.key)!,{...s,revisions:s.revisions.map(v=>({...v,blocks:rewrite(v.tree)}))}]));
  const usedSources=new Set<string>(),usedVersions=new Set<string>();
  const read=(request:SyncedRequest)=>{
    const source=sources.get(request.id),value=source?.revisions.find(v=>v.revision===(request.revisionPolicy==='latest'?source.publishedRevision:request.revision));
    if(!source||!value)return null;
    usedSources.add(request.id);usedVersions.add(revisionKey(request.id,value.revision));
    return{id:request.id,revision:value.revision,title:value.title,blocks:value.blocks,scope:closure.scope,published:true,digest:syncedContentDigest(value.title,value.blocks)};
  };
  for(const document of closure.documents)resolveSyncedContentSnapshot(rewrite(document.tree),closure.scope,read,{requireAvailable:true});
  for(const source of usedSources)resolveSyncedContentSnapshot([{id:'publication',name:'core/synced',version:1,attrs:{syncedBlock:source,revisionPolicy:'latest'}}],closure.scope,read,{requireAvailable:true});
  if(usedSources.size!==sources.size||usedVersions.size!==closure.sources.reduce((n,s)=>n+s.revisions.length,0))fail('SYNCED_PROMOTION_REFERENCE','The transfer contains reusable content outside the selected dependency closure.');
}

const targetBindingSchema=z.strictObject({key,id,revisions:z.array(z.strictObject({source:revision,target:revision})).min(1).max(100)});
export type SyncedPromotionTargetBinding=z.infer<typeof targetBindingSchema>;
type ImportedSource={key:string;id:string;publishedRevision:number;revisions:Array<{revision:number;title:string;blocks:CanonicalTree;digest:string}>};
/** Import is a pure rewrite using reviewed target-owned identities. It does not
 * choose destination records, reuse revision numbers or copy source authority. */
export async function importSyncedPromotionClosure(input:unknown,installation:SyncedScope,rawBindings:unknown,resolve:(reference:PromotionReference)=>Promise<string>):Promise<{documents:Array<{key:string;blocks:CanonicalTree}>;sources:ImportedSource[];digest:string}>{
  const closure=parseSyncedPromotionClosure(input),scope=syncedScopeSchema.parse(installation);
  if(closure.scope.websiteKey!==scope.websiteKey||closure.scope.instanceKey===scope.instanceKey||closure.scope.deploymentOrigin===scope.deploymentOrigin)fail('SYNCED_PROMOTION_SCOPE','Promotion requires distinct environments of the same website.');
  bounded(rawBindings);const bindings=z.array(targetBindingSchema).max(100).parse(rawBindings);
  unique(bindings.map(b=>b.key),'SYNCED_PROMOTION_BINDING');unique(bindings.map(b=>b.id),'SYNCED_PROMOTION_BINDING');
  if(bindings.length!==closure.sources.length)fail('SYNCED_PROMOTION_BINDING','Every reusable source requires exactly one destination mapping.');
  const mapped=new Map(bindings.map(b=>[b.key,b]));
  for(const source of closure.sources){
    const binding=mapped.get(source.key);if(!binding)fail('SYNCED_PROMOTION_BINDING','A reusable source mapping is missing.');
    unique(binding.revisions.map(r=>r.source),'SYNCED_PROMOTION_BINDING');unique(binding.revisions.map(r=>r.target),'SYNCED_PROMOTION_BINDING');
    if(binding.revisions.length!==source.revisions.length||source.revisions.some(v=>!binding.revisions.some(r=>r.source===v.revision)))fail('SYNCED_PROMOTION_BINDING','The reviewed revision mappings must cover the exact closure.');
  }
  const targetVersion=(sourceKey:string,value:number)=>{
    const result=mapped.get(sourceKey)?.revisions.find(r=>r.source===value)?.target;
    if(result===undefined)fail('SYNCED_PROMOTION_BINDING','A pinned destination revision is missing.');return result;
  };
  const resourceCache=new Map<string,string>();
  const importTree=async(tree:PortableCanonicalTree)=>{
    const blocks=await importCanonicalPromotionTree(tree,async reference=>{
      if(reference.kind==='syncedBlock')return mapped.get(reference.key)!.id;
      const cacheKey=canonicalJson([reference.key,reference.kind,reference.storage]);let result=resourceCache.get(cacheKey);
      if(result===undefined){result=await resolve(reference);resourceCache.set(cacheKey,result);}return result;
    });
    const sourceKeys=new Map(tree.references.filter(r=>r.kind==='syncedBlock').map(r=>[r.blockId,r.key]));
    const visit=(nodes:CanonicalTree)=>{for(const node of nodes){if(node.name==='core/synced'&&node.attrs.revisionPolicy==='pinned')node.attrs.revision=targetVersion(sourceKeys.get(node.id)!,node.attrs.revision!);if(node.children)visit(node.children);}};
    visit(blocks);return validateCanonicalTree(blocks);
  };
  const documents=[],sources:ImportedSource[]=[];
  for(const document of closure.documents)documents.push({key:document.key,blocks:await importTree(document.tree)});
  for(const source of closure.sources){
    const revisions:ImportedSource['revisions']=[];
    for(const version of source.revisions){const blocks=await importTree(version.tree);revisions.push({revision:targetVersion(source.key,version.revision),title:version.title,blocks,digest:syncedContentDigest(version.title,blocks)});}
    sources.push({key:source.key,id:mapped.get(source.key)!.id,publishedRevision:targetVersion(source.key,source.publishedRevision),revisions});
  }
  const read=(request:SyncedRequest)=>{const source=sources.find(s=>s.id===request.id),value=source?.revisions.find(v=>v.revision===(request.revisionPolicy==='latest'?source.publishedRevision:request.revision));return source&&value?{...value,id:source.id,scope,published:true}:null;};
  for(const document of documents)resolveSyncedContentSnapshot(document.blocks,scope,read,{requireAvailable:true});
  for(const source of sources)for(const version of source.revisions)resolveSyncedContentSnapshot([{id:'destination-review',name:'core/synced',version:1,attrs:{syncedBlock:source.id,revisionPolicy:'pinned',revision:version.revision}}],scope,read,{requireAvailable:true});
  const result={documents,sources};bounded(result);return {...result,digest:sha256Hex(canonicalJson(result))};
}
