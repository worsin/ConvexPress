import type {Doc} from '../_generated/dataModel';
import type {QueryCtx} from '../_generated/server';
import {getCurrentUser} from '../helpers/permissions';
import {RequestReadLedger} from '../helpers/requestReadLedger';
import {createMembershipAccessEvaluator} from '../membership/access';
import {canUserAccessCourse} from '../lms/access';
import {readCourseCatalogPage} from '../lms/courseCatalogReader';
import {readLearnerCounts} from '../lms/progress/counts';
import {courseGridArgsSchema,courseGridResultSchema,publicCourseCardSchema,type CourseGridResult,type PublicCourseCard} from './foundation/courseContracts';
import type {DataScope} from './foundation/contracts';

/** Viewer identity always comes from this installation's authenticated request.
 * Source course bodies, entitlement details and lesson identities stay server-side. */
export async function readCourses(ctx:QueryCtx,rawArgs:unknown,scope:DataScope,documentId:string,budget=new RequestReadLedger()):Promise<CourseGridResult>{
 const args=courseGridArgsSchema.parse(rawArgs);
 const catalog=await readCourseCatalogPage(ctx,{category:args.query.category,limit:args.limit,cursor:args.cursor},scope,documentId,budget);
 const empty=():CourseGridResult=>({state:catalog.state,items:[],cursor:args.cursor,nextCursor:null});
 if(catalog.state==='preparing')return empty();
 const evaluate=createMembershipAccessEvaluator(ctx,budget);
 if(!(await evaluate({resourceType:'route',resourceIdOrKey:'/courses'})).allowed)return empty();
 const viewer=await getCurrentUser(ctx,budget);
 const items:PublicCourseCard[]=[];
 for(const course of catalog.courses){
  const href=`/courses/${course.slug}`;
  if(!(await evaluate({resourceType:'route',resourceIdOrKey:href})).allowed)continue;
  let image:PublicCourseCard['image']=null,progress:PublicCourseCard['progress']=null;
  if(course.featuredImageId){
   budget.beforeRead();const media=budget.record(await ctx.db.get('media',course.featuredImageId));
   if(media?.status==='active'&&media.mediaType==='image'&&media.mimeType.startsWith('image/')){
    let src:string|null|undefined=null;
    if(media.storageId){budget.beforeRead();src=await ctx.storage.getUrl(media.storageId);}
    src??=media.url;if(src)image={src,alt:media.altText??course.title};
   }
  }
  if(viewer?.status==='active'&&(await canUserAccessCourse(ctx,{courseId:course._id,userId:viewer._id},budget)).allowed){
   budget.beforeRead();
   const started=budget.record(await ctx.db.query('lms_progress').withIndex('by_user_course',q=>q.eq('userId',viewer._id).eq('courseId',course._id)).first());
   if(started){
    const summary=await readLearnerCounts(ctx,viewer._id,course._id,budget);
    progress=summary.state==='ready'?{completed:summary.completed,total:summary.total,percent:summary.percent}:{state:'preparing'};
   }
  }
  items.push(publicCourseCardSchema.parse({id:course._id,title:course.title,slug:course.slug,excerpt:course.excerpt??'',href,image,progress}));
 }
 return courseGridResultSchema.parse({state:'ready',items,cursor:catalog.cursor,nextCursor:catalog.nextCursor});
}
