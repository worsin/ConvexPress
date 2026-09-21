import {z} from 'zod';
import {instructorCourseSchema} from './instructorContracts';
const id=z.string().min(1).max(256),title=z.string().min(1).max(512),cursor=z.string().min(1).max(4096).nullable();
export const curriculumArgsSchema=z.strictObject({course:id.optional(),cursor:cursor.default(null)});
const topic=z.strictObject({id,title,continued:z.boolean(),continues:z.boolean()});
const entry=z.strictObject({id,title,kind:z.enum(['lesson','section_heading'])});
export const curriculumResultSchema=z.strictObject({course:instructorCourseSchema.nullable(),groups:z.array(z.strictObject({topic:topic.nullable(),entries:z.array(entry).max(8)})).max(8),cursor,nextCursor:cursor}).superRefine((value,ctx)=>{
 if(!value.course&&(value.groups.length||value.nextCursor))ctx.addIssue({code:'custom',message:'An unavailable course cannot expose an outline'});
 if(value.course&&value.course.href!=='/courses/'+value.course.slug)ctx.addIssue({code:'custom',message:'Course route mismatch'});
 if(value.nextCursor!==null&&value.nextCursor===value.cursor)ctx.addIssue({code:'custom',message:'Curriculum pagination must advance'});
 const entries=value.groups.flatMap(group=>group.entries),topics=value.groups.flatMap(group=>group.topic?[group.topic]:[]);
 if(entries.length>8||new Set(entries.map(item=>item.id)).size!==entries.length||new Set(topics.map(item=>item.id)).size!==topics.length)ctx.addIssue({code:'custom',message:'Invalid curriculum page size or duplicate nodes'});
 if(value.groups.some(group=>group.topic?.continues&&!value.nextCursor))ctx.addIssue({code:'custom',message:'Continuing modules need a next page'});
});
export type CurriculumArgs=z.infer<typeof curriculumArgsSchema>;
export type CurriculumResult=z.infer<typeof curriculumResultSchema>;
export function curriculumMatchesArgs(args:CurriculumArgs,result:CurriculumResult){return result.cursor===args.cursor&&(!result.course||result.course.id===args.course);}
