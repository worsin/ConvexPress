import {z} from 'zod';
import {sha256Hex} from '@convexpress/site-contract';
import type {Id} from '../_generated/dataModel';
import type {QueryCtx} from '../_generated/server';
import {getCurrentUser} from '../helpers/permissions';
import {isPluginEnabled} from '../helpers/plugins';
import {RequestReadLedger} from '../helpers/requestReadLedger';
import {createMembershipAccessEvaluator} from '../membership/access';
import {canUserAccessCourse} from '../lms/access';
import {readLearnerCounts} from '../lms/progress/counts';
import {readCurriculumCounts} from '../lms/curriculumCounts';
import {CanonicalDataError,stableKey,type DataScope} from './foundation/contracts';
import {learnerProgressArgsSchema,learnerProgressItemSchema,learnerProgressResultSchema,type LearnerProgressResult} from './foundation/learnerProgressContracts';
const cursorSchema=z.strictObject({version:z.literal(1),binding:z.string().regex(/^[a-f0-9]{64}$/),after:z.string().min(1).max(256)});
/** Learner summary, never an administrative preview. Index range jumps skip all
 * lesson rows of each previously visited course, including legacy duplicates. */
export async function readLearnerProgress(ctx:QueryCtx,input:unknown,scope:DataScope,documentId:string,budget=new RequestReadLedger()):Promise<LearnerProgressResult>{
 const args=learnerProgressArgsSchema.parse(input),empty=(state:LearnerProgressResult['state']):LearnerProgressResult=>({state,items:[],cursor:args.cursor,nextCursor:null});
 if(!await isPluginEnabled(ctx,'lms',budget))return empty('unavailable');
 const viewer=await getCurrentUser(ctx,budget);
 if(!viewer||viewer.status!=='active'||viewer.authSource==='management'||viewer.internalRole==='management')return empty('signedOut');
 const binding=sha256Hex(stableKey({scope,documentId,viewer:String(viewer._id),selection:args.scope,course:args.scope==='course'?args.course:null}));
 let after:Id<'lms_courses'>|null=null;
 if(args.cursor){
  let cursor:z.infer<typeof cursorSchema>;try{cursor=cursorSchema.parse(JSON.parse(args.cursor));}catch{throw new CanonicalDataError('PROGRESS_CURSOR_FORMAT','cursor','Invalid learner progress cursor');}
  after=ctx.db.normalizeId('lms_courses',cursor.after);
  if(!after||cursor.binding!==binding||args.scope==='course')throw new CanonicalDataError('PROGRESS_CURSOR_SCOPE','cursor','Progress cursor belongs to another learner, document or environment');
 }
 const evaluate=createMembershipAccessEvaluator(ctx,budget);
 if(!(await evaluate({resourceType:'route',resourceIdOrKey:'/courses'})).allowed)return empty('unavailable');
 const candidates:Id<'lms_courses'>[]=[];let nextCursor:string|null=null;
 if(args.scope==='course'){
  const id=args.course?ctx.db.normalizeId('lms_courses',args.course):null;if(!id)return empty('unavailable');candidates.push(id);
 }else{
  let previous=after;
  while(true){
   budget.beforeRead();
   const row=budget.record(await ctx.db.query('lms_progress').withIndex('by_user_course',q=>previous?q.eq('userId',viewer._id).gt('courseId',previous):q.eq('userId',viewer._id)).first());
   if(!row)break;
   if(candidates.length===6){nextCursor=JSON.stringify({version:1,binding,after:previous});break;}
   candidates.push(row.courseId);previous=row.courseId;
  }
 }
 const items:LearnerProgressResult['items']=[];
 for(const id of candidates){
  budget.beforeRead();const course=budget.record(await ctx.db.get('lms_courses',id));
  if(!course||course.status!=='published')continue;
  const href='/courses/'+course.slug;
  if(!(await evaluate({resourceType:'route',resourceIdOrKey:href})).allowed)continue;
  if(!(await canUserAccessCourse(ctx,{courseId:id,userId:viewer._id,allowStaffPreview:false},budget)).allowed)continue;
  budget.beforeRead();const started=budget.record(await ctx.db.query('lms_progress').withIndex('by_user_course',q=>q.eq('userId',viewer._id).eq('courseId',id)).first());
  let progress:LearnerProgressResult['items'][number]['progress'];
  if(started){const counts=await readLearnerCounts(ctx,viewer._id,id,budget);progress=counts.state==='ready'?{completed:counts.completed,total:counts.total,percent:counts.percent}:{state:'preparing'};}
  else{const counts=await readCurriculumCounts(ctx,id,budget);progress=counts.state==='ready'?{completed:0,total:counts.lessons,percent:0}:{state:'preparing'};}
  items.push(learnerProgressItemSchema.parse({id:course._id,title:course.title,slug:course.slug,href,progress}));
 }
 return learnerProgressResultSchema.parse({state:'ready',items,cursor:args.cursor,nextCursor});
}
