import {expect,test} from 'bun:test';
import {fixture,create,save,withdraw,text,reference} from '../../syncedBlocks/__tests__/fixture.test-support';
import {captureSyncedPromotionClosure} from '../syncedClosure';

const unused=async()=>{throw Error('Unexpected ordinary dependency');};
async function setup(){
 const f=await fixture();
 await f.t.run(async ctx=>{const role=await ctx.db.get('roles',f.ids.role);await ctx.db.patch('roles',f.ids.role,{capabilities:[...role!.capabilities,'manage_options']});});
 const source=await f.operator.mutation(create,{title:'Published version',blocks:text});await f.release(source.id,1,1);
 return{...f,source,documents:[{key:'page:example',blocks:reference(source.id)}]};
}
test('database adapter captures published history and omits unpublished drafts and runtime identity',async()=>{
 const f=await setup();await f.operator.mutation(save,{id:f.source.id,expectedGeneration:2,title:'Private draft must stay here',blocks:text});
 const result=await f.operator.run(ctx=>captureSyncedPromotionClosure(ctx,f.documents,unused));
 expect(result.sources).toHaveLength(1);expect(result.sources[0].generation).toBe(3);expect(result.sources[0].revisions).toHaveLength(1);
 expect(result.sources[0].revisions[0].title).toBe('Published version');
 expect(JSON.stringify(result)).not.toContain('Private draft must stay here');expect(JSON.stringify(result)).not.toContain(String(f.ids.user));
 expect(await f.t.run(ctx=>ctx.db.query('syncedBlockRevisions').take(10))).toHaveLength(2);
});
test('anonymous actors, customers, missing capabilities and withdrawn sources cannot export',async()=>{
 const f=await setup();
 for(const actor of [f.t,f.customer])await expect(actor.run(ctx=>captureSyncedPromotionClosure(ctx,f.documents,unused))).rejects.toBeDefined();
 await f.t.run(ctx=>ctx.db.patch('roles',f.ids.role,{capabilities:['post.read']}));
 await expect(f.operator.run(ctx=>captureSyncedPromotionClosure(ctx,f.documents,unused))).rejects.toBeDefined();
 await f.t.run(ctx=>ctx.db.patch('roles',f.ids.role,{capabilities:['manage_options','post.read','post.unpublish']}));
 await f.operator.mutation(withdraw,{id:f.source.id,expectedGeneration:2});
 await expect(f.operator.run(ctx=>captureSyncedPromotionClosure(ctx,f.documents,unused))).rejects.toBeDefined();
});
test('installation and author ownership are enforced for every reusable dependency',async()=>{
 const f=await setup();
 const other=await f.t.run(ctx=>ctx.db.insert('users',{authSource:'local',email:'other@example.invalid',emailVerified:true,status:'active',roleId:f.ids.role,createdAt:1,updatedAt:1}));
 await f.t.run(ctx=>ctx.db.patch('syncedBlocks',f.source.id,{createdBy:other}));
 await expect(f.operator.run(ctx=>captureSyncedPromotionClosure(ctx,f.documents,unused))).rejects.toBeDefined();
 await f.t.run(ctx=>ctx.db.patch('roles',f.ids.role,{level:80}));
 expect((await f.operator.run(ctx=>captureSyncedPromotionClosure(ctx,f.documents,unused))).sources).toHaveLength(1);
 await f.t.run(ctx=>ctx.db.patch('syncedBlocks',f.source.id,{instanceKey:'another-site'}));
 await expect(f.operator.run(ctx=>captureSyncedPromotionClosure(ctx,f.documents,unused))).rejects.toBeDefined();
 await f.t.run(ctx=>ctx.db.patch('convexpress_siteIdentity',f.ids.site,{environmentKind:'live'}));
 await expect(f.operator.run(ctx=>captureSyncedPromotionClosure(ctx,f.documents,unused))).rejects.toBeDefined();
});
