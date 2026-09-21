import {test,expect} from 'bun:test';
import {convexTest} from 'convex-test';
import schema from '../../schema';
import {readInstructor} from '../instructor';
import {insertWithMediaReferences} from '../../media/attachmentGuard';
import {instructorResultSchema,instructorMatchesArgs} from '../foundation/instructorContracts';
const modules={'./convex/_generated/api.js':()=>import('../../_generated/api.js'),'./convex/_generated/server.js':()=>import('../../_generated/server.js'),'./convex/membership/policyReads.ts':()=>import('../../membership/policyReads')};
const scope={websiteKey:'school',instanceKey:'staging'};
async function fixture(){
 const t=convexTest({schema,modules});
 const ids=await t.run(async ctx=>{
  const role=await ctx.db.insert('roles',{name:'Instructor',slug:'instructor',description:'Fixture',level:60,type:'internal',isDefault:false,isProtected:false,capabilities:[],pageAccess:[],status:'active',createdAt:1,updatedAt:1});
  const user=await ctx.db.insert('users',{authSource:'local',displayName:'Robin Ellis',bio:'Working with curiosity.',email:'PRIVATE@example.invalid',emailVerified:true,roleId:role,status:'active',createdAt:1,updatedAt:1});
  const other=await ctx.db.insert('users',{authSource:'local',displayName:'Other teacher',email:'OTHER@example.invalid',emailVerified:true,roleId:role,status:'active',createdAt:1,updatedAt:1});
  const setting=await ctx.db.insert('settings',{section:'plugins',values:{lmsEnabled:true,membershipEnabled:true},updatedBy:user,updatedAt:1});
  const courses=[];
  for(let i=0;i<8;i++)courses.push(await insertWithMediaReferences(ctx,'lms_courses',{title:`Course ${i}`,slug:`course-${i}`,descriptionDoc:{text:'PRIVATE BODY'},status:i===7?'draft':'published',accessMode:'open',authorId:user,createdAt:i,updatedAt:1}));
  return {role,user,other,setting,courses};
 });
 return {t,ids,read:(args:Record<string,unknown>={},s=scope,doc='page')=>t.run(ctx=>readInstructor(ctx,{instructor:ids.user,...args},s,doc))};
}
test('public instructor pages expose only profile and published course routes, with complete bounded pagination',async()=>{
 const f=await fixture(),first=await f.read();expect(first.courses.length).toBe(6);expect(first.instructor?.name).toBe('Robin Ellis');expect(first.nextCursor).not.toBeNull();
 const last=await f.read({cursor:first.nextCursor});expect(last.courses.length).toBe(1);expect(last.nextCursor).toBeNull();
 expect([...first.courses,...last.courses].map(c=>c.id)).toEqual(f.ids.courses.slice(0,7).reverse());
 const raw=JSON.stringify(first);for(const secret of ['PRIVATE','email','roleId','descriptionDoc','accessMode'])expect(raw).not.toContain(secret);
 expect((await f.read({instructor:f.ids.other})).instructor).toBeNull();expect((await f.read({instructor:undefined})).instructor).toBeNull();
});
test('inactive, management, customer and roleless identities never become public instructors',async()=>{
 const f=await fixture();
 for(const patch of [{status:'inactive'},{status:'active',authSource:'management'},{authSource:'local',internalRole:'management'},{internalRole:undefined,roleId:undefined}]){
  await f.t.run(ctx=>ctx.db.patch(f.ids.user,patch as any));expect((await f.read()).instructor).toBeNull();
 }
 await f.t.run(async ctx=>{await ctx.db.patch(f.ids.user,{roleId:f.ids.role});await ctx.db.patch(f.ids.role,{type:'customer'});});expect((await f.read()).instructor).toBeNull();
 await f.t.run(ctx=>ctx.db.patch(f.ids.role,{type:'internal',status:'inactive'}));expect((await f.read()).instructor).toBeNull();
});
test('cursor binding rejects another teacher, document, website or environment and malformed input',async()=>{
 const f=await fixture(),first=await f.read(),args={cursor:first.nextCursor};
 await expect(f.read({...args,instructor:f.ids.other})).rejects.toThrow('another source');
 await expect(f.read(args,scope,'other-page')).rejects.toThrow('another source');
 for(const s of [{...scope,websiteKey:'other'},{...scope,instanceKey:'live'}])await expect(f.read(args,s)).rejects.toThrow('another source');
 await expect(f.read({cursor:'bad'})).rejects.toThrow('Invalid instructor cursor');await expect(f.read({userId:f.ids.other})).rejects.toThrow();
 expect(instructorMatchesArgs({instructor:f.ids.other,cursor:null},first)).toBe(false);
 expect(instructorResultSchema.safeParse({...first,email:'private'}).success).toBe(false);
 expect(instructorResultSchema.safeParse({...first,courses:[{...first.courses[0],href:'/admin'}]}).success).toBe(false);
});
test('restricted course pages preserve a continuation without leaking the instructor or hiding the next public page',async()=>{
 const f=await fixture();await f.t.run(async ctx=>{for(let i=1;i<7;i++)await ctx.db.insert('membership_restriction_rules',{resourceType:'route',resourceIdOrKey:`/courses/course-${i}`,ruleMode:'allow_only',planIds:[],loginRequired:true,teaserMode:'hide',createdAt:1,updatedAt:1});});
 const first=await f.read();expect(first.instructor).toBeNull();expect(first.courses).toEqual([]);expect(first.nextCursor).not.toBeNull();
 const last=await f.read({cursor:first.nextCursor});expect(last.courses.map(c=>c.title)).toEqual(['Course 0']);
 await f.t.run(ctx=>ctx.db.insert('membership_restriction_rules',{resourceType:'route',resourceIdOrKey:'/courses',ruleMode:'allow_only',planIds:[],loginRequired:true,teaserMode:'hide',createdAt:1,updatedAt:1}));expect((await f.read()).instructor).toBeNull();
});
test('withdrawal, email-shaped names, unsafe images and disabled LMS are handled on each read',async()=>{
 const f=await fixture();await f.t.run(ctx=>ctx.db.patch(f.ids.user,{displayName:'PRIVATE@example.invalid',avatarUrl:'javascript:alert(1)'}));
 const result=await f.read();expect(result.instructor?.name).toBe('Instructor');expect(result.instructor?.image).toBeNull();
 await f.t.run(ctx=>ctx.db.patch(f.ids.user,{avatarUrl:'https://media.example.invalid/portrait.jpg'}));expect((await f.read()).instructor?.image?.src).toBe('https://media.example.invalid/portrait.jpg');
 await f.t.run(async ctx=>{for(const id of f.ids.courses)await ctx.db.patch(id,{status:'archived'});});expect((await f.read()).instructor).toBeNull();
 await f.t.run(ctx=>ctx.db.patch(f.ids.setting,{values:{lmsEnabled:false}}));expect((await f.read()).courses).toEqual([]);
});


test('equal creation dates page without duplicates, and removal of the boundary course does not restart the catalog',async()=>{
 const f=await fixture();await f.t.run(async ctx=>{for(const id of f.ids.courses)await ctx.db.patch(id,{createdAt:1});});
 const first=await f.read(),lastId=first.courses.at(-1)!.id;
 await f.t.run(ctx=>ctx.db.patch(f.ids.courses.find(id=>id===lastId)!,{status:'archived'}));
 const last=await f.read({cursor:first.nextCursor});
 expect(last.courses.length).toBe(1);expect(first.courses.some(c=>c.id===last.courses[0].id)).toBe(false);expect(last.nextCursor).toBeNull();
});
