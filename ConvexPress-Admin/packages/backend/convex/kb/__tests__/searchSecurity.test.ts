import {expect,test} from 'bun:test';
import {convexTest} from 'convex-test';
import {makeFunctionReference as ref} from 'convex/server';
import schema from '../../schema';
const modules={
 './convex/_generated/server.js':()=>import('../../_generated/server.js'),
 './convex/_generated/api.js':()=>import('../../_generated/api.js'),
 './convex/kb/searchReconciliation.ts':()=>import('../searchReconciliation'),
 './convex/kb/searchJobs.ts':()=>import('../searchJobs'),
 './convex/kb/searchJobWorker.ts':()=>import('../searchJobWorker'),
 './convex/kb/meilisearch.ts':()=>import('../meilisearch'),
 './convex/kb/rag.ts':()=>import('../rag'),
 './convex/kb/settings.ts':()=>import('../settings'),
 './convex/kb/searchSecurity.ts':()=>import('../searchSecurity'),
 './convex/kb/searchCandidates.ts':()=>import('../searchCandidates'),
 './convex/kb/internals.ts':()=>import('../internals'),
 './convex/settings/internals.ts':()=>import('../../settings/internals'),
 './convex/settings/queries.ts':()=>import('../../settings/queries'),
 './convex/settings/mutations.ts':()=>import('../../settings/mutations'),
 './convex/membership/policyReads.ts':()=>import('../../membership/policyReads'),
};
async function fixture(){
 const t=convexTest({schema,modules});
 const ids=await t.run(async ctx=>{
  const role=await ctx.db.insert('roles',{name:'Search operator',slug:'search-operator',description:'Fixture',level:50,type:'internal',status:'active',isDefault:false,isProtected:false,pageAccess:[],capabilities:['kb.view'],createdAt:1,updatedAt:1});
  const user=await ctx.db.insert('users',{authSource:'local',email:'search@example.invalid',emailVerified:true,status:'active',roleId:role,createdAt:1,updatedAt:1});
  await ctx.db.insert('settings',{section:'plugins',values:{knowledgeBaseEnabled:true,membershipEnabled:false},updatedBy:user,updatedAt:1});
  const settings=await ctx.db.insert('settings',{section:'kb.search',values:{meilisearchEnabled:true,meilisearchUrl:'https://search.example.invalid',meilisearchApiKey:'b64:c3ludGhldGljLWtleQ==',ragEnabled:true,ragApiKey:'b64:c3ludGhldGljLWtleQ==',ragProvider:'openai'},updatedBy:user,updatedAt:1});
  const identity=await ctx.db.insert('convexpress_siteIdentity',{identityKey:'site-identity',websiteKey:'search-site',instanceKey:'search-staging',environmentKind:'staging',deploymentOrigin:'https://backend.example.invalid',managementOrigin:'https://backend-site.example.invalid',siteOrigin:'https://site.example.invalid',siteContractVersion:'1',schemaVersion:'1',engineVersion:'1',managementCapabilities:[],initializedAt:1,updatedAt:1});
  const article=await ctx.db.insert('kb_articles',{title:'Current guide',slug:'current-guide',excerpt:'Current description',content:'{}',contentPlainText:'Current guide body',status:'published',authorId:user,contributors:[],keywords:[],viewCount:0,uniqueViewCount:0,helpfulVotes:0,notHelpfulVotes:0,readingTimeMinutes:1,version:1,isFeatured:false,sortOrder:0,meilisearchSynced:false,ragSynced:false,createdAt:1,updatedAt:1});
  return {role,user,settings,identity,article};
 });
 return {t,ids,client:t.withIdentity({subject:ids.user,issuer:'https://convexpress-admin.local'})};
}
for(const endpoint of ['kb/meilisearch:syncArticle','kb/meilisearch:removeArticle','kb/rag:ingestArticle'])test(`${endpoint} denies anonymous, read-only and inactive actors before any provider request`,async()=>{
 const f=await fixture(),old=globalThis.fetch;let calls=0;globalThis.fetch=(async()=>{calls++;throw Error('Provider must not be called');}) as typeof fetch;
 try{
  await expect(f.t.action(ref<'action'>(endpoint),{articleId:f.ids.article})).rejects.toThrow();
  await expect(f.client.action(ref<'action'>(endpoint),{articleId:f.ids.article})).rejects.toThrow();
  await f.t.run(async ctx=>{await ctx.db.patch(f.ids.role,{capabilities:['kb.view','manage_options']});await ctx.db.patch(f.ids.user,{status:'inactive'});});
  await expect(f.client.action(ref<'action'>(endpoint),{articleId:f.ids.article})).rejects.toThrow();expect(calls).toBe(0);
 }finally{globalThis.fetch=old;}
});
test('search namespaces separate environments and restored databases and are stable for one backend',async()=>{
 const f=await fixture(),old=process.env.CONVEX_CLOUD_URL;
 try{
  process.env.CONVEX_CLOUD_URL='https://runtime-one.example.invalid';const a=await f.t.query(ref<'query'>('kb/searchSecurity:meilisearchIndex'),{});
  expect(await f.t.query(ref<'query'>('kb/searchSecurity:meilisearchIndex'),{})).toBe(a);
  process.env.CONVEX_CLOUD_URL='https://runtime-two.example.invalid';const b=await f.t.query(ref<'query'>('kb/searchSecurity:meilisearchIndex'),{});expect(b).not.toBe(a);
  await f.t.run(ctx=>ctx.db.patch(f.ids.identity,{instanceKey:'search-live'}));expect(await f.t.query(ref<'query'>('kb/searchSecurity:meilisearchIndex'),{})).not.toBe(b);
  expect(a).toMatch(/^cp_kb_[a-f0-9]{40}$/);
  delete process.env.CONVEX_CLOUD_URL;await expect(f.t.query(ref<'query'>('kb/searchSecurity:meilisearchIndex'),{})).rejects.toThrow('runtime URL');
 }finally{if(old===undefined)delete process.env.CONVEX_CLOUD_URL;else process.env.CONVEX_CLOUD_URL=old;}
});
test('denied help access does not reach either external search provider',async()=>{
 const f=await fixture(),old=globalThis.fetch;let calls=0;globalThis.fetch=(async()=>{calls++;throw Error('Provider must not be called');}) as typeof fetch;
 try{
  await f.t.run(async ctx=>{const plugins=(await ctx.db.query('settings').withIndex('by_section',q=>q.eq('section','plugins')).unique())!;await ctx.db.patch(plugins._id,{values:{knowledgeBaseEnabled:true,membershipEnabled:true}});const plan=await ctx.db.insert('membership_plans',{title:'Required plan',slug:'required-plan',status:'active',grantMode:'manual',priority:1,createdAt:1,updatedAt:1});await ctx.db.insert('membership_restriction_rules',{resourceType:'route',resourceIdOrKey:'/help/search',ruleMode:'allow_only',planIds:[plan],loginRequired:false,teaserMode:'hide',createdAt:1,updatedAt:1});});
  expect((await f.t.action(ref<'action'>('kb/meilisearch:searchMeilisearch'),{query:'guide'})).hits).toEqual([]);
  expect((await f.client.action(ref<'action'>('kb/rag:searchRag'),{query:'guide'})).results).toEqual([]);expect(calls).toBe(0);
 }finally{globalThis.fetch=old;}
});

