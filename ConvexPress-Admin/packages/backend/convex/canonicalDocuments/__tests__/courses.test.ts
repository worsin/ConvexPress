import {rebuildCurriculumCounts} from "../../lms/curriculumCountRecovery";
import {recoverProgressCounts} from "../../lms/progress/countRecovery";
import {test,expect} from 'bun:test';
import {convexTest} from 'convex-test';
import schema from '../../schema';
import {readCourses} from '../courses';
import {insertWithMediaReferences} from '../../media/attachmentGuard';
import {RequestReadLedger} from '../../helpers/requestReadLedger';
const modules={'./convex/_generated/api.js':()=>import('../../_generated/api.js'),'./convex/_generated/server.js':()=>import('../../_generated/server.js'),'./convex/membership/policyReads.ts':()=>import('../../membership/policyReads')};
const scope={websiteKey:'school',instanceKey:'staging'};
async function fixture(){
 const t=convexTest({schema,modules});
 const ids=await t.run(async ctx=>{
  const role=await ctx.db.insert('roles',{name:'Learner',slug:'learner',description:'Fixture',level:20,type:'customer',isDefault:true,isProtected:false,capabilities:[],pageAccess:[],status:'active',createdAt:1,updatedAt:1});
  const user=await ctx.db.insert('users',{authSource:'local',email:'course-card@example.invalid',emailVerified:true,roleId:role,status:'active',createdAt:1,updatedAt:1});
  const other=await ctx.db.insert('users',{authSource:'local',email:'other-card@example.invalid',emailVerified:true,roleId:role,status:'active',createdAt:1,updatedAt:1});
  const setting=await ctx.db.insert('settings',{section:'plugins',values:{lmsEnabled:true,membershipEnabled:true},updatedBy:user,updatedAt:1});
  const courses=[];
  for(let i=0;i<7;i++)courses.push(await insertWithMediaReferences(ctx,'lms_courses',{title:`Course ${i}`,slug:`course-${i}`,excerpt:`Public excerpt ${i}`,descriptionDoc:{text:'PRIVATE BODY'},materialsDoc:{text:'PRIVATE MATERIALS'},status:'published',accessMode:'open',authorId:user,categoryIds:[i%2?'clay':'wood'],createdAt:i,updatedAt:1}));
  const lessons=[];
  for(let i=0;i<200;i++){
   const nodeId=await ctx.db.insert('lms_nodes',{courseId:courses[6],kind:'lesson',title:`Lesson ${i}`,position:i,createdAt:1,updatedAt:1});lessons.push(nodeId);
   if(i<199)await ctx.db.insert('lms_progress',{courseId:courses[6],userId:user,nodeId,completed:true});
  }
  await ctx.db.insert('lms_progress',{courseId:courses[6],userId:user,nodeId:lessons[0],completed:true});
  await ctx.db.insert('lms_progress',{courseId:courses[6],userId:other,nodeId:lessons[199],completed:true});
  return {user,other,courses,lessons,setting};
 });
 const viewer=t.withIdentity({subject:String(ids.user),issuer:'https://convexpress-admin.local',tokenIdentifier:`https://convexpress-admin.local|${ids.user}`});
 const recover=async()=>{while(!(await t.run(rebuildCurriculumCounts)).done){};for(let i=0;i<1000;i++){if((await t.run(recoverProgressCounts)).done)return;}throw Error('Recovery did not converge');};
 return {t,ids,viewer,recover,read:(args:unknown={})=>t.run(ctx=>readCourses(ctx,args,scope,'page'))};
}
test('course cards project public fields, page the catalog and never return anonymous progress',async()=>{
 const f=await fixture();let cursor:string|null=null;const seen:string[]=[];
 do{const page=await f.read({limit:3,cursor});expect(page.state).toBe('ready');expect(page.cursor).toBe(cursor);expect(JSON.stringify(page)).not.toContain('PRIVATE');expect(page.items.every(c=>c.progress===null&&c.href===`/courses/${c.slug}`)).toBe(true);seen.push(...page.items.map(c=>c.id));cursor=page.nextCursor;}while(cursor);
 expect(seen).toEqual([...f.ids.courses].reverse());expect(new Set(seen).size).toBe(7);
 const wood=await f.read({query:{category:'WOOD'}});expect(wood.items.map(c=>c.title)).toEqual(['Course 6','Course 4','Course 2','Course 0']);
 await expect(f.read({userId:f.ids.other})).rejects.toThrow();
});
test('signed-in cards show only the actual active learner unique progress and exact 99% boundary',async()=>{
 const f=await fixture();const read=()=>f.viewer.run(ctx=>readCourses(ctx,{},scope,'page'));
 expect((await read()).items[0].progress).toEqual({state:'preparing'});
 await f.recover();
 expect((await read()).items[0].progress).toEqual({completed:199,total:200,percent:99});
 await f.t.run(ctx=>ctx.db.patch(f.ids.user,{status:'inactive'}));expect((await read()).items.every(c=>c.progress===null)).toBe(true);
});
test('course access revocation suppresses learner progress and route restriction hides the card',async()=>{
 const f=await fixture();
 await f.t.run(ctx=>ctx.db.patch(f.ids.courses[6],{accessMode:'buy'}));
 const read=()=>f.viewer.run(ctx=>readCourses(ctx,{},scope,'page'));
 expect((await read()).items[0].progress).toBeNull();
 await f.t.run(ctx=>ctx.db.insert('membership_restriction_rules',{resourceType:'route',resourceIdOrKey:'/courses/course-6',ruleMode:'allow_only',planIds:[],loginRequired:true,teaserMode:'hide',createdAt:1,updatedAt:1}));
 expect((await f.read()).items.some(c=>c.id===f.ids.courses[6])).toBe(false);
});
test('maintained progress fits a fixed budget while low-budget refusal and cursor binding remain enforced',async()=>{
 const f=await fixture();const page=await f.read({limit:2});
 await expect(f.t.run(ctx=>readCourses(ctx,{limit:2,cursor:page.nextCursor},{...scope,instanceKey:'live'},'page'))).rejects.toThrow('another document');
 await f.recover();
 const budget=new RequestReadLedger({queries:128,documents:32,bytes:128*1024,documentBytes:16*1024});
 expect((await f.viewer.run(ctx=>readCourses(ctx,{limit:1},scope,'page',budget))).items[0].progress).toEqual({completed:199,total:200,percent:99});
 await expect(f.viewer.run(ctx=>readCourses(ctx,{limit:1},scope,'page',new RequestReadLedger({queries:1,documents:1,bytes:1024,documentBytes:1024})))).rejects.toThrow('safe read budget');
 await f.t.run(ctx=>ctx.db.patch(f.ids.setting,{values:{lmsEnabled:false}}));expect((await f.read()).items).toEqual([]);
});
