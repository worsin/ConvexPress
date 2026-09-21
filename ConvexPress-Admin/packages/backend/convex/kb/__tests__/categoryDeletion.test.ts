import {expect,test} from 'bun:test';
import {convexTest} from 'convex-test';
import {makeFunctionReference} from 'convex/server';
import schema from '../../schema';
import {beginCategoryDeletion} from '../categoryDeletion';
import {createPublicKbAccess} from '../publicAccess';
import {requireAssignableCategory} from '../helpers/categoryHierarchy';
import {getCurrentUser} from '../../helpers/permissions';
import {RequestReadLedger} from '../../helpers/requestReadLedger';
const modules={
 './convex/_generated/server.js':()=>import('../../_generated/server.js'),
 './convex/kb/categories.ts':()=>import('../categories'),
 './convex/kb/categoryDeletion.ts':()=>import('../categoryDeletion'),
 './convex/kb/categoryAccess.ts':()=>import('../categoryAccess'),
 './convex/kb/searchCandidates.ts':()=>import('../searchCandidates'),
 './convex/kb/mutations.ts':()=>import('../mutations'),
 './convex/kb/queries.ts':()=>import('../queries'),
 './convex/membership/policyReads.ts':()=>import('../../membership/policyReads'),
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

const jobStatus=makeFunctionReference<'query'>('kb/categoryDeletion:status');
async function seedArticles(f:Awaited<ReturnType<typeof fixture>>,categoryId:any,count:number){
 return f.t.run(async ctx=>{const ids=[];for(let i=0;i<count;i++)ids.push(await ctx.db.insert('kb_articles',{title:`Guide ${i}`,slug:`guide-${i}`,excerpt:'Guide',content:'{}',contentPlainText:'Guide',status:'published',authorId:f.ids.user,contributors:[],categoryId,keywords:[],viewCount:0,uniqueViewCount:0,helpfulVotes:0,notHelpfulVotes:0,readingTimeMinutes:1,version:1,isFeatured:false,sortOrder:0,meilisearchSynced:true,ragSynced:true,createdAt:1,updatedAt:1}));await ctx.db.patch(categoryId,{articleCount:count});return ids;});
}
async function jobFor(f:Awaited<ReturnType<typeof fixture>>,categoryId:any){return f.t.run(ctx=>ctx.db.query('kb_category_deletions').withIndex('by_category',q=>q.eq('categoryId',categoryId)).unique());}
async function drain(f:Awaited<ReturnType<typeof fixture>>,categoryId:any){
 for(let i=0;i<300;i++){
  await new Promise(resolve=>setTimeout(resolve,1));await f.t.finishInProgressScheduledFunctions();
  const job=await jobFor(f,categoryId);if(job&&job.status!=='running')return job;
 }
 throw Error('Deletion did not reach a terminal or paused state');
}
test('registered scheduled deletion processes more than200 children and1000 articles without orphans',async()=>{
 const f=await fixture(),parent=await f.create({name:'Parent'}),categoryId=await f.create({name:'Large library',parentId:parent});
 await f.t.run(async ctx=>{for(let i=0;i<205;i++)await ctx.db.insert('kb_categories',{name:`Child ${i}`,slug:`child-${i}`,parentId:categoryId,order:i,isActive:true,isPublished:true,articleCount:0,createdAt:1,updatedAt:1});});
 const articles=await seedArticles(f,categoryId,1005);await f.client.mutation(mutate('remove'),{categoryId});
 const job=await drain(f,categoryId);expect(job.status).toBe('complete');expect(job.childrenMoved).toBe(205);expect(job.articlesMoved).toBe(1005);
 await f.t.run(async ctx=>{
  expect(await ctx.db.get(categoryId)).toBeNull();expect(await ctx.db.query('kb_categories').withIndex('by_parent',q=>q.eq('parentId',categoryId)).take(1)).toHaveLength(0);
  expect(await ctx.db.query('kb_categories').withIndex('by_parent',q=>q.eq('parentId',parent)).take(206)).toHaveLength(205);
  expect(await ctx.db.query('kb_articles').withIndex('by_category',q=>q.eq('categoryId',categoryId)).take(1)).toHaveLength(0);
  expect(await ctx.db.query('kb_article_category_guards').take(1006)).toHaveLength(1005);
  const last=(await ctx.db.get(articles[1004]!))!;expect(last.categoryId).toBeUndefined();expect(last.status).toBe('published');expect(last.meilisearchSynced).toBe(false);expect(last.ragSynced).toBe(false);
 });
 const summary=await f.client.query(jobStatus,{jobId:job._id});expect(summary.status).toBe('complete');expect('actor' in summary).toBe(false);
});
test('revoked authority pauses before writes; a new authorized generation resumes and fences stale workers',async()=>{
 const f=await fixture(),categoryId=await f.create({name:'Paused library'});await seedArticles(f,categoryId,3);
 await f.client.run(async ctx=>{await beginCategoryDeletion(ctx,categoryId);await ctx.db.patch(f.ids.role,{capabilities:['kb.view']});});
 let job=await drain(f,categoryId);expect(job.status).toBe('paused');expect(job.articlesMoved).toBe(0);
 await expect(f.create({name:'New child',parentId:categoryId})).rejects.toThrow();
 await f.t.run(ctx=>ctx.db.patch(f.ids.role,{capabilities:['kb.view','kb.manageCategories']}));
 await expect(f.create({name:'New child',parentId:categoryId})).rejects.toThrow('being deleted');
 await expect(f.update({categoryId,name:'Reopened'})).rejects.toThrow('being deleted');
 await expect(f.client.mutation(mutate('reorder'),{categoryId,newOrder:3})).rejects.toThrow('being deleted');
 await expect(f.t.run(ctx=>requireAssignableCategory(ctx,categoryId))).rejects.toThrow('being deleted');
 const priorGeneration=job.generation;
 await f.client.mutation(mutate('remove'),{categoryId});
 await f.t.mutation(makeFunctionReference<'mutation'>('kb/categoryDeletion:advance'),{jobId:job._id,generation:priorGeneration});
 job=await drain(f,categoryId);expect(job.status).toBe('complete');expect(job.generation).toBe(priorGeneration+1);expect(job.articlesMoved).toBe(3);
});
test('a failed article batch rolls back preceding moves and can be retried without duplicate provenance',async()=>{
 const f=await fixture(),categoryId=await f.create({name:'Retry library'}),articles=await seedArticles(f,categoryId,2);let duplicate:any;
 await f.client.run(async ctx=>{
  await beginCategoryDeletion(ctx,categoryId);const category=(await ctx.db.get(categoryId))!;
  const guard={articleId:articles[1]!,jobId:category.deletionJobId!,categorySlug:category.slug,articleSlug:'guide-1',wasPublished:true,createdAt:1};
  await ctx.db.insert('kb_article_category_guards',guard);duplicate=await ctx.db.insert('kb_article_category_guards',guard);
 });
 let job=await drain(f,categoryId);expect(job.status).toBe('failed');expect(job.articlesMoved).toBe(0);
 await f.t.run(async ctx=>{expect((await ctx.db.get(articles[0]!))!.categoryId).toBe(categoryId);expect(await ctx.db.query('kb_article_category_guards').withIndex('by_article',q=>q.eq('articleId',articles[0]!)).take(1)).toHaveLength(0);await ctx.db.delete(duplicate);});
 await f.client.mutation(mutate('remove'),{categoryId});job=await drain(f,categoryId);expect(job.status).toBe('complete');expect(job.articlesMoved).toBe(2);
 expect(await f.t.run(ctx=>ctx.db.query('kb_article_category_guards').take(3))).toHaveLength(2);
});
test('deleted category and exact article access policies remain live requirements after reassignment',async()=>{
 const f=await fixture(),categoryId=await f.create({name:'Members'}),articles=await seedArticles(f,categoryId,1);
 await f.t.run(ctx=>ctx.db.patch(f.ids.setting,{values:{knowledgeBaseEnabled:true,membershipEnabled:true}}));
 const rule=await f.t.run(ctx=>ctx.db.insert('membership_restriction_rules',{resourceType:'route',resourceIdOrKey:'/help/members',ruleMode:'allow_only',planIds:[],loginRequired:true,teaserMode:'hide',createdAt:1,updatedAt:1}));
 const visible=()=>f.t.run(async ctx=>createPublicKbAccess(ctx).article((await ctx.db.get(articles[0]!))!));
 expect(await visible()).toBeNull();await f.client.mutation(mutate('remove'),{categoryId});expect((await drain(f,categoryId)).status).toBe('complete');expect(await visible()).toBeNull();
 await f.t.run(ctx=>ctx.db.patch(rule,{resourceIdOrKey:'/help/members/guide-0'}));expect(await visible()).toBeNull();
 await f.t.run(ctx=>ctx.db.delete(rule));expect((await visible())!.href).toBe('/help/uncategorized/guide-0');
});
test('deleting an unpublished category cannot publish its articles',async()=>{
 const f=await fixture(),categoryId=await f.create({name:'Hidden'}),articles=await seedArticles(f,categoryId,1);
 await f.update({categoryId,isPublished:false});await f.client.mutation(mutate('remove'),{categoryId});expect((await drain(f,categoryId)).status).toBe('complete');
 expect(await f.t.run(async ctx=>createPublicKbAccess(ctx).article((await ctx.db.get(articles[0]!))!))).toBeNull();
});

test('only an authorized publisher can release the exact reviewed inherited restrictions',async()=>{
 const f=await fixture(),categoryId=await f.create({name:'Private origin'}),articles=await seedArticles(f,categoryId,1),articleId=articles[0]!;
 await f.update({categoryId,isPublished:false});await f.client.mutation(mutate('remove'),{categoryId});expect((await drain(f,categoryId)).status).toBe('complete');
 const review=makeFunctionReference<'query'>('kb/categoryAccess:review'),release=makeFunctionReference<'mutation'>('kb/categoryAccess:release');
 let inspected=await f.client.query(review,{articleId});expect(inspected.canRelease).toBe(false);
 await expect(f.client.mutation(release,{articleId,expectedDigest:inspected.digest,confirm:true})).rejects.toThrow();
 await f.t.run(ctx=>ctx.db.patch(f.ids.role,{capabilities:['kb.view','kb.manageCategories','kb.publish','kb.editOwn']}));
 inspected=await f.client.query(review,{articleId});expect(inspected.canRelease).toBe(true);
 await f.t.run(async ctx=>{const guard=(await ctx.db.query('kb_article_category_guards').withIndex('by_article',q=>q.eq('articleId',articleId)).unique())!;await ctx.db.patch(guard._id,{articleSlug:'prior-private-path'});});
 await expect(f.client.mutation(release,{articleId,expectedDigest:inspected.digest,confirm:true})).rejects.toThrow('Review');
 inspected=await f.client.query(review,{articleId});await expect(f.client.mutation(release,{articleId,expectedDigest:inspected.digest,confirm:false})).rejects.toThrow('Review');
 expect(await f.client.mutation(release,{articleId,expectedDigest:inspected.digest,confirm:true})).toBe(1);
 expect(await f.t.run(async ctx=>createPublicKbAccess(ctx).article((await ctx.db.get(articleId))!))).not.toBeNull();
});
test('external search candidates recheck deleted-category guards, current metadata and stale chunk contents',async()=>{
 const f=await fixture(),categoryId=await f.create({name:'External search'}),articles=await seedArticles(f,categoryId,1),articleId=articles[0]!;
 const readable=makeFunctionReference<'query'>('kb/searchCandidates:readable');
 expect(await f.t.query(readable,{candidates:[{id:'not-an-id'},{id:articleId,chunk:'REMOVED PRIVATE CONTENT'}]})).toEqual([]);
 let rows=await f.t.query(readable,{candidates:[{id:articleId,chunk:'Guide'}]});expect(rows[0].title).toBe('Guide 0');expect(rows[0].matchedChunk).toBe('Guide');
 await f.t.run(ctx=>ctx.db.patch(articleId,{title:'Current title',contentPlainText:'A revised guide'}));
 expect(await f.t.query(readable,{candidates:[{id:articleId,chunk:'Guide'}]})).toEqual([]);
 rows=await f.t.query(readable,{candidates:[{id:articleId}]});expect(rows[0].title).toBe('Current title');expect('contentPlainText' in rows[0]).toBe(false);
 await f.update({categoryId,isPublished:false});await f.client.mutation(mutate('remove'),{categoryId});expect((await drain(f,categoryId)).status).toBe('complete');
 expect(await f.t.query(readable,{candidates:[{id:articleId}]})).toEqual([]);
 await expect(f.t.query(readable,{candidates:Array.from({length:51},()=>({id:articleId}))})).rejects.toThrow('safe limit');
});

test('admin detail exposes retained-access notice only with KB authority; permanent article deletion cleans its guard history',async()=>{
 const f=await fixture(),categoryId=await f.create({name:'Guard cleanup'}),articles=await seedArticles(f,categoryId,1),articleId=articles[0]!;
 await f.client.mutation(mutate('remove'),{categoryId});const job=await drain(f,categoryId);expect(job.status).toBe('complete');
 const detail=makeFunctionReference<'query'>('kb/queries:getById');await expect(f.t.query(detail,{articleId})).rejects.toThrow();expect((await f.client.query(detail,{articleId})).hasInheritedCategoryAccess).toBe(true);
 await f.t.run(async ctx=>{for(let i=0;i<100;i++)await ctx.db.insert('kb_article_category_guards',{articleId,jobId:job._id,categorySlug:`old-${i}`,articleSlug:'guide-0',wasPublished:true,createdAt:1});});
 await f.t.mutation(makeFunctionReference<'mutation'>('kb/categoryAccess:cleanupDeletedArticle'),{articleId});expect(await f.t.run(ctx=>ctx.db.query('kb_article_category_guards').take(102))).toHaveLength(101);
 await f.t.run(ctx=>ctx.db.patch(f.ids.role,{capabilities:['kb.view','kb.delete']}));await f.client.mutation(makeFunctionReference<'mutation'>('kb/mutations:remove'),{articleId});
 for(let i=0;i<100;i++){await new Promise(resolve=>setTimeout(resolve,1));await f.t.finishInProgressScheduledFunctions();if(!(await f.t.run(ctx=>ctx.db.query('kb_article_category_guards').take(1))).length)break;if(i===99)throw Error('Article guard cleanup did not finish');}
 expect(await f.t.run(ctx=>ctx.db.get(articleId))).toBeNull();expect(await f.t.run(ctx=>ctx.db.query('kb_article_category_guards').take(1))).toHaveLength(0);
});

for (const invalidation of ['session-expired', 'session-revoked', 'binding-revoked', 'authority-revoked', 'revision-changed', 'authority-expired', 'authority-not-yet-valid', 'session-capability-removed'] as const) {
 test(`an in-progress management deletion pauses after ${invalidation} and another operator can finish`,async()=>{
  const f=await fixture(),categoryId=await f.create({name:`Managed ${invalidation}`});await seedArticles(f,categoryId,45);
  const managed=await f.t.run(async ctx=>{
   const now=Date.now();
   const user=await ctx.db.insert('users',{authSource:'management',email:'managed-fixture@example.invalid',emailVerified:true,status:'active',roleId:f.ids.role,createdAt:now,updatedAt:now});
   const authority=await ctx.db.insert('convexpress_managementAuthorities',{controllerId:'disposable-controller',keyId:'fixture-key',publicKeyPem:'synthetic-public-key',fingerprintSha256:'synthetic-fingerprint',websiteKey:'fixture-site',instanceKey:'fixture-staging',capabilities:['session.exchange','health.read'],capabilityRevision:1,status:'active',notBefore:now-1000,expiresAt:now+30000,enrolledAt:now,updatedAt:now});
   const binding=await ctx.db.insert('convexpress_managementBindings',{authorityId:authority,controllerId:'disposable-controller',syntheticOperatorId:String(user),userId:user,capabilityRevision:1,status:'active',createdAt:now,updatedAt:now});
   const session=await ctx.db.insert('convexpress_managementSessions',{tokenHash:'0'.repeat(64),authorityId:authority,bindingId:binding,userId:user,websiteKey:'fixture-site',instanceKey:'fixture-staging',capabilities:['health.read'],siteRoleSlug:'kb-editor',siteCapabilities:['kb.view','kb.manageCategories'],capabilityRevision:1,expiresAt:now+60000,status:'active',createdAt:now});
   return {user,authority,binding,session,authorityExpiresAt:now+30000};
  });
  const client=f.t.withIdentity({subject:managed.session,issuer:'https://convexpress-management.local'});
  await client.run(async ctx=>{
   const budget=new RequestReadLedger();
   expect((await getCurrentUser(ctx,budget))!._id).toBe(managed.user);
   expect(budget.authorizationRecheckAt).toBe(managed.authorityExpiresAt);
   await beginCategoryDeletion(ctx,categoryId);
   const category=(await ctx.db.get('kb_categories',categoryId))!;
   const args={jobId:category.deletionJobId!,generation:1};
   // Advance real registered batches inside the transaction so invalidation is
   // deterministic after some work, before any scheduled follow-up can run.
   const batch=makeFunctionReference<'mutation'>('kb/categoryDeletion:batch');
   await ctx.runMutation(batch,args);await ctx.runMutation(batch,args);
   expect((await ctx.db.get('kb_category_deletions',args.jobId))!.articlesMoved).toBe(20);
   if(invalidation==='session-expired')await ctx.db.patch('convexpress_managementSessions',managed.session,{expiresAt:Date.now()});
   if(invalidation==='session-revoked')await ctx.db.patch('convexpress_managementSessions',managed.session,{status:'revoked'});
   if(invalidation==='binding-revoked')await ctx.db.patch('convexpress_managementBindings',managed.binding,{status:'revoked'});
   if(invalidation==='authority-revoked')await ctx.db.patch('convexpress_managementAuthorities',managed.authority,{status:'revoked'});
   if(invalidation==='revision-changed')await ctx.db.patch('convexpress_managementAuthorities',managed.authority,{capabilityRevision:2});
   if(invalidation==='authority-expired')await ctx.db.patch('convexpress_managementAuthorities',managed.authority,{expiresAt:Date.now()});
   if(invalidation==='authority-not-yet-valid')await ctx.db.patch('convexpress_managementAuthorities',managed.authority,{notBefore:Date.now()+60000});
   if(invalidation==='session-capability-removed')await ctx.db.patch('convexpress_managementSessions',managed.session,{siteCapabilities:['kb.view']});
  });
  let job=await drain(f,categoryId);expect(job.status).toBe('paused');expect(job.articlesMoved).toBe(20);
  await expect(client.mutation(mutate('remove'),{categoryId})).rejects.toThrow();
  await f.client.mutation(mutate('remove'),{categoryId});job=await drain(f,categoryId);
  expect(job.status).toBe('complete');expect(job.articlesMoved).toBe(45);expect(job.generation).toBe(2);
  expect(await f.t.run(ctx=>ctx.db.query('kb_article_category_guards').withIndex('by_job_article',q=>q.eq('jobId',job._id)).take(46))).toHaveLength(45);
 });
}