test('Meilisearch receives a decoded key and a site-specific index; response metadata comes from current site data',async()=>{
 const f=await fixture(),oldFetch=globalThis.fetch,oldUrl=process.env.CONVEX_CLOUD_URL;let requestUrl='',authorization='',retrieve:unknown;
 process.env.CONVEX_CLOUD_URL='https://runtime.example.invalid';
 globalThis.fetch=(async(url,init)=>{requestUrl=String(url);authorization=new Headers(init?.headers).get('authorization')??'';retrieve=JSON.parse(String(init?.body)).attributesToRetrieve;expect(init?.redirect).toBe('error');expect(init?.signal).toBeDefined();return Response.json({hits:[{id:f.ids.article,title:'STALE PROVIDER TITLE',_formatted:{title:'<script>bad</script>'}}],processingTimeMs:1});}) as typeof fetch;
 try{
  const result=await f.t.action(ref<'action'>('kb/meilisearch:searchMeilisearch'),{query:'guide'});expect(result.hits[0].title).toBe('Current guide');expect(result.hits[0].excerpt).toBe('Current description');expect(JSON.stringify(result)).not.toContain('STALE');expect(authorization).toBe('Bearer synthetic-key');expect(requestUrl).toMatch(/\/indexes\/cp_kb_[a-f0-9]{40}\/search$/);expect(retrieve).toEqual(['id']);
 }finally{globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.CONVEX_CLOUD_URL;else process.env.CONVEX_CLOUD_URL=oldUrl;}
});
test('provider failures and malformed responses never echo provider contents',async()=>{
 const f=await fixture(),oldFetch=globalThis.fetch,oldUrl=process.env.CONVEX_CLOUD_URL;process.env.CONVEX_CLOUD_URL='https://runtime.example.invalid';
 try{
  for(const response of [new Response('provider-private-secret',{status:503}),new Response('provider-private-secret'),Response.json({hits:'provider-private-secret'}),Response.json({hits:[],processingTimeMs:'provider-private-secret'})]){
   globalThis.fetch=(async()=>response) as typeof fetch;let message='';try{await f.t.action(ref<'action'>('kb/meilisearch:searchMeilisearch'),{query:'guide'});}catch(error){message=String(error);}expect(message).not.toBe('');expect(message).not.toContain('provider-private-secret');
  }
  globalThis.fetch=(async()=>{throw Error('provider-private-secret');}) as typeof fetch;await expect(f.t.action(ref<'action'>('kb/meilisearch:searchMeilisearch'),{query:'guide'})).rejects.toThrow('could not be reached');
 }finally{globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.CONVEX_CLOUD_URL;else process.env.CONVEX_CLOUD_URL=oldUrl;}
});
test('unsupported embedding provider is rejected before sending its key to OpenAI',async()=>{
 const f=await fixture(),old=globalThis.fetch;let calls=0;globalThis.fetch=(async()=>{calls++;throw Error('Must not send a different provider key');}) as typeof fetch;
 try{await f.t.run(async ctx=>{await ctx.db.patch(f.ids.role,{capabilities:['manage_options']});const setting=(await ctx.db.get(f.ids.settings))!;await ctx.db.patch(f.ids.settings,{values:{...setting.values,ragProvider:'anthropic'}});});await expect(f.client.action(ref<'action'>('kb/rag:ingestArticle'),{articleId:f.ids.article})).rejects.toThrow('different provider');expect(calls).toBe(0);}
 finally{globalThis.fetch=old;}
});
test('oversized provider JSON is bounded before parsing',async()=>{
 const {readSearchProviderJson}=await import('../searchProviderHttp');await expect(readSearchProviderJson(new Response('x'.repeat(2*1024*1024+1)))).rejects.toThrow('oversized');
});

