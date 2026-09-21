import {expect,test} from 'bun:test';
import {convexTest} from 'convex-test';
import {makeFunctionReference} from 'convex/server';
import schema from '../../schema';
const modules={
 './convex/_generated/server.js':()=>import('../../_generated/server.js'),
 './convex/kb/categories.ts':()=>import('../categories'),
};
const mutate=(name:string)=>makeFunctionReference<'mutation'>(`kb/categories:${name}`);
const list=makeFunctionReference<'query'>('kb/categories:list');
async function fixture(){
 const t=convexTest({schema,modules});
 const ids=await t.run(async ctx=>{
  const role=await ctx.db.insert('roles',{name:'KB editor',slug:'kb-editor',description:'Fixture',level:50,type:'internal',status:'active',isDefault:false,isProtected:false,pageAccess:['/admin/kb'],createdAt:1,updatedAt:1,capabilities:['kb.view','kb.manageCategories']});
  const user=await ctx.db.insert('users',{authSource:'local',email:'kb-fixture@example.invalid',emailVerified:true,status:'active',roleId:role,createdAt:1,updatedAt:1});
  const setting=await ctx.db.insert('settings',{section:'plugins',values:{knowledgeBaseEnabled:true,membershipEnabled:false},updatedBy:user,updatedAt:1});
  const missing=await ctx.db.insert('kb_categories',{name:'Removed',slug:'removed',order:0,isActive:true,isPublished:true,articleCount:0,createdAt:1,updatedAt:1});await ctx.db.delete(missing);
  return {role,user,setting,missing};
 });
 const client=t.withIdentity({subject:ids.user,issuer:'https://convexpress-admin.local'});
 return {t,client,ids,create:(args:Record<string,unknown>)=>client.mutation(mutate('create'),args),update:(args:Record<string,unknown>)=>client.mutation(mutate('update'),args)};
}
test('category parents must exist; explicit null clears a parent while omission preserves it',async()=>{
 const f=await fixture();await expect(f.create({name:'Broken',parentId:f.ids.missing})).rejects.toThrow('Parent category not found');
 const parent=await f.create({name:'Parent'}),child=await f.create({name:'Child',parentId:parent});
 await f.update({categoryId:child,description:'A description'});expect((await f.t.run(ctx=>ctx.db.get(child)))!.parentId).toBe(parent);
 await expect(f.update({categoryId:child,parentId:f.ids.missing})).rejects.toThrow('Parent category not found');
 await f.update({categoryId:child,parentId:null});expect((await f.t.run(ctx=>ctx.db.get(child)))!.parentId).toBeUndefined();
 expect((await f.t.run(ctx=>ctx.db.get(child)))!.description).toBe('A description');
});
test('category parenting rejects self, descendants and corrupt ancestor cycles without changing either category',async()=>{
 const f=await fixture();const a=await f.create({name:'A'}),b=await f.create({name:'B',parentId:a}),c=await f.create({name:'C'});
 await expect(f.update({categoryId:a,parentId:a})).rejects.toThrow('cycle');
 await expect(f.update({categoryId:a,parentId:b})).rejects.toThrow('cycle');
 await f.t.run(ctx=>ctx.db.patch(a,{parentId:b}));
 await expect(f.update({categoryId:c,parentId:b})).rejects.toThrow('cycle');
 await expect(f.create({name:'Corrupt child',parentId:b})).rejects.toThrow('cycle');
 expect((await f.t.run(ctx=>ctx.db.get(c)))!.parentId).toBeUndefined();
 await f.update({categoryId:a,parentId:null});expect((await f.t.run(ctx=>ctx.db.get(a)))!.parentId).toBeUndefined();
});
test('hierarchy traversal has a depth bound and inactive parents cannot receive new children',async()=>{
 const f=await fixture();let parent=await f.create({name:'Root'});
 await f.t.run(async ctx=>{for(let i=0;i<70;i++)parent=await ctx.db.insert('kb_categories',{name:`Layer ${i}`,slug:`layer-${i}`,parentId:parent,order:i,isActive:true,isPublished:true,articleCount:0,createdAt:1,updatedAt:1});});
 await expect(f.create({name:'Too deep',parentId:parent})).rejects.toThrow('64');
 const inactive=await f.create({name:'Inactive'});await f.t.run(ctx=>ctx.db.patch(inactive,{isActive:false}));
 await expect(f.create({name:'Hidden child',parentId:inactive})).rejects.toThrow('inactive');
});
test('admin categories require KB view authority; management and input checks remain enforced',async()=>{
 const f=await fixture();await f.create({name:'Private editorial category'});
 await expect(f.t.query(list,{})).rejects.toThrow();
 await f.t.run(ctx=>ctx.db.patch(f.ids.role,{capabilities:[]}));await expect(f.client.query(list,{})).rejects.toThrow();await expect(f.create({name:'No authority'})).rejects.toThrow();
 await f.t.run(ctx=>ctx.db.patch(f.ids.role,{capabilities:['kb.view']}));expect((await f.client.query(list,{})).length).toBe(1);await expect(f.create({name:'No management'})).rejects.toThrow();
 await f.t.run(ctx=>ctx.db.patch(f.ids.role,{capabilities:['kb.view','kb.manageCategories']}));
 for(const args of [{name:'x'.repeat(257)},{name:'Good',description:'x'.repeat(100001)},{name:'Good',icon:'x'.repeat(501)}])await expect(f.create(args)).rejects.toThrow('maximum');
 await f.t.run(ctx=>ctx.db.patch(f.ids.setting,{values:{knowledgeBaseEnabled:false}}));expect(await f.client.query(list,{})).toBeNull();await expect(f.create({name:'Disabled'})).rejects.toThrow();
});
