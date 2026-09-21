import {z} from 'zod';
import {safeLinkSchema} from './generated/field-runtime.mjs';
const id=z.string().min(1).max(256),cursor=z.string().min(1).max(4096).nullable();
export const courseGridArgsSchema=z.strictObject({query:z.strictObject({category:z.string().trim().min(1).max(256).optional()}).default({}),limit:z.number().int().min(1).max(48).default(6),cursor:cursor.default(null)});
export const courseProgressSummarySchema=z.strictObject({completed:z.number().int().nonnegative(),total:z.number().int().nonnegative(),percent:z.number().int().min(0).max(100)}).superRefine((data,ctx)=>{
 const expected=data.total===0?0:data.completed===data.total?100:Math.min(99,Math.round(data.completed/data.total*100));
 if(data.completed>data.total||data.percent!==expected)ctx.addIssue({code:'custom',message:'Progress must describe exact unique lesson counts'});
});
export const publicCourseCardSchema=z.strictObject({id,title:z.string().min(1).max(512),slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(200),excerpt:z.string().max(8192),href:safeLinkSchema(z,['relative']).max(512),image:z.strictObject({src:safeLinkSchema(z,['http','https','relative']).max(4096),alt:z.string().max(1000)}).nullable(),progress:z.union([courseProgressSummarySchema,z.strictObject({state:z.literal("preparing")})]).nullable()});
export const courseGridResultSchema=z.strictObject({state:z.enum(['ready','preparing']),items:z.array(publicCourseCardSchema).max(48),cursor,nextCursor:cursor}).superRefine((data,ctx)=>{
 if(data.state==='preparing'&&(data.items.length||data.nextCursor))ctx.addIssue({code:'custom',message:'Preparing catalogs cannot return partial cards'});
 if(data.nextCursor!==null&&data.nextCursor===data.cursor)ctx.addIssue({code:'custom',message:'Course pagination must advance'});
 if(new Set(data.items.map(item=>item.id)).size!==data.items.length)ctx.addIssue({code:'custom',message:'Duplicate course'});
 for(const item of data.items)if(item.href!==`/courses/${item.slug}`)ctx.addIssue({code:'custom',message:'Course link must match its slug'});
});
export type CourseGridArgs=z.infer<typeof courseGridArgsSchema>;
export type CourseGridResult=z.infer<typeof courseGridResultSchema>;
export type PublicCourseCard=z.infer<typeof publicCourseCardSchema>;
export function coursesMatchArgs(args:CourseGridArgs,result:CourseGridResult){return result.cursor===args.cursor&&result.items.length<=args.limit;}