test('KB settings use the shared secret envelope and preserve a masked credential on subsequent saves',async()=>{
 const f=await fixture();await f.t.run(ctx=>ctx.db.patch(f.ids.role,{capabilities:['manage_options']}));
 await f.client.mutation(ref<'mutation'>('kb/settings:updateKbSettings'),{search:{meilisearchApiKey:'synthetic-new-key'}});
 const stored=await f.t.run(ctx=>ctx.db.get(f.ids.settings));expect(stored!.values.meilisearchApiKey).not.toBe('synthetic-new-key');
 const {decryptSettingSecret}=await import('../../helpers/settingsSecret');expect(await decryptSettingSecret(stored!.values.meilisearchApiKey)).toBe('synthetic-new-key');
 expect((await f.client.query(ref<'query'>('kb/settings:getKbSettings'),{})).search.meilisearchApiKey).toBe('__set__');
 await f.client.mutation(ref<'mutation'>('kb/settings:updateKbSettings'),{search:{meilisearchApiKey:'__set__'}});
 expect((await f.t.run(ctx=>ctx.db.get(f.ids.settings)))!.values.meilisearchApiKey).toBe(stored!.values.meilisearchApiKey);
});

test('switching embedding provider cannot retain a masked key belonging to the previous provider',async()=>{
 const f=await fixture();await f.t.run(async ctx=>{await ctx.db.patch(f.ids.role,{capabilities:['manage_options']});const settings=(await ctx.db.get(f.ids.settings))!;await ctx.db.patch(f.ids.settings,{values:{...settings.values,ragProvider:'anthropic'}});});
 await f.client.mutation(ref<'mutation'>('kb/settings:updateKbSettings'),{search:{ragProvider:'openai',ragApiKey:'__set__'}});
 expect((await f.t.run(ctx=>ctx.db.get(f.ids.settings)))!.values.ragApiKey).toBe('');
});

test("generic KB settings updates also clear another provider\'s retained key",async()=>{
 const f=await fixture();await f.t.run(async ctx=>{await ctx.db.patch(f.ids.role,{capabilities:['manage_options']});const setting=(await ctx.db.get(f.ids.settings))!;await ctx.db.patch(f.ids.settings,{values:{...setting.values,ragProvider:'anthropic'}});});
 await f.client.mutation(ref<'mutation'>('settings/mutations:updateSection'),{section:'kb.search',values:{ragProvider:'openai',ragApiKey:'__set__'}});
 expect((await f.t.run(ctx=>ctx.db.get(f.ids.settings)))!.values.ragApiKey).toBe('');
});

async function drainSearchJob(f: Awaited<ReturnType<typeof fixture>>, jobId: any) {
 for(let i=0;i<100;i++) { await new Promise(resolve=>setTimeout(resolve,1)); await f.t.finishInProgressScheduledFunctions(); const job=await f.t.run(ctx=>ctx.db.get('kb_search_jobs',jobId)); if(job&&job.status!=='running')return job; }
 throw Error('Search job did not reach a terminal or paused state');
}

for (const outcome of ['succeeded', 'failed', 'canceled', 'changed', 'configuration'] as const) test(`index writes require confirmed success and unchanged source: ${outcome}`, async () => {
 const f=await fixture(),oldFetch=globalThis.fetch,oldUrl=process.env.CONVEX_CLOUD_URL;
 process.env.CONVEX_CLOUD_URL='https://runtime.example.invalid';
 await f.t.run(ctx=>ctx.db.patch(f.ids.role,{capabilities:['manage_options']}));
 const indexName=await f.t.query(ref<'query'>('kb/searchSecurity:meilisearchIndex'),{});
 await f.t.run(ctx=>ctx.db.patch(f.ids.article,{meilisearchSynced:true,meilisearchSyncedAt:1}));
 let submissions=0,observations=0;
 globalThis.fetch=(async(url,init)=>{
  const path=new URL(String(url)).pathname;
  if(path.endsWith('/settings/filterable-attributes'))return Response.json(['status','categorySlug','id']);
  if(path.endsWith('/documents')){submissions++;expect(JSON.parse(String(init?.body))[0].title).toBe('Current guide');return Response.json({taskUid:7,indexUid:indexName,status:'enqueued'});}
  if(path==='/tasks/7'){
   observations++;expect((await f.t.run(ctx=>ctx.db.get(f.ids.article)))!.meilisearchSynced).toBe(false);
   if(outcome==='changed')await f.t.run(ctx=>ctx.db.patch(f.ids.article,{title:'Edited while indexing'}));
   if(outcome==='configuration')await f.t.run(async ctx=>{const settings=(await ctx.db.get(f.ids.settings))!;await ctx.db.patch(f.ids.settings,{values:{...settings.values,meilisearchUrl:'https://changed.example.invalid'}});});
   return Response.json({uid:7,indexUid:indexName,status:outcome==='changed'||outcome==='configuration'?'succeeded':outcome,error:{message:'provider-private-secret'}});
  }
  throw Error('Unexpected request');
 }) as typeof fetch;
 try{
  const requested=await f.client.action(ref<'action'>('kb/meilisearch:syncArticle'),{articleId:f.ids.article});
  const job=await drainSearchJob(f,requested.jobId);
  expect(job.status).toBe(outcome==='succeeded'?'complete':outcome==='changed'?'stale':outcome==='configuration'?'paused':'failed');
  expect(JSON.stringify(job)).not.toContain('provider-private-secret');
  expect((await f.t.run(ctx=>ctx.db.get(f.ids.article)))!.meilisearchSynced).toBe(outcome==='succeeded');expect(submissions).toBe(1);expect(observations).toBe(1);
 }finally{globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.CONVEX_CLOUD_URL;else process.env.CONVEX_CLOUD_URL=oldUrl;}
});

