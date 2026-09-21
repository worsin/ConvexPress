import {streamQuery} from "convex-helpers/server/pagination";
import schema from "../schema";
import {z} from 'zod';
import {sha256Hex} from '@convexpress/site-contract';
import type {Doc,Id} from '../_generated/dataModel';
import type {QueryCtx} from '../_generated/server';
import {isPluginEnabled} from '../helpers/plugins';
import {isPublicAuthor} from '../helpers/publicAuthor';
import {RequestReadLedger} from '../helpers/requestReadLedger';
import {createMembershipAccessEvaluator} from '../membership/access';
import {CanonicalDataError,stableKey,type DataScope} from './foundation/contracts';
import {instructorArgsSchema,instructorProfileSchema,instructorCourseSchema,instructorResultSchema,type InstructorResult} from './foundation/instructorContracts';
const cursorSchema=z.strictObject({version:z.literal(1),binding:z.string().regex(/^[a-f0-9]{64}$/),key:z.tuple([z.string().min(1).max(256),z.literal('published'),z.number().finite(),z.number().finite(),z.string().min(1).max(256)])});
/** Service-only identity check: an editorial/customer account is not implicitly a public instructor. */
export async function readInstructorAccount(ctx:QueryCtx,id:Id<'users'>,budget:RequestReadLedger):Promise<Doc<'users'>|null>{
 budget.beforeRead();const user=budget.record(await ctx.db.get('users',id));
 return instructorAccountFromSource(ctx,user,budget);
}
export async function instructorAccountFromSource(ctx:QueryCtx,user:Doc<'users'>|null,budget:RequestReadLedger):Promise<Doc<'users'>|null>{
 if(!isPublicAuthor(user)||!user.roleId)return null;
 budget.beforeRead();const role=budget.record(await ctx.db.get('roles',user.roleId));
 return role?.status==='active'&&role.type==='internal'?user:null;
}
export function publicInstructorName(user:Doc<'users'>){
 return [user.displayName,user.nickname,user.username].find(value=>value?.trim()&&!value.includes('@'))?.trim().slice(0,256)||'Instructor';
}
/** Six indexed course candidates per page. Whole account/course documents never leave this service. */
export async function readInstructor(ctx:QueryCtx,input:unknown,scope:DataScope,documentId:string,budget=new RequestReadLedger()):Promise<InstructorResult>{
 const args=instructorArgsSchema.parse(input),empty=(nextCursor:string|null=null):InstructorResult=>({instructor:null,courses:[],cursor:args.cursor,nextCursor});
 const binding=sha256Hex(stableKey({scope,documentId,instructor:args.instructor??null}));
 let cursor:z.infer<typeof cursorSchema>|null=null;
 if(args.cursor){
  try{cursor=cursorSchema.parse(JSON.parse(args.cursor));}catch{throw new CanonicalDataError('INSTRUCTOR_CURSOR_FORMAT','cursor','Invalid instructor cursor');}
  if(cursor.binding!==binding||cursor.key[0]!==args.instructor||!ctx.db.normalizeId('lms_courses',cursor.key[4]))throw new CanonicalDataError('INSTRUCTOR_CURSOR_SCOPE','cursor','Instructor cursor belongs to another source or environment');
 }
 if(!args.instructor||!await isPluginEnabled(ctx,'lms',budget))return empty();
 const id=ctx.db.normalizeId('users',args.instructor);if(!id)return empty();
 const user=await readInstructorAccount(ctx,id,budget);if(!user)return empty();
 const evaluate=createMembershipAccessEvaluator(ctx,budget);
 if(!(await evaluate({resourceType:'route',resourceIdOrKey:'/courses'})).allowed)return empty();
 // Composite index cursors compose with other blocks and the authoring transaction.
 // Convex native paginate permits only one pagination call per query/mutation.
 const iterator=streamQuery(ctx,{schema,table:'lms_courses',index:'by_author_status_created',order:'desc',startIndexKey:cursor?.key??[id,'published'],startInclusive:cursor===null,endIndexKey:[id,'published'],endInclusive:true});
 const candidates:Doc<'lms_courses'>[]=[];let lastKey:z.infer<typeof cursorSchema>['key']|null=null,nextCursor:string|null=null;
 try{
  while(true){
   budget.beforeRead();const next=await iterator.next();if(next.done)break;
   const [source,key]=next.value;budget.record(source);
   if(candidates.length===6){if(lastKey)nextCursor=JSON.stringify({version:1,binding,key:lastKey});break;}
   candidates.push(source);lastKey=cursorSchema.shape.key.parse(key);
  }
 }finally{await iterator.return(undefined);}
 const courses:InstructorResult['courses']=[];
 for(const course of candidates){
  if(course.authorId!==id||course.status!=='published')continue;
  const href='/courses/'+course.slug;
  if(!(await evaluate({resourceType:'route',resourceIdOrKey:href})).allowed)continue;
  const projected=instructorCourseSchema.safeParse({id:course._id,title:course.title,slug:course.slug,href});
  if(projected.success)courses.push(projected.data);
 }
 if(!courses.length)return empty(nextCursor);
 const name=publicInstructorName(user);let image:NonNullable<InstructorResult['instructor']>['image']=null;
 if(user.avatarMediaId){
  budget.beforeRead();const media=budget.record(await ctx.db.get('media',user.avatarMediaId));
  if(media?.status==='active'&&media.mediaType==='image'&&media.mimeType.startsWith('image/')){
   let src:string|null|undefined=media.url;
   if(media.storageId){budget.beforeRead();src=await ctx.storage.getUrl(media.storageId);}
   if(src)image={src,alt:name};
  }
 }else if(user.avatarUrl||user.profilePictureUrl)image={src:(user.avatarUrl||user.profilePictureUrl)!,alt:name};
 const imageCheck=instructorProfileSchema.shape.image.safeParse(image);image=imageCheck.success?imageCheck.data:null;
 return instructorResultSchema.parse({instructor:{id:user._id,name,bio:user.bio?.trim().slice(0,2000)||'',image},courses,cursor:args.cursor,nextCursor});
}
