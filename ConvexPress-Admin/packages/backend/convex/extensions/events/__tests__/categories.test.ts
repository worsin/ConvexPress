import {expect,test} from 'bun:test';
import {convexTest} from 'convex-test';
import {makeFunctionReference} from 'convex/server';
import schema from '../../../schema';
const modules={
 './convex/_generated/api.js':()=>import('../../../_generated/api.js'),
 './convex/_generated/server.js':()=>import('../../../_generated/server.js'),
 './convex/extensions/events/categories.ts':()=>import('../categories'),
 './convex/extensions/events/mutations.ts':()=>import('../mutations'),
};
const ref=(name:string)=>makeFunctionReference<any,any,any>(`extensions/events/${name}`);
async function fixture(){
 const t=convexTest({schema,modules});
 const ids=await t.run(async ctx=>{
  const role=await ctx.db.insert('roles',{name:'Event manager',slug:'event-manager',description:'Fixture',level:80,type:'internal',isDefault:false,isProtected:false,capabilities:['manage_options'],pageAccess:[],status:'active',createdAt:1,updatedAt:1});
  const user=await ctx.db.insert('users',{authSource:'local',email:'events-categories@example.invalid',emailVerified:true,roleId:role,status:'active',createdAt:1,updatedAt:1});
  const denied=await ctx.db.insert('users',{authSource:'local',email:'events-denied@example.invalid',emailVerified:true,status:'active',createdAt:1,updatedAt:1});
  const settings=await ctx.db.insert('settings',{section:'plugins',values:{eventsEnabled:true},updatedAt:1,updatedBy:user});
  return {user,denied,settings};
 });
 const as=(id:typeof ids.user)=>t.withIdentity({subject:id,tokenIdentifier:`https://convexpress-admin.local|${id}`});
 return {t,ids,as,client:as(ids.user)};
}
const event=()=>({title:'Workshop',slug:'workshop',description:'Make a useful object.',startsAt:Date.now()+86400000,endsAt:Date.now()+90000000,timeZone:'America/Denver',venue:'Studio',venueAddress:''});
test('event categories require current authority, enabled plugin, valid names and unique slugs',async()=>{
 const {t,ids,client,as}=await fixture(),create=ref('categories:create');
 for(const visitor of [t,as(ids.denied)])await expect(visitor.mutation(create,{name:'Workshops',slug:'workshops'})).rejects.toThrow();
 for(const input of [{name:' ',slug:'workshops'},{name:'x'.repeat(121),slug:'workshops'},{name:'Workshops',slug:'../private'}])await expect(client.mutation(create,input)).rejects.toThrow();
 const id=await client.mutation(create,{name:'  Workshops  ',slug:'workshops'});
 await expect(client.mutation(create,{name:'Another',slug:'workshops'})).rejects.toThrow('already uses');
 const page=await client.query(ref('categories:list'),{paginationOpts:{cursor:null,numItems:10}});
 expect(page.page.map((row:any)=>[row._id,row.name])).toEqual([[id,'Workshops']]);
 expect(Object.keys(page.page[0]).sort()).toEqual(['_creationTime','_id','createdAt','name','slug','updatedAt']);
 await expect(t.query(ref('categories:list'),{paginationOpts:{cursor:null,numItems:10}})).rejects.toThrow();
 await expect(client.query(ref('categories:list'),{paginationOpts:{cursor:null,numItems:51}})).rejects.toThrow();
 await t.run(ctx=>ctx.db.patch('settings',ids.settings,{values:{eventsEnabled:false}}));
 await expect(client.mutation(create,{name:'Dinner',slug:'dinner'})).rejects.toThrow();
 await expect(client.query(ref('categories:list'),{paginationOpts:{cursor:null,numItems:10}})).rejects.toThrow();
});
test('category assignment rejects post taxonomy, survives older clients, and clears explicitly',async()=>{
 const {t,client}=await fixture();
 const category=await client.mutation(ref('categories:create'),{name:'Workshops',slug:'workshops'});
 const fields=event(),id=await client.mutation(ref('mutations:create'),{...fields,categoryId:category});
 let saved=await t.run(ctx=>ctx.db.get('extension_events',id));expect(saved?.categoryId).toBe(category);
 await client.mutation(ref('mutations:update'),{id,expectedUpdatedAt:saved!.updatedAt,...fields,title:'Updated by an older client',status:'draft'});
 saved=await t.run(ctx=>ctx.db.get('extension_events',id));expect(saved?.categoryId).toBe(category);
 const row=await t.run(ctx=>ctx.db.get('extension_event_categories',category));
 await expect(client.mutation(ref('categories:remove'),{id:category,expectedUpdatedAt:row!.updatedAt})).rejects.toThrow('Move events');
 const term=await t.run(ctx=>ctx.db.insert('terms',{name:'Post category',slug:'workshops',taxonomy:'category',count:0,isDefault:false,createdAt:1,updatedAt:1}));
 await expect(client.mutation(ref('mutations:create'),{...fields,slug:'wrong-taxonomy',categoryId:term})).rejects.toThrow();
 await client.mutation(ref('mutations:update'),{id,expectedUpdatedAt:saved!.updatedAt,...fields,status:'draft',categoryId:null});
 expect((await t.run(ctx=>ctx.db.get('extension_events',id)))?.categoryId).toBeUndefined();
 await client.mutation(ref('categories:remove'),{id:category,expectedUpdatedAt:row!.updatedAt});
 await expect(client.mutation(ref('mutations:create'),{...fields,slug:'deleted-category',categoryId:category})).rejects.toThrow('no longer exists');
});
test('category rename keeps indexed references and stale updates or deletion refuse',async()=>{
 const {t,client}=await fixture(),fields=event();
 const category=await client.mutation(ref('categories:create'),{name:'Workshops',slug:'workshops'});
 const id=await client.mutation(ref('mutations:create'),{...fields,categoryId:category});
 const before=await t.run(ctx=>ctx.db.get('extension_event_categories',category));
 await client.mutation(ref('categories:update'),{id:category,expectedUpdatedAt:before!.updatedAt,name:'Making together',slug:'making-together'});
 for(const operation of ['update','remove'])await expect(client.mutation(ref(`categories:${operation}`),{id:category,expectedUpdatedAt:before!.updatedAt,...(operation==='update'?{name:'Stale',slug:'stale'}:{})})).rejects.toThrow('another editor');
 const indexed=await t.run(ctx=>ctx.db.query('extension_events').withIndex('by_category_status_start',q=>q.eq('categoryId',category).eq('status','draft').gte('startsAt',Date.now())).collect());
 expect(indexed.map(row=>row._id)).toEqual([id]);
 expect((await t.run(ctx=>ctx.db.get('extension_events',id)))?.categoryId).toBe(category);
 expect((await t.run(ctx=>ctx.db.get('extension_event_categories',category)))?.name).toBe('Making together');
});