test('new index filters finish before document submission',async()=>{
 const f=await fixture(),oldFetch=globalThis.fetch,oldUrl=process.env.CONVEX_CLOUD_URL;process.env.CONVEX_CLOUD_URL='https://runtime.example.invalid';
 await f.t.run(ctx=>ctx.db.patch(f.ids.role,{capabilities:['manage_options']}));
 const indexName=await f.t.query(ref<'query'>('kb/searchSecurity:meilisearchIndex'),{});const steps:string[]=[];
 globalThis.fetch=(async(url,init)=>{
  const path=new URL(String(url)).pathname;
  if(path.endsWith('/settings/filterable-attributes')){
   if(init?.method!=='PUT'){steps.push('missing');return new Response('',{status:404});}
   steps.push('configure');const attrs=JSON.parse(String(init.body));expect(attrs.slice(0,3)).toEqual(['status','categorySlug','id']);expect(attrs[3]).toMatch(/^_convexpress_receipt_[a-f0-9]{64}$/);return Response.json({taskUid:1,indexUid:indexName,status:'enqueued'});
  }
  if(path==='/tasks/1'){steps.push('configured');return Response.json({uid:1,indexUid:indexName,status:'succeeded'});}
  if(path.endsWith('/documents')){steps.push('documents');return Response.json({taskUid:2,indexUid:indexName,status:'enqueued'});}
  if(path==='/tasks/2'){steps.push('indexed');return Response.json({uid:2,indexUid:indexName,status:'succeeded'});}
  throw Error('Unexpected request');
 }) as typeof fetch;
 try{const request=await f.client.action(ref<'action'>('kb/meilisearch:syncArticle'),{articleId:f.ids.article});expect((await drainSearchJob(f,request.jobId)).status).toBe('complete');expect(steps).toEqual(['missing','configure','configured','documents','indexed']);}
 finally{globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.CONVEX_CLOUD_URL;else process.env.CONVEX_CLOUD_URL=oldUrl;}
});

test('pending indexing observes the same task and does not resubmit on an elapsed window',async()=>{
 const {confirmMeilisearchTask}=await import('../meilisearchTasks');const old=globalThis.fetch;let count=0;
 globalThis.fetch=(async(url,init)=>{count++;expect(String(url)).toBe('https://search.example.invalid/tasks/9');expect(init?.method).toBeUndefined();return Response.json({uid:9,indexUid:'test_index',status:'processing'});}) as typeof fetch;
 try{await expect(confirmMeilisearchTask({url:'https://search.example.invalid',apiKey:'synthetic',indexName:'test_index'},Response.json({taskUid:9,indexUid:'test_index',status:'enqueued'}),async()=>null,{deadlineMs:0})).rejects.toThrow('still processing');expect(count).toBe(1);}
 finally{globalThis.fetch=old;}
});

test('task responses must belong to the expected index and acknowledged task',async()=>{
 const {parseMeilisearchTask}=await import('../meilisearchTasks');
 for(const raw of [{uid:2,indexUid:'other_site',status:'succeeded'},{uid:3,indexUid:'test_index',status:'succeeded'},{uid:2,indexUid:'test_index',status:'invented'}])expect(()=>parseMeilisearchTask(raw,'test_index',2)).toThrow('invalid task');
});

test('index deletion does not report success for a failed provider task',async()=>{
 const f=await fixture(),oldFetch=globalThis.fetch,oldUrl=process.env.CONVEX_CLOUD_URL;process.env.CONVEX_CLOUD_URL='https://runtime.example.invalid';await f.t.run(ctx=>ctx.db.patch(f.ids.role,{capabilities:['manage_options']}));const indexName=await f.t.query(ref<'query'>('kb/searchSecurity:meilisearchIndex'),{});
 globalThis.fetch=(async(url,init)=>new URL(String(url)).pathname.endsWith('filterable-attributes')?Response.json(['status','categorySlug','id']):Response.json(init?.method==='POST'?{taskUid:1,indexUid:indexName,status:'enqueued'}:{uid:1,indexUid:indexName,status:'failed'})) as typeof fetch;
 try{const request=await f.client.action(ref<'action'>('kb/meilisearch:removeArticle'),{articleId:f.ids.article});expect((await drainSearchJob(f,request.jobId)).status).toBe('failed');}
 finally{globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.CONVEX_CLOUD_URL;else process.env.CONVEX_CLOUD_URL=oldUrl;}
});

async function waitForPhase(f: Awaited<ReturnType<typeof fixture>>, jobId: any, phase: string) {
 for(let i=0;i<100;i++){await new Promise(resolve=>setTimeout(resolve,1));await f.t.finishInProgressScheduledFunctions();const job=await f.t.run(ctx=>ctx.db.get('kb_search_jobs',jobId));if(job?.phase===phase&&job.leaseUntil===0)return job;}
 throw Error('Expected job phase not observed');
}

test('durable polling and an operator handoff retain the same acknowledged task without another write',async()=>{
 const f=await fixture(),oldFetch=globalThis.fetch,oldUrl=process.env.CONVEX_CLOUD_URL;process.env.CONVEX_CLOUD_URL='https://runtime.example.invalid';await f.t.run(ctx=>ctx.db.patch(f.ids.role,{capabilities:['manage_options']}));const indexName=await f.t.query(ref<'query'>('kb/searchSecurity:meilisearchIndex'),{});let writes=0,done=false;
 globalThis.fetch=(async(url,init)=>{const path=new URL(String(url)).pathname;if(path.endsWith('filterable-attributes'))return Response.json(['status','categorySlug','id']);if(init?.method==='POST'){writes++;return Response.json({taskUid:29,indexUid:indexName,status:'enqueued'});}expect(path).toBe('/tasks/29');return Response.json({uid:29,indexUid:indexName,status:done?'succeeded':'processing'});}) as typeof fetch;
 try{
  const request=await f.client.action(ref<'action'>('kb/meilisearch:syncArticle'),{articleId:f.ids.article});const pending=await waitForPhase(f,request.jobId,'documentPoll');expect(pending.taskUid).toBe(29);expect(writes).toBe(1);
  await f.t.run(ctx=>ctx.db.patch(f.ids.user,{status:'inactive'}));await f.t.action(ref<'action'>('kb/searchJobWorker:advance'),{jobId:request.jobId,generation:pending.generation});
  const paused=await f.t.run(ctx=>ctx.db.get('kb_search_jobs',request.jobId));expect(paused!.status).toBe('paused');expect(paused!.taskUid).toBe(29);
  const other=await f.t.run(ctx=>ctx.db.insert('users',{authSource:'local',email:'next-search-operator@example.invalid',emailVerified:true,status:'active',roleId:f.ids.role,createdAt:1,updatedAt:1}));done=true;
  const next=f.t.withIdentity({subject:other,issuer:'https://convexpress-admin.local'});await next.mutation(ref<'mutation'>('kb/searchJobs:resume'),{jobId:request.jobId});const finished=await drainSearchJob(f,request.jobId);expect(finished.status).toBe('complete');expect(finished.actor.subject).toBe(other);expect(finished.taskUid).toBe(29);expect(writes).toBe(1);
 }finally{globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.CONVEX_CLOUD_URL;else process.env.CONVEX_CLOUD_URL=oldUrl;}
});

