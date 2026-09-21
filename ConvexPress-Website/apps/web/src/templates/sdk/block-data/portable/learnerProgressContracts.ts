import {z} from 'zod';
import {courseProgressSummarySchema} from './courseContracts';
import {instructorCourseSchema} from './instructorContracts';
const cursor=z.string().min(1).max(4096).nullable();
export const learnerProgressArgsSchema=z.strictObject({scope:z.enum(['course','all']).default('all'),course:z.string().min(1).max(256).optional(),cursor:cursor.default(null)});
export const learnerProgressItemSchema=instructorCourseSchema.extend({progress:z.union([courseProgressSummarySchema,z.strictObject({state:z.literal('preparing')})])});
export const learnerProgressResultSchema=z.strictObject({state:z.enum(['ready','signedOut','unavailable']),items:z.array(learnerProgressItemSchema).max(6),cursor,nextCursor:cursor}).superRefine((value,ctx)=>{
 if(value.state!=='ready'&&(value.items.length||value.nextCursor))ctx.addIssue({code:'custom',message:'Unavailable progress cannot carry learner data'});
 if(value.nextCursor!==null&&value.nextCursor===value.cursor)ctx.addIssue({code:'custom',message:'Progress pagination must advance'});
 if(new Set(value.items.map(item=>item.id)).size!==value.items.length)ctx.addIssue({code:'custom',message:'Duplicate learner course'});
 for(const item of value.items)if(item.href!=='/courses/'+item.slug)ctx.addIssue({code:'custom',message:'Progress course route mismatch'});
});
export type LearnerProgressArgs=z.infer<typeof learnerProgressArgsSchema>;
export type LearnerProgressResult=z.infer<typeof learnerProgressResultSchema>;
export function learnerProgressMatchesArgs(args:LearnerProgressArgs,result:LearnerProgressResult){return result.cursor===args.cursor&&(args.scope==='all'||result.nextCursor===null&&result.items.length<=1&&result.items.every(item=>item.id===args.course));}
