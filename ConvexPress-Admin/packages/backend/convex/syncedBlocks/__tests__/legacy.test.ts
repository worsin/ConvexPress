import {expect,test} from 'bun:test';
import {migrateLegacyDocument} from '../../canonicalDocuments/foundation/legacyDocumentMigration';

test('legacy reusable references retain shared identity instead of flattening text',()=>{
 const source=JSON.stringify({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Before'}]},{type:'reusableBlock',attrs:{blockId:'old-source'}},{type:'paragraph',content:[{type:'text',text:'After'}]}]});
 const blocks=migrateLegacyDocument({postId:'old-page',content:source,reusableSources:new Map([['old-source','target-source']])});
 expect(blocks.map(b=>b.name)).toEqual(['core/paragraph','core/synced','core/paragraph']);
 expect(blocks[1].attrs).toMatchObject({syncedBlock:'target-source',revisionPolicy:'latest'});
 expect(()=>migrateLegacyDocument({postId:'old-page',content:source})).toThrow('Import');
 expect(()=>migrateLegacyDocument({postId:'old-page',content:source.replace('"blockId":"old-source"','"blockId":"old-source","unknown":true'),reusableSources:new Map([['old-source','target-source']])})).toThrow();
});

import {makeFunctionReference as ref} from 'convex/server';
import {fixture,save,get} from './fixture.test-support';
const review=ref<'query'>('syncedBlocks/legacy:review'),apply=ref<'mutation'>('syncedBlocks/legacy:apply');
const body=(text:string)=>JSON.stringify({type:'doc',content:[{type:'paragraph',content:[{type:'text',text,marks:[{type:'bold'}]}]}]});
async function setup(){
 const f=await fixture();
 const leaf=await f.t.run(ctx=>ctx.db.insert('reusableBlocks',{title:'Leaf',content:body('Original'),isPublished:true,isLocked:true,usageCount:2,createdBy:f.ids.user,createdAt:11,updatedAt:12,description:'Retain original metadata'}));
 const parent=await f.t.run(ctx=>ctx.db.insert('reusableBlocks',{title:'Parent',content:JSON.stringify({type:'doc',content:[{type:'reusableBlock',attrs:{blockId:leaf}},{type:'reusableBlock',attrs:{blockId:leaf}}]}),isPublished:true,usageCount:1,createdBy:f.ids.user,createdAt:11,updatedAt:12}));
 return {...f,leaf,parent};
}
test('reviewed nested import preserves originals, sharing, publication, locks and idempotence',async()=>{
 const f=await setup(),original=await f.t.run(ctx=>ctx.db.query('reusableBlocks').collect());
 const plan=await f.operator.query(review,{legacyId:f.parent});expect(plan.sources).toHaveLength(2);expect(await f.t.run(ctx=>ctx.db.query('syncedBlocks').collect())).toHaveLength(0);
 const result=await f.operator.mutation(apply,{legacyId:f.parent,expectedDigest:plan.digest});expect(result).toMatchObject({created:2,reused:0});
 const heads=await f.t.run(ctx=>ctx.db.query('syncedBlocks').collect()),leaf=heads.find(h=>h.legacySourceId===f.leaf)!;expect(heads).toHaveLength(2);expect(leaf.isLocked).toBe(true);const first=await f.t.run(ctx=>ctx.db.query("syncedBlockRevisions").withIndex("by_source_revision",q=>q.eq("syncedBlockId",leaf._id).eq("revision",1)).unique());expect(JSON.parse(first!.legacySourceJson!)).toEqual(original.find(s=>s._id===f.leaf));
 const p=await f.operator.query(get,{id:result.id});expect(p.blocks.map((b:any)=>b.attrs.syncedBlock)).toEqual([leaf._id,leaf._id]);expect(p.blocks.every((b:any)=>b.attrs.revisionPolicy==='latest')).toBe(true);expect(p.publishedRevision).toBe(1);
 await expect(f.operator.mutation(save,{id:leaf._id,expectedGeneration:2,title:'Overwrite locked source',blocks:[]})).rejects.toThrow('locked');
 await expect(f.operator.mutation(ref<'mutation'>('editor/mutations:updateReusableBlock'),{blockId:f.parent,title:'Old writer'})).rejects.toThrow('canonical');
 expect(await f.t.run(ctx=>ctx.db.query('reusableBlocks').collect())).toEqual(original);
 const replay=await f.operator.query(review,{legacyId:f.parent});expect(await f.operator.mutation(apply,{legacyId:f.parent,expectedDigest:replay.digest})).toEqual({id:result.id,created:0,reused:2});expect(await f.t.run(ctx=>ctx.db.query('syncedBlockRevisions').collect())).toHaveLength(2);
});
test('changed graph, unauthorized actors, cycles and unsupported content refuse without partial imports',async()=>{
 const f=await setup();const plan=await f.operator.query(review,{legacyId:f.parent});
 for(const actor of[f.t,f.customer]){await expect(actor.query(review,{legacyId:f.parent})).rejects.toThrow();await expect(actor.mutation(apply,{legacyId:f.parent,expectedDigest:plan.digest})).rejects.toThrow();}
 await f.t.run(ctx=>ctx.db.patch('reusableBlocks',f.leaf,{content:body('Changed')}));await expect(f.operator.mutation(apply,{legacyId:f.parent,expectedDigest:plan.digest})).rejects.toThrow('changed');
 await f.t.run(ctx=>ctx.db.patch('reusableBlocks',f.leaf,{content:JSON.stringify({type:'doc',content:[{type:'reusableBlock',attrs:{blockId:f.parent}}]})}));await expect(f.operator.query(review,{legacyId:f.parent})).rejects.toThrow('cycle');
 await f.t.run(ctx=>ctx.db.patch('reusableBlocks',f.leaf,{content:JSON.stringify({type:'doc',content:[{type:'unknownWidget'}]})}));await expect(f.operator.query(review,{legacyId:f.parent})).rejects.toThrow();expect(await f.t.run(ctx=>ctx.db.query('syncedBlocks').collect())).toHaveLength(0);
});
test('draft imports stay private and a published parent cannot activate a private dependency',async()=>{
 const f=await setup();await f.t.run(ctx=>ctx.db.patch('reusableBlocks',f.leaf,{isPublished:false}));const plan=await f.operator.query(review,{legacyId:f.parent});await expect(f.operator.mutation(apply,{legacyId:f.parent,expectedDigest:plan.digest})).rejects.toThrow();expect(await f.t.run(ctx=>ctx.db.query('syncedBlocks').collect())).toHaveLength(0);
 await f.t.run(ctx=>ctx.db.patch('reusableBlocks',f.parent,{isPublished:false}));const next=await f.operator.query(review,{legacyId:f.parent});const result=await f.operator.mutation(apply,{legacyId:f.parent,expectedDigest:next.digest});expect((await f.operator.query(get,{id:result.id})).publishedRevision).toBeNull();
});

test('usage counters do not break import identity; unlock is explicit, authorized and generation checked',async()=>{
 const f=await setup(),plan=await f.operator.query(review,{legacyId:f.leaf});
 await f.t.run(ctx=>ctx.db.patch('reusableBlocks',f.leaf,{usageCount:17,updatedAt:99}));
 const result=await f.operator.mutation(apply,{legacyId:f.leaf,expectedDigest:plan.digest});
 const unlock=ref<'mutation'>('syncedBlocks/content:unlockImported');
 await expect(f.customer.mutation(unlock,{id:result.id,expectedGeneration:2})).rejects.toThrow();
 await expect(f.operator.mutation(unlock,{id:result.id,expectedGeneration:1})).rejects.toThrow();
 await f.operator.mutation(unlock,{id:result.id,expectedGeneration:2});
 const head=await f.t.run(ctx=>ctx.db.get('syncedBlocks',result.id));expect(head!.isLocked).toBe(false);expect(head!.generation).toBe(3);expect(head!.publishedRevision).toBe(1);
 const next=await f.operator.query(review,{legacyId:f.leaf});await f.operator.mutation(apply,{legacyId:f.leaf,expectedDigest:next.digest});
 expect((await f.t.run(ctx=>ctx.db.get('syncedBlocks',result.id)))!.isLocked).toBe(false);
 expect((await f.t.run(ctx=>ctx.db.get('reusableBlocks',f.leaf)))!.isLocked).toBe(true);
});
test('missing dependencies, foreign authors and changed installation refuse imports',async()=>{
 const f=await setup();
 await f.t.run(ctx=>ctx.db.patch('reusableBlocks',f.leaf,{createdBy:f.ids.customer}));
 await expect(f.operator.query(review,{legacyId:f.parent})).rejects.toThrow('Editor');
 await f.t.run(ctx=>ctx.db.patch('reusableBlocks',f.leaf,{createdBy:f.ids.user}));
 const plan=await f.operator.query(review,{legacyId:f.parent});await f.operator.mutation(apply,{legacyId:f.parent,expectedDigest:plan.digest});
 await f.t.run(ctx=>ctx.db.patch('convexpress_siteIdentity',f.ids.site,{instanceKey:'other'}));
 await expect(f.operator.query(review,{legacyId:f.parent})).rejects.toThrow();
 const missing=await setup();await missing.t.run(ctx=>ctx.db.delete('reusableBlocks',missing.leaf));
 await expect(missing.operator.query(review,{legacyId:missing.parent})).rejects.toThrow('missing');
 expect(await missing.t.run(ctx=>ctx.db.query('syncedBlocks').collect())).toHaveLength(0);
});