test('unknown write acknowledgements fence every subsequent write and cannot be resumed by resubmission',async()=>{
 const f=await fixture(),oldFetch=globalThis.fetch,oldUrl=process.env.CONVEX_CLOUD_URL;process.env.CONVEX_CLOUD_URL='https://runtime.example.invalid';await f.t.run(ctx=>ctx.db.patch(f.ids.role,{capabilities:['manage_options']}));let writes=0;
 globalThis.fetch=(async(_url,init)=>{if(init?.method==='POST'){writes++;throw Error('connection lost after submission');}return Response.json(['status','categorySlug','id']);}) as typeof fetch;
 try{
  const request=await f.client.action(ref<'action'>('kb/meilisearch:syncArticle'),{articleId:f.ids.article});const uncertain=await drainSearchJob(f,request.jobId);expect(uncertain.status).toBe('uncertain');expect(uncertain.phase).toBe('documentSubmitting');
  const repeated=await f.client.action(ref<'action'>('kb/meilisearch:syncArticle'),{articleId:f.ids.article});expect(repeated.jobId).toBe(request.jobId);expect(repeated.status).toBe('uncertain');
  await expect(f.client.mutation(ref<'mutation'>('kb/searchJobs:resume'),{jobId:request.jobId})).rejects.toThrow('may have accepted');await expect(f.client.action(ref<'action'>('kb/meilisearch:removeArticle'),{articleId:f.ids.article})).rejects.toThrow('existing indexing job');expect(writes).toBe(1);
 }finally{globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.CONVEX_CLOUD_URL;else process.env.CONVEX_CLOUD_URL=oldUrl;}
});

test('removing an external article clears the old synced flag before provider completion',async()=>{
 const f=await fixture(),oldFetch=globalThis.fetch,oldUrl=process.env.CONVEX_CLOUD_URL;process.env.CONVEX_CLOUD_URL='https://runtime.example.invalid';await f.t.run(async ctx=>{await ctx.db.patch(f.ids.role,{capabilities:['manage_options']});await ctx.db.patch(f.ids.article,{meilisearchSynced:true,meilisearchSyncedAt:1});});
 globalThis.fetch=(async(url)=>new URL(String(url)).pathname.endsWith('filterable-attributes') ? Response.json(['status','categorySlug','id']) : new Response('',{status:404})) as typeof fetch;
 try{const request=await f.client.action(ref<'action'>('kb/meilisearch:removeArticle'),{articleId:f.ids.article});expect((await drainSearchJob(f,request.jobId)).status).toBe('complete');const article=await f.t.run(ctx=>ctx.db.get(f.ids.article));expect(article!.meilisearchSynced).toBe(false);expect(article!.meilisearchSyncedAt).toBeUndefined();}
 finally{globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.CONVEX_CLOUD_URL;else process.env.CONVEX_CLOUD_URL=oldUrl;}
});

test('the recovery sweep resumes an expired worker lease by reading its persisted task',async()=>{
 const f=await fixture(),oldFetch=globalThis.fetch,oldUrl=process.env.CONVEX_CLOUD_URL;process.env.CONVEX_CLOUD_URL='https://runtime.example.invalid';await f.t.run(ctx=>ctx.db.patch(f.ids.role,{capabilities:['manage_options']}));const indexName=await f.t.query(ref<'query'>('kb/searchSecurity:meilisearchIndex'),{});let writes=0,taskReads=0;
 globalThis.fetch=(async(url,init)=>{if(init?.method==='POST')writes++;const path=new URL(String(url)).pathname;if(path.endsWith('filterable-attributes'))return Response.json(['status','categorySlug','id']);expect(path).toBe('/tasks/991');taskReads++;return Response.json({uid:991,indexUid:indexName,status:'succeeded'});}) as typeof fetch;
 try{
  const request=await f.client.action(ref<'action'>('kb/meilisearch:syncArticle'),{articleId:f.ids.article});const {searchDocumentFingerprint}=await import('../searchDocument');
  await f.t.run(async ctx=>{const article=(await ctx.db.get(f.ids.article))!;await ctx.db.patch('kb_search_jobs',request.jobId,{phase:'documentPoll',taskUid:991,fingerprint:searchDocumentFingerprint({...article,categorySlug:null,tags:[]}),lease:3,leaseUntil:Date.now()-1,nextRunAt:Date.now()-1});});
  await f.t.mutation(ref<'mutation'>('kb/searchJobs:recover'),{});const finished=await drainSearchJob(f,request.jobId);expect(finished.status).toBe('complete');expect(finished.taskUid).toBe(991);expect(taskReads).toBe(1);expect(writes).toBe(0);
  await f.t.action(ref<'action'>('kb/searchJobWorker:advance'),{jobId:request.jobId,generation:0});expect(taskReads).toBe(1);
 }finally{globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.CONVEX_CLOUD_URL;else process.env.CONVEX_CLOUD_URL=oldUrl;}
});

