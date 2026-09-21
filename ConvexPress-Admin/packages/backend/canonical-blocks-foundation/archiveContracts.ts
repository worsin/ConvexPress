import { z } from "zod";
import { calendarMonthAt, calendarWindow } from "./calendarContracts";
import { eventTimeZoneSchema } from "./eventContracts";
import { relatedResultSchema } from "./relatedContracts";
const cursor=z.string().min(1).max(4096).nullable();
export const archiveYearSchema=z.number().int().min(1970).max(9998);
export const archiveMonthSchema=z.number().int().min(1).max(12);
export const archiveArgsSchema=z.strictObject({groupBy:z.enum(["month","year"]).default("month"),limit:z.number().int().min(1).max(48).default(12),cursor:cursor.default(null)});
export const archiveGroupSchema=z.strictObject({year:archiveYearSchema,month:archiveMonthSchema.nullable(),href:z.string().max(128)}).superRefine((group,ctx)=>{
 if(group.href!==archiveHref(group.year,group.month))ctx.addIssue({code:"custom",message:"Archive link must select its date period"});
});
export function archiveHref(year:number,month:number|null=null){return `/archive?year=${year}${month===null?"":`&month=${month}`}`;}
export function archiveLabel(year:number,month:number|null){return month===null?String(year):new Intl.DateTimeFormat("en-US",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(Date.UTC(year,month-1,1)));}
export function archivePeriodAt(timestamp:number,timeZone:string,groupBy:"month"|"year"){
 const civil=calendarMonthAt(timestamp,timeZone),year=Number(civil.slice(0,4)),month=groupBy==="month"?Number(civil.slice(5)):null;
 return {year,month,...archivePeriod(year,month,timeZone)};
}
export function archivePeriod(year:number,month:number|null,timeZone:string){
 archiveYearSchema.parse(year);if(month!==null)archiveMonthSchema.parse(month);eventTimeZoneSchema.parse(timeZone);
 const first=calendarWindow(`${year}-${String(month??1).padStart(2,"0")}`,timeZone);
 const last=month===null?calendarWindow(`${year}-12`,timeZone):first;
 return {startsAt:first.startsAt,endsAt:last.endsAt};
}
export const archiveResultSchema=z.strictObject({groupBy:z.enum(["month","year"]),timeZone:eventTimeZoneSchema,items:z.array(archiveGroupSchema).max(48),cursor,nextCursor:cursor}).superRefine((result,ctx)=>{
 let previous=Infinity;
 for(const item of result.items){const key=item.year*12+(item.month??0);if(key>=previous || (result.groupBy==="month")!==(item.month!==null))ctx.addIssue({code:"custom",message:"Archive periods must be unique, newest first and match grouping"});previous=key;}
 if(result.nextCursor!==null&&result.nextCursor===result.cursor)ctx.addIssue({code:"custom",message:"Archive pagination must advance"});
});
export type ArchiveArgs=z.infer<typeof archiveArgsSchema>;
export type ArchiveResult=z.infer<typeof archiveResultSchema>;
export function archiveMatchesArgs(args:ArchiveArgs,result:ArchiveResult){return args.groupBy===result.groupBy&&args.cursor===result.cursor&&result.items.length<=args.limit;}
export const dateArchiveResultSchema=z.strictObject({
 scope:z.strictObject({websiteKey:z.string(),instanceKey:z.string()}),viewerSubject:z.string().nullable(),
 year:archiveYearSchema.nullable(),month:archiveMonthSchema.nullable(),timeZone:eventTimeZoneSchema,
 groups:z.array(archiveGroupSchema).max(48),items:relatedResultSchema.shape.items,cursor,nextCursor:cursor,resetRequired:z.boolean(),
}).superRefine((value,ctx)=>{
 if(value.year===null && (value.month!==null||value.items.length>0) || value.year!==null&&value.groups.length>0)ctx.addIssue({code:"custom",message:"Archive mode mismatch"});
});
