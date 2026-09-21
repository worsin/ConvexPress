import {z} from "zod";
import {safeLinkSchema} from "./generated/field-runtime.mjs";
const cursor=z.string().min(1).max(4096).nullable();
export const instructorArgsSchema=z.strictObject({instructor:z.string().min(1).max(256).optional(),cursor:cursor.default(null)});
export const instructorProfileSchema=z.strictObject({id:z.string().min(1).max(256),name:z.string().min(1).max(256),bio:z.string().max(2000),image:z.strictObject({src:safeLinkSchema(z,["http","https","relative"]).max(4096),alt:z.string().max(300)}).nullable()});
export const instructorCourseSchema=z.strictObject({id:z.string().min(1).max(256),title:z.string().min(1).max(512),slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(200),href:safeLinkSchema(z,["relative"]).max(512)});
export const instructorResultSchema=z.strictObject({instructor:instructorProfileSchema.nullable(),courses:z.array(instructorCourseSchema).max(6),cursor,nextCursor:cursor}).superRefine((value,ctx)=>{
 if(!value.instructor&&value.courses.length)ctx.addIssue({code:"custom",message:"Courses require their instructor"});
 if(value.nextCursor!==null&&value.nextCursor===value.cursor)ctx.addIssue({code:"custom",message:"Instructor pagination must advance"});
 if(new Set(value.courses.map(course=>course.id)).size!==value.courses.length)ctx.addIssue({code:"custom",message:"Duplicate course"});
 for(const course of value.courses)if(course.href!=="/courses/"+course.slug)ctx.addIssue({code:"custom",message:"Course route mismatch"});
});
export type InstructorArgs=z.infer<typeof instructorArgsSchema>;
export type InstructorResult=z.infer<typeof instructorResultSchema>;
export function instructorMatchesArgs(args:InstructorArgs,result:InstructorResult){return args.cursor===result.cursor&&(!result.instructor||result.instructor.id===args.instructor);}