test('a late acknowledgement is retained after watchdog quarantine, then authority is rechecked',async()=>{
 const f=await fixture(),oldUrl=process.env.CONVEX_CLOUD_URL;process.env.CONVEX_CLOUD_URL='https://runtime.example.invalid';await f.t.run(ctx=>ctx.db.patch(f.ids.role,{capabilities:['manage_options']}));
 try{
  const request=await f.client.action(ref<'action'>('kb/meilisearch:syncArticle'),{articleId:f.ids.article});
  await f.t.run(async ctx=>{await ctx.db.patch('kb_search_jobs',request.jobId,{status:'uncertain',phase:'documentSubmitting',lease:4,leaseUntil:0});await ctx.db.patch(f.ids.user,{status:'inactive'});});
  await f.t.mutation(ref<'mutation'>('kb/searchJobs:acknowledge'),{jobId:request.jobId,generation:1,lease:4,taskUid:992});
  const paused=await drainSearchJob(f,request.jobId);expect(paused.status).toBe('paused');expect(paused.phase).toBe('documentPoll');expect(paused.taskUid).toBe(992);
 }finally{if(oldUrl===undefined)delete process.env.CONVEX_CLOUD_URL;else process.env.CONVEX_CLOUD_URL=oldUrl;}
});

test('completed operation identities stay immutable when another operation begins',async()=>{
 const f=await fixture(),oldFetch=globalThis.fetch,oldUrl=process.env.CONVEX_CLOUD_URL;process.env.CONVEX_CLOUD_URL='https://runtime.example.invalid';await f.t.run(ctx=>ctx.db.patch(f.ids.role,{capabilities:['manage_options']}));globalThis.fetch=(async(url)=>new URL(String(url)).pathname.endsWith('filterable-attributes') ? Response.json(['status','categorySlug','id']) : new Response('',{status:404})) as typeof fetch;
 try{
  const first=await f.client.action(ref<'action'>('kb/meilisearch:removeArticle'),{articleId:f.ids.article});await drainSearchJob(f,first.jobId);
  const second=await f.client.action(ref<'action'>('kb/meilisearch:removeArticle'),{articleId:f.ids.article});expect(second.jobId).not.toBe(first.jobId);await drainSearchJob(f,second.jobId);
  expect((await f.client.query(ref<'query'>('kb/searchJobs:status'),{jobId:first.jobId})).status).toBe('complete');expect(await f.t.run(ctx=>ctx.db.query('kb_search_jobs').withIndex('by_article',q=>q.eq('articleId',f.ids.article)).collect())).toHaveLength(2);
 }finally{globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.CONVEX_CLOUD_URL;else process.env.CONVEX_CLOUD_URL=oldUrl;}
});

for(const endpoint of ['kb/searchJobs:articleOptions','kb/searchJobs:list'])test(`${endpoint} denies read-only and inactive actors`,async()=>{
 const f=await fixture(),args={paginationOpts:{numItems:10,cursor:null}};
 await expect(f.t.query(ref<'query'>(endpoint),args)).rejects.toThrow();
 await expect(f.client.query(ref<'query'>(endpoint),args)).rejects.toThrow();
 await f.t.run(async ctx=>{await ctx.db.patch(f.ids.role,{capabilities:['manage_options']});await ctx.db.patch(f.ids.user,{status:'inactive'});});
 await expect(f.client.query(ref<'query'>(endpoint),args)).rejects.toThrow();
});
test('indexing history exposes bounded safe metadata including deleted articles',async()=>{
 const f=await fixture();await f.t.run(async ctx=>{
  await ctx.db.patch(f.ids.role,{capabilities:['manage_options']});
  for(let i=0;i<31;i++)await ctx.db.insert('kb_search_jobs',{articleId:f.ids.article,operation:'sync',actor:{subject:'PRIVATE_SUBJECT',issuer:'PRIVATE_ISSUER',tokenIdentifier:'PRIVATE_TOKEN_IDENTIFIER'},generation:1,lease:0,leaseUntil:0,nextRunAt:1,status:'complete',phase:'documentPoll',indexName:'PRIVATE_INDEX',configFingerprint:'PRIVATE_FINGERPRINT',providerUrl:'https://PRIVATE_PROVIDER.invalid',document:'PRIVATE_DOCUMENT',createdAt:i+1,updatedAt:i+1});
 });
 const seen:string[]=[];let cursor:string|null=null;
 do{const page=await f.client.query(ref<'query'>('kb/searchJobs:list'),{paginationOpts:{numItems:10,cursor}});
  expect(page.page.length).toBeLessThanOrEqual(10);expect(JSON.stringify(page)).not.toContain('PRIVATE_');
  for(const job of page.page){seen.push(job.jobId);expect(job.title).toBe('Current guide');expect(job.articleDeleted).toBe(false);}
  cursor=page.isDone?null:page.continueCursor;if(seen.length>31)throw Error('Duplicate history');
 }while(cursor);
 expect(new Set(seen).size).toBe(31);
 await f.t.run(ctx=>ctx.db.delete(f.ids.article));const page=await f.client.query(ref<'query'>('kb/searchJobs:list'),{paginationOpts:{numItems:10,cursor:null}});
 expect(page.page[0].title).toBe('Deleted article');expect(page.page[0].articleDeleted).toBe(true);
});
test('indexing picker searches titles and omits article bodies and author metadata',async()=>{
 const f=await fixture();await f.t.run(async ctx=>{await ctx.db.patch(f.ids.role,{capabilities:['manage_options']});await ctx.db.patch(f.ids.article,{title:'Needle title',contentPlainText:'PRIVATE_BODY_UNRELATED'});});
 const page=await f.client.query(ref<'query'>('kb/searchJobs:articleOptions'),{search:'Needle',paginationOpts:{numItems:10,cursor:null}});
 expect(page.page).toEqual([{articleId:f.ids.article,title:'Needle title',status:'published',meilisearchSynced:false}]);
 for(const endpoint of ['kb/searchJobs:list','kb/searchJobs:articleOptions'])for(const numItems of [0,-1,1.5,26])await expect(f.client.query(ref<'query'>(endpoint),{paginationOpts:{numItems,cursor:null}})).rejects.toThrow();
 await expect(f.client.query(ref<'query'>('kb/searchJobs:articleOptions'),{search:'x'.repeat(201),paginationOpts:{numItems:10,cursor:null}})).rejects.toThrow();
});

