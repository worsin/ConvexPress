import {test,expect} from 'bun:test';
import {convexTest} from 'convex-test';
import schema from '../../schema';
import {readCurriculum} from '../curriculum';
import {insertWithMediaReferences} from '../../media/attachmentGuard';
import {RequestReadLedger} from '../../helpers/requestReadLedger';
const modules={'./convex/_generated/api.js':()=>import('../../_generated/api.js'),'./convex/_generated/server.js':()=>import('../../_generated/server.js'),'./convex/membership/policyReads.ts':()=>import('../../membership/policyReads')};
const scope={websiteKey:'school',instanceKey:'staging'};
async function fixture(){
 const t=convexTest({schema,modules});
 const ids=await t.run(async ctx=>{
  const user=await ctx.db.insert('users',{authSource:'local',email:'private@example.invalid',emailVerified:true,status:'active',createdAt:1,updatedAt:1});
  const setting=await ctx.db.insert('settings',{section:'plugins',values:{lmsEnabled:true,membershipEnabled:true},updatedBy:user,updatedAt:1});
  const course=await insertWithMediaReferences(ctx,'lms_courses',{title:'A practice of clay',slug:'practice-clay',descriptionDoc:{text:'PRIVATE COURSE'},status:'published',accessMode:'buy',authorId:user,createdAt:1,updatedAt:1});
  const first=await ctx.db.insert('lms_nodes',{courseId:course,kind:'lesson',title:'Before we begin',position:-1,bodyDoc:{text:'PRIVATE LESSON'},createdAt:1,updatedAt:1});
  const topic=await ctx.db.insert('lms_nodes',{courseId:course,kind:'topic',title:'Foundations',position:0,description:'PRIVATE TOPIC',createdAt:1,updatedAt:1});
  const entries=[];for(let i=0;i<18;i++)entries.push(await ctx.db.insert('lms_nodes',{courseId:course,parentId:topic,kind:i===2?'section_heading':'lesson',title:`Study ${i}`,position:i,bodyDoc:{text:'PRIVATE BODY'},materialsDoc:{text:'PRIVATE MATERIAL'},videoUrl:'https://private.invalid/secret.mp4',transcriptText:'PRIVATE TRANSCRIPT',createdAt:1,updatedAt:1}));
  const empty=await ctx.db.insert('lms_nodes',{courseId:course,kind:'topic',title:'Next steps',position:1,createdAt:1,updatedAt:1});
  return {user,course,first,topic,entries,empty,setting};
 });
 return {t,ids,read:(args:Record<string,unknown>={},s=scope,doc='page')=>t.run(ctx=>readCurriculum(ctx,{course:ids.course,...args},s,doc))};
}
test('published course outline pages through root lessons, long modules and section headings without private payloads or invented lesson links',async()=>{
 const f=await fixture();let cursor:string|null=null;const seen:string[]=[],topics:string[]=[];let continued=false,pages=0;
 do{const result=await f.read({cursor});expect(result.course?.title).toBe('A practice of clay');expect(result.course?.href).toBe('/courses/practice-clay');
  for(const group of result.groups){seen.push(...group.entries.map(e=>e.id));if(group.topic&&!group.topic.continued)topics.push(group.topic.id);if(group.topic?.continued)continued=true;}
  for(const field of ['PRIVATE','bodyDoc','materialsDoc','videoUrl','transcriptText','isPreview'])expect(JSON.stringify(result)).not.toContain(field);
  expect(result.groups.flatMap(g=>g.entries).length).toBeLessThanOrEqual(8);cursor=result.nextCursor;if(++pages>10)throw Error('Pagination failed to converge');
 }while(cursor);
 expect(seen).toEqual([f.ids.first,...f.ids.entries]);expect(new Set(seen).size).toBe(19);expect(topics).toEqual([f.ids.topic,f.ids.empty]);expect(continued).toBe(true);expect(pages).toBe(3);
});
test('unpublished, missing, restricted and disabled courses disclose no outline',async()=>{
 const f=await fixture();expect((await f.read({course:undefined})).course).toBeNull();expect((await f.read({course:'missing'})).course).toBeNull();
 await f.t.run(ctx=>ctx.db.patch(f.ids.course,{status:'draft'}));expect((await f.read()).course).toBeNull();
 await f.t.run(async ctx=>{await ctx.db.patch(f.ids.course,{status:'published'});await ctx.db.insert('membership_restriction_rules',{resourceType:'route',resourceIdOrKey:'/courses/practice-clay',ruleMode:'allow_only',planIds:[],loginRequired:true,teaserMode:'hide',createdAt:1,updatedAt:1});});expect((await f.read()).groups).toEqual([]);
 await f.t.run(ctx=>ctx.db.patch(f.ids.setting,{values:{lmsEnabled:false}}));expect((await f.read()).course).toBeNull();
});
test('continuation binds the course, document and environment; moved modules require a fresh outline',async()=>{
 const f=await fixture(),first=await f.read(),args={cursor:first.nextCursor};expect(first.nextCursor).not.toBeNull();
 for(const s of [{...scope,websiteKey:'other'},{...scope,instanceKey:'live'}])await expect(f.read(args,s)).rejects.toThrow('another course');
 await expect(f.read(args,scope,'other')).rejects.toThrow('another course');await expect(f.read({...args,course:'different'})).rejects.toThrow('another course');
 await expect(f.read({cursor:'malformed'})).rejects.toThrow('Invalid curriculum cursor');
 await f.t.run(ctx=>ctx.db.patch(f.ids.topic,{position:10}));await expect(f.read(args)).rejects.toThrow('curriculum changed');
});
test('deleting a continued module advances to the following root without orphan lesson exposure',async()=>{
 const f=await fixture(),first=await f.read();await f.t.run(ctx=>ctx.db.delete(f.ids.topic));
 const next=await f.read({cursor:first.nextCursor});expect(next.groups.flatMap(g=>g.entries)).toEqual([]);expect(next.groups[0].topic?.id).toBe(f.ids.empty);expect(next.nextCursor).toBeNull();
});
test('a thousand additional lessons do not increase first-page reads and read budgets fail explicitly',async()=>{
 const f=await fixture();const observe=()=>f.t.run(async ctx=>{const budget=new RequestReadLedger();const data=await readCurriculum(ctx,{course:f.ids.course},scope,'page',budget);return {data,queries:budget.queries,documents:budget.documents};});
 const before=await observe();await f.t.run(async ctx=>{for(let i=0;i<1000;i++)await ctx.db.insert('lms_nodes',{courseId:f.ids.course,parentId:f.ids.topic,kind:'lesson',title:`Later ${i}`,position:100+i,createdAt:1,updatedAt:1});});
 const after=await observe();expect(after).toEqual(before);expect(after.documents).toBeLessThan(20);
 await expect(f.t.run(ctx=>readCurriculum(ctx,{course:f.ids.course},scope,'page',new RequestReadLedger({queries:2,documents:2,bytes:1024,documentBytes:1024})))).rejects.toThrow('safe read budget');
});
