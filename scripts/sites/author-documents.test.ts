import { expect, test } from 'bun:test';
import { authorDocuments } from './author-documents';
const target = { origin: 'http://127.0.0.1:9000', websiteKey: 'studio-example', instanceKey: 'studio-staging', environmentKind: 'staging' };
const recipe = { id: 'core', documents: [{key:'home',type:'page',title:'Studio home',slug:'studio-home',blocks:[{id:'copy',name:'core/paragraph',version:2,attrs:{body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Original authored copy'}]}]}}}]}] };
function fixture() {
  const rows: any[] = [], calls: any[] = [], snapshots: any[] = [];
  let identity = {...target}, fail: string | null = null;
  const api = {
    async identity() { return identity; },
    async find(type: string, slug: string) { return rows.find(r=>r.type===type && r.slug===slug) ?? null; },
    async read(id: string) { return structuredClone(rows.find(r=>r.id===id)); },
    async mutate(name: string, args: any) {
      calls.push({name,args});
      if (fail===name) throw new Error('Connection lost; outcome unknown');
      if(name==='canonicalDocuments:create') { const row={id:'owned-'+rows.length,type:args.type,title:args.title,slug:args.title.toLowerCase().replaceAll(' ','-'),revision:1,blocks:[],status:'draft'}; rows.push(row); return {postId:row.id,revision:1}; }
      const row=rows.find(r=>r.id===args.postId);
      if(row.revision!==args.expectedRevision) throw new Error('CONFLICT');
      if(name==='canonicalDocuments:updateMetadata') row.slug=args.slug;
      if(name==='canonicalDocuments:save') {row.title=args.title;row.blocks=args.blocks;}
      row.revision++;return {postId:row.id,revision:row.revision};
    },
  };
  const journal: any = {version:1,operations:[],documents:{}};
  const run = () => authorDocuments({recipe,target,api,journal,persist:async (value:any)=>{snapshots.push(structuredClone(value));}});
  return {rows,calls,snapshots,journal,run,setIdentity:(value:any)=>identity=value,setFailure:(value:string|null)=>fail=value};
}
test('authors canonical drafts, verifies values, and reruns without adding revisions',async()=>{
 const f=fixture();const result=await f.run();expect(result.stage).toBe('documents-authored');expect(result.siteComplete).toBe(false);
 expect(f.rows[0].blocks).toEqual(recipe.documents[0].blocks);expect(f.rows[0].status).toBe('draft');
 const count=f.calls.length,revision=f.rows[0].revision;await f.run();expect(f.calls).toHaveLength(count);expect(f.rows[0].revision).toBe(revision);
 expect(f.snapshots.some(s=>s.operations.some((op:any)=>op.state==='pending'))).toBe(true);
});
test('checks target identity before writes and refuses production',async()=>{
 for(const change of [{websiteKey:'another-client'},{instanceKey:'live'},{environmentKind:'production'}]){
  const f=fixture();f.setIdentity({...target,...change});await expect(f.run()).rejects.toThrow();expect(f.calls).toHaveLength(0);
 }
});
test('preflights routes and never adopts existing content',async()=>{
 const f=fixture();f.rows.push({id:'user-page',type:'page',slug:'studio-home',title:'User content',revision:7});
 await expect(f.run()).rejects.toThrow('ROUTE_OCCUPIED');expect(f.calls).toHaveLength(0);expect(f.rows[0].revision).toBe(7);
});
test('uncertain create cannot be blindly retried',async()=>{
 const f=fixture();f.setFailure('canonicalDocuments:create');await expect(f.run()).rejects.toThrow();
 const count=f.calls.length;f.setFailure(null);await expect(f.run()).rejects.toThrow('UNCONFIRMED_WRITE');expect(f.calls).toHaveLength(count);
});
test('preserves edits to owned documents instead of overwriting on rerun',async()=>{
 const f=fixture();await f.run();f.rows[0].revision++;f.rows[0].title='Owner edited';const count=f.calls.length;
 await expect(f.run()).rejects.toThrow('OWNED_DOCUMENT_CHANGED');expect(f.calls).toHaveLength(count);expect(f.rows[0].title).toBe('Owner edited');
});
test('refuses receipt fingerprint changes',async()=>{
 const f=fixture();await f.run();const count=f.calls.length;f.journal.recipeDigest='changed';
 await expect(f.run()).rejects.toThrow('RECEIPT_MISMATCH');expect(f.calls).toHaveLength(count);
});
test('a lost save response preserves acknowledged creation without replay',async()=>{
 const f=fixture();f.setFailure('canonicalDocuments:save');await expect(f.run()).rejects.toThrow();
 expect(f.journal.documents.home.id).toBe('owned-0');expect(f.journal.operations[0].state).toBe('acknowledged');
 f.setFailure(null);await expect(f.run()).rejects.toThrow('UNCONFIRMED_WRITE');
 expect(f.calls.filter(c=>c.name==='canonicalDocuments:create')).toHaveLength(1);
});
test('rejects a foreign-target receipt even when recipe content matches',async()=>{
 const f=fixture();await f.run();f.journal.target.instanceKey='another-instance';const count=f.calls.length;
 await expect(f.run()).rejects.toThrow('RECEIPT_MISMATCH');expect(f.calls).toHaveLength(count);
});
test('invalid receipt phase cannot masquerade as completed authoring',async()=>{
 const f=fixture();await f.run();f.journal.documents.home.phase='unknown';
 await expect(f.run()).rejects.toThrow('INVALID_RECEIPT');
});
test('cannot create when persisting intent fails',async()=>{
 const f=fixture();let writes=0;
 const api={identity:async()=>target,find:async()=>null,read:async()=>null,mutate:async()=>{writes++;return {postId:'new',revision:1};}};
 await expect(authorDocuments({recipe,target,api,journal:f.journal,persist:async()=>{throw Error('Disk full');}})).rejects.toThrow('Disk full');
 expect(writes).toBe(0);
});