for(const changed of [false,true])test(`lost sync acknowledgement reconciles the exact receipt and snapshot, changed=${changed}`,async()=>{
 const f=await fixture(),oldFetch=globalThis.fetch,oldUrl=process.env.CONVEX_CLOUD_URL;process.env.CONVEX_CLOUD_URL='https://runtime.example.invalid';await f.t.run(ctx=>ctx.db.patch(f.ids.role,{capabilities:['manage_options']}));
 let writes=0;let stored:Record<string,unknown>={};let observed:Record<string,unknown>={};
 globalThis.fetch=(async(url,init)=>{const path=new URL(String(url)).pathname;if(path.endsWith('filterable-attributes'))return Response.json(['status','categorySlug','id']);if(init?.method==='POST'){writes++;stored=JSON.parse(String(init.body))[0];throw Error('lost acknowledgement');}return Response.json(observed);}) as typeof fetch;
 try{
  const request=await f.client.action(ref<'action'>('kb/meilisearch:syncArticle'),{articleId:f.ids.article});expect((await drainSearchJob(f,request.jobId)).status).toBe('uncertain');
  const reconcile=()=>f.client.action(ref<'action'>('kb/searchReconciliation:reconcile'),{jobId:request.jobId});
  observed={...stored,_convexpressReceipt:'another-operation'};expect((await reconcile()).status).toBe('uncertain');
  observed={...stored,title:'Different indexed body'};expect((await reconcile()).status).toBe('uncertain');
  observed=stored;if(changed)await f.t.run(ctx=>ctx.db.patch(f.ids.article,{title:'Edited after submission'}));
  const result=await reconcile();expect(result.status).toBe(changed?'stale':'complete');expect(result.reconciledBy).toBe('document');expect(result.taskUid).toBeUndefined();expect(writes).toBe(1);
  expect((await f.t.run(ctx=>ctx.db.get(f.ids.article)))!.meilisearchSynced).toBe(!changed);
 }finally{globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.CONVEX_CLOUD_URL;else process.env.CONVEX_CLOUD_URL=oldUrl;}
});
for(const operation of ['sync','remove'] as const)test(`lost ${operation==='sync'?'settings':'removal'} acknowledgement recovers its unique task receipt without replay`,async()=>{
 const f=await fixture(),oldFetch=globalThis.fetch,oldUrl=process.env.CONVEX_CLOUD_URL;process.env.CONVEX_CLOUD_URL='https://runtime.example.invalid';await f.t.run(ctx=>ctx.db.patch(f.ids.role,{capabilities:['manage_options']}));const indexName=await f.t.query(ref<'query'>('kb/searchSecurity:meilisearchIndex'),{});
 let writes=0;let settingsAttrs:string[]=[];let originalFilter='';let taskPage=0;
 globalThis.fetch=(async(url,init)=>{
  const path=new URL(String(url)).pathname;
  if(path.endsWith('filterable-attributes')){
   if(init?.method==='PUT'){writes++;settingsAttrs=JSON.parse(String(init.body));throw Error('lost settings acknowledgement');}
   return Response.json(operation==='sync'?[]:['status','categorySlug','id']);
  }
  if(path.endsWith('/documents/delete')){writes++;originalFilter=JSON.parse(String(init?.body)).filter;throw Error('lost deletion acknowledgement');}
  if(path==='/tasks'){
   taskPage++;if(taskPage===1)return Response.json({results:[{uid:100,indexUid:indexName,type:'documentDeletion',status:'succeeded',details:{originalFilter:'unrelated'}}],next:99});
   expect(new URL(String(url)).searchParams.get('from')).toBe('99');return Response.json({results:[{uid:42,indexUid:indexName,type:operation==='sync'?'settingsUpdate':'documentDeletion',status:'succeeded',details:operation==='sync'?{filterableAttributes:settingsAttrs}:{originalFilter}}],next:null});
  }
  if(path==='/tasks/42'||path==='/tasks/43')return Response.json({uid:path.endsWith('/42')?42:43,indexUid:indexName,status:'succeeded'});
  if(path.endsWith('/documents')){writes++;return Response.json({taskUid:43,indexUid:indexName,status:'enqueued'});}
  throw Error('Unexpected provider operation');
 }) as typeof fetch;
 try{
  const request=await f.client.action(ref<'action'>(operation==='sync'?'kb/meilisearch:syncArticle':'kb/meilisearch:removeArticle'),{articleId:f.ids.article});expect((await drainSearchJob(f,request.jobId)).status).toBe('uncertain');
  const reconcile=()=>f.client.action(ref<'action'>('kb/searchReconciliation:reconcile'),{jobId:request.jobId});expect((await reconcile()).status).toBe('uncertain');expect(writes).toBe(1);
  await reconcile();const done=await drainSearchJob(f,request.jobId);expect(done.status).toBe('complete');expect(done.reconciledBy).toBe('task');expect(done.taskUid).toBe(operation==='sync'?43:42);expect(writes).toBe(operation==='sync'?2:1);
  expect((await f.t.run(ctx=>ctx.db.get(f.ids.article)))!.status).toBe('published');
 }finally{globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.CONVEX_CLOUD_URL;else process.env.CONVEX_CLOUD_URL=oldUrl;}
});
test('reconciliation rejects anonymous, revoked and legacy operations without provider calls',async()=>{
 const f=await fixture(),oldFetch=globalThis.fetch,oldUrl=process.env.CONVEX_CLOUD_URL;process.env.CONVEX_CLOUD_URL='https://runtime.example.invalid';await f.t.run(ctx=>ctx.db.patch(f.ids.role,{capabilities:['manage_options']}));let calls=0;globalThis.fetch=(async()=>{calls++;throw Error('Must not contact provider');}) as typeof fetch;
 try{
  const request=await f.client.action(ref<'action'>('kb/meilisearch:syncArticle'),{articleId:f.ids.article});await f.t.run(ctx=>ctx.db.patch('kb_search_jobs',request.jobId,{status:'uncertain',phase:'documentSubmitting',receiptVersion:undefined}));
  await expect(f.t.action(ref<'action'>('kb/searchReconciliation:reconcile'),{jobId:request.jobId})).rejects.toThrow();
  await expect(f.client.action(ref<'action'>('kb/searchReconciliation:reconcile'),{jobId:request.jobId})).rejects.toThrow('older operation');
  await f.t.run(async ctx=>{await ctx.db.patch('kb_search_jobs',request.jobId,{receiptVersion:1});await ctx.db.patch(f.ids.user,{status:'inactive'});});
  await expect(f.client.action(ref<'action'>('kb/searchReconciliation:reconcile'),{jobId:request.jobId})).rejects.toThrow();expect(calls).toBe(0);
 }finally{globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.CONVEX_CLOUD_URL;else process.env.CONVEX_CLOUD_URL=oldUrl;}
});
test('receipt task matching rejects another index, ambiguous matches and non-advancing cursors',async()=>{
 const {findReceiptTask,settingsReceipt}=await import('../searchReconciliationProof');const f=await fixture(),oldUrl=process.env.CONVEX_CLOUD_URL;process.env.CONVEX_CLOUD_URL='https://runtime.example.invalid';await f.t.run(ctx=>ctx.db.patch(f.ids.role,{capabilities:['manage_options']}));
 try{
  const request=await f.client.action(ref<'action'>('kb/meilisearch:syncArticle'),{articleId:f.ids.article});const raw=(await f.t.run(ctx=>ctx.db.get('kb_search_jobs',request.jobId)))!;const job={...raw,status:'uncertain' as const,phase:'settingsSubmitting' as const,reconciliationCursor:20};const task={uid:10,indexUid:job.indexName,status:'succeeded',type:'settingsUpdate',details:{filterableAttributes:[settingsReceipt(job)]}};
  expect(()=>findReceiptTask(job,{results:[{...task,indexUid:'other_index'}],next:null})).toThrow();
  expect(()=>findReceiptTask(job,{results:[task,{...task,uid:9}],next:null})).toThrow('Ambiguous');
  expect(()=>findReceiptTask(job,{results:[],next:20})).toThrow();expect(findReceiptTask(job,{results:[task],next:null}).taskUid).toBe(10);
 }finally{if(oldUrl===undefined)delete process.env.CONVEX_CLOUD_URL;else process.env.CONVEX_CLOUD_URL=oldUrl;}
});

