import {test,expect} from 'bun:test';
import {convexTest} from 'convex-test';
import schema from '../../schema';
import {readLearnerProgress} from '../learnerProgress';
import {insertWithMediaReferences} from '../../media/attachmentGuard';
import {RequestReadLedger} from '../../helpers/requestReadLedger';
import {rebuildCurriculumCounts} from '../../lms/curriculumCountRecovery';
import {recoverProgressCounts} from '../../lms/progress/countRecovery';
const modules={'./convex/_generated/api.js':()=>import('../../_generated/api.js'),'./convex/_generated/server.js':()=>import('../../_generated/server.js'),'./convex/membership/policyReads.ts':()=>import('../../membership/policyReads')};
const scope={websiteKey:'school',instanceKey:'staging'};
async function fixture(){
 const t=convexTest({schema,modules});
 const ids=await t.run(async ctx=>{
  const role=await ctx.db.insert('roles',{name:'Learner',slug:'learner',description:'Fixture',level:20,type:'customer',isDefault:true,isProtected:false,capabilities:[],pageAccess:[],status:'active',createdAt:1,updatedAt:1});
  const user=await ctx.db.insert('users',{authSource:'clerk',clerkUserId:'clerk_learner_one',email:'PRIVATE@example.invalid',emailVerified:true,roleId:role,status:'active',createdAt:1,updatedAt:1});
  const other=await ctx.db.insert('users',{authSource:'clerk',clerkUserId:'clerk_learner_two',email:'OTHER@example.invalid',emailVerified:true,roleId:role,status:'active',createdAt:1,updatedAt:1});
  const setting=await ctx.db.insert('settings',{section:'plugins',values:{lmsEnabled:true,membershipEnabled:true},updatedBy:user,updatedAt:1});
  const courses=[],nodes=[];
  for(let i=0;i<8;i++){
   const course=await insertWithMediaReferences(ctx,'lms_courses',{title:`Course ${i}`,slug:`course-${i}`,descriptionDoc:{text:'PRIVATE BODY'},status:'published',accessMode:'open',authorId:user,createdAt:i,updatedAt:1});courses.push(course);
   const lesson=await ctx.db.insert('lms_nodes',{courseId:course,kind:'lesson',title:'Lesson 1',position:0,createdAt:1,updatedAt:1});nodes.push(lesson);
   await ctx.db.insert('lms_nodes',{courseId:course,kind:'lesson',title:'Lesson 2',position:1,createdAt:1,updatedAt:1});
   if(i<7)await ctx.db.insert('lms_progress',{courseId:course,userId:user,nodeId:lesson,completed:true});
  }
  await ctx.db.insert('lms_progress',{courseId:courses[7],userId:other,nodeId:nodes[7],completed:true});
  return {role,user,other,setting,courses,nodes};
 });
 const as=(id=ids.user)=>{const subject=id===ids.user?'clerk_learner_one':'clerk_learner_two';return t.withIdentity({subject,issuer:'https://school.clerk.accounts.dev',tokenIdentifier:`https://school.clerk.accounts.dev|${subject}`});};
 const recover=async()=>{while(!(await t.run(rebuildCurriculumCounts)).done){};for(let i=0;i<1000;i++)if((await t.run(recoverProgressCounts)).done)return;throw Error('Recovery did not finish');};
 return {t,ids,as,recover,read:(args:unknown={},s=scope,doc='page')=>as().run(ctx=>readLearnerProgress(ctx,args,s,doc))};
}
test('summary exposes only the signed-in learner courses, with strict personal pagination and no private source fields',async()=>{
 const f=await fixture();await f.recover();let cursor:string|null=null;const seen:string[]=[];
 do{const page=await f.read({cursor});expect(page.state).toBe('ready');expect(page.items.length).toBeLessThanOrEqual(6);for(const item of page.items)expect(item.progress).toEqual({completed:1,total:2,percent:50});seen.push(...page.items.map(c=>c.id));cursor=page.nextCursor;for(const secret of ['PRIVATE','userId','email','descriptionDoc'])expect(JSON.stringify(page)).not.toContain(secret);}while(cursor);
 expect(new Set(seen).size).toBe(7);expect(seen).not.toContain(f.ids.courses[7]);
 const other=await f.as(f.ids.other).run(ctx=>readLearnerProgress(ctx,{},scope,'page'));expect(other.items.map(c=>c.id)).toEqual([f.ids.courses[7]]);
 const anonymous=await f.t.run(ctx=>readLearnerProgress(ctx,{},scope,'page'));expect(anonymous).toEqual({state:'signedOut',items:[],cursor:null,nextCursor:null});
 await expect(f.read({userId:f.ids.other})).rejects.toThrow();
});
test('unknown totals stay pending, fresh selected courses show zero only after curriculum recovery, and exact completed lessons are retained',async()=>{
 const f=await fixture();expect((await f.read()).items.every(c=>'state' in c.progress)).toBe(true);
 await f.recover();const selected=await f.read({scope:'course',course:f.ids.courses[7]});expect(selected.items[0].progress).toEqual({completed:0,total:2,percent:0});
 expect((await f.read({scope:'course'})).state).toBe('unavailable');
});
test('cursor cannot cross learner, site, environment, document or selected-course mode',async()=>{
 const f=await fixture(),page=await f.read(),args={cursor:page.nextCursor};expect(page.nextCursor).not.toBeNull();
 await expect(f.as(f.ids.other).run(ctx=>readLearnerProgress(ctx,args,scope,'page'))).rejects.toThrow('another learner');
 for(const s of [{...scope,websiteKey:'other'},{...scope,instanceKey:'live'}])await expect(f.read(args,s)).rejects.toThrow('another learner');
 await expect(f.read(args,scope,'other')).rejects.toThrow('another learner');await expect(f.read({...args,scope:'course',course:f.ids.courses[0]})).rejects.toThrow('another learner');
});
test('revoked course access, unpublished courses and inactive users suppress personal progress, even for a staff editor',async()=>{
 const f=await fixture();await f.t.run(async ctx=>{await ctx.db.patch(f.ids.role,{type:'internal',capabilities:['lms.course.view','lms.course.edit']});await ctx.db.patch(f.ids.courses[0],{accessMode:'buy'});await ctx.db.patch(f.ids.courses[1],{status:'draft'});});
 const page=await f.read();expect(page.items.some(c=>c.id===f.ids.courses[0]||c.id===f.ids.courses[1])).toBe(false);
 await f.t.run(ctx=>ctx.db.patch(f.ids.user,{status:'inactive'}));expect((await f.read()).state).toBe('signedOut');
 await f.t.run(ctx=>ctx.db.patch(f.ids.setting,{values:{lmsEnabled:false}}));expect((await f.read()).state).toBe('unavailable');
});
test('one thousand lesson progress rows in one course do not increase catalog discovery reads',async()=>{
 const f=await fixture();
 const observe=()=>f.as().run(async ctx=>{const ledger=new RequestReadLedger();const result=await readLearnerProgress(ctx,{},scope,'page',ledger);return {result,queries:ledger.queries,documents:ledger.documents};});
 const before=await observe();await f.t.run(async ctx=>{for(let i=0;i<1000;i++)await ctx.db.insert('lms_progress',{courseId:f.ids.courses[0],userId:f.ids.user,nodeId:f.ids.nodes[0],completed:true});});
 const after=await observe();expect(after.result).toEqual(before.result);expect(after.queries).toBe(before.queries);expect(after.documents).toBe(before.documents);
});