for(const race of ['revocation','configuration','generation'])test(`reconciliation rechecks ${race} after reading the provider`,async()=>{
 const f=await fixture(),oldFetch=globalThis.fetch,oldUrl=process.env.CONVEX_CLOUD_URL;process.env.CONVEX_CLOUD_URL='https://runtime.example.invalid';await f.t.run(ctx=>ctx.db.patch(f.ids.role,{capabilities:['manage_options']}));let stored:Record<string,unknown>={};let jobId:import('../../_generated/dataModel').Id<'kb_search_jobs'>;
 globalThis.fetch=(async(url,init)=>{
  if(new URL(String(url)).pathname.endsWith('filterable-attributes'))return Response.json(['status','categorySlug','id']);
  if(init?.method==='POST'){stored=JSON.parse(String(init.body))[0];throw Error('lost acknowledgement');}
  await f.t.run(async ctx=>{if(race==='revocation')await ctx.db.patch(f.ids.user,{status:'inactive'});else if(race==='configuration')await ctx.db.patch(f.ids.settings,{values:{meilisearchEnabled:false}});else await ctx.db.patch('kb_search_jobs',jobId,{generation:2});});
  return Response.json(stored);
 }) as typeof fetch;
 try{
  const request=await f.client.action(ref<'action'>('kb/meilisearch:syncArticle'),{articleId:f.ids.article});jobId=request.jobId;expect((await drainSearchJob(f,jobId)).status).toBe('uncertain');
  const run=f.client.action(ref<'action'>('kb/searchReconciliation:reconcile'),{jobId});if(race==='generation')await run;else await expect(run).rejects.toThrow();
  const job=await f.t.run(ctx=>ctx.db.get('kb_search_jobs',jobId));expect(job!.status).toBe('uncertain');expect(job!.reconciliationEvidence).toBeUndefined();expect((await f.t.run(ctx=>ctx.db.get(f.ids.article)))!.meilisearchSynced).toBe(false);
 }finally{globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.CONVEX_CLOUD_URL;else process.env.CONVEX_CLOUD_URL=oldUrl;}
});
