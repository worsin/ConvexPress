import {z} from 'zod';
import {eventCardSchema,eventTimeZoneSchema} from './eventContracts';
import {blockPageHref} from './postGridContracts';
/** Civil months use the configured zone, never the visitor machine's zone. */
export const calendarMonthSchema=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).refine(value=>Number(value.slice(0,4))>=1970&&Number(value.slice(0,4))<=9998,'Calendar year must be between 1970 and 9998');
const cursorSchema=z.string().min(1).max(3800).nullable();
export const calendarNavigationSchema=z.strictObject({month:calendarMonthSchema,cursor:cursorSchema.default(null)});
export const calendarArgsSchema=z.strictObject({category:z.string().min(1).max(256).optional(),limit:z.number().int().min(1).max(48).default(24),timeZone:eventTimeZoneSchema.optional(),month:calendarMonthSchema.nullable().default(null),cursor:cursorSchema.default(null)}).refine(value=>value.cursor===null||value.month!==null,'A calendar cursor requires its civil month');
export type CalendarArgs=z.infer<typeof calendarArgsSchema>;
export type CalendarNavigation=z.infer<typeof calendarNavigationSchema>;
function dateFormatter(timeZone:string){return new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'});}
function parts(formatter:Intl.DateTimeFormat,value:number){const list=formatter.formatToParts(value);const take=(type:string)=>Number(list.find(part=>part.type===type)?.value);return {year:take('year'),month:take('month'),day:take('day')};}
function civilKey(date:{year:number;month:number;day:number}){return date.year*10_000+date.month*100+date.day;}
/** Find the first instant of a civil date. Midnight may not exist after a DST
 * jump; skipped dates share the next date's boundary. No fixed 24-hour days. */
function dateBoundary(formatter:Intl.DateTimeFormat,year:number,month:number,day:number):number{
 const normalized=new Date(Date.UTC(year,month-1,day));const target=civilKey({year:normalized.getUTCFullYear(),month:normalized.getUTCMonth()+1,day:normalized.getUTCDate()});
 let low=normalized.getTime()-48*3_600_000,high=normalized.getTime()+48*3_600_000;
 while(high-low>1){const middle=low+Math.floor((high-low)/2);if(civilKey(parts(formatter,middle))>=target)high=middle;else low=middle;}return high;
}
export function calendarMonthAt(value:number,timeZone:string):string{
 if(!Number.isFinite(value))throw Error('Invalid calendar timestamp');eventTimeZoneSchema.parse(timeZone);const date=parts(dateFormatter(timeZone),value);
 return calendarMonthSchema.parse(`${String(date.year).padStart(4,'0')}-${String(date.month).padStart(2,'0')}`);
}
export function shiftCalendarMonth(month:string,offset:-1|1):string|null{
 calendarMonthSchema.parse(month);const date=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5))-1+offset,1));const result=`${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;return calendarMonthSchema.safeParse(result).success?result:null;
}
export function calendarWindow(month:string,timeZone:string){
 calendarMonthSchema.parse(month);eventTimeZoneSchema.parse(timeZone);const year=Number(month.slice(0,4)),number=Number(month.slice(5)),formatter=dateFormatter(timeZone);
 return {month,timeZone,startsAt:dateBoundary(formatter,year,number,1),endsAt:dateBoundary(formatter,year,number+1,1)};
}
/** Every civil day, including skipped days represented by an empty range. */
export function calendarDays(month:string,timeZone:string){
 calendarMonthSchema.parse(month);eventTimeZoneSchema.parse(timeZone);const year=Number(month.slice(0,4)),number=Number(month.slice(5)),formatter=dateFormatter(timeZone);const count=new Date(Date.UTC(year,number,0)).getUTCDate();let startsAt=dateBoundary(formatter,year,number,1);
 return Array.from({length:count},(_,index)=>{const day=index+1,endsAt=dateBoundary(formatter,year,number,day+1);const result={date:`${month}-${String(day).padStart(2,'0')}`,day,weekday:new Date(Date.UTC(year,number-1,day)).getUTCDay(),startsAt,endsAt};startsAt=endsAt;return result;});
}
export function eventOverlapsWindow(event:{startsAt:number;endsAt:number},window:{startsAt:number;endsAt:number}){return window.endsAt>window.startsAt&&event.startsAt<window.endsAt&&event.endsAt>window.startsAt;}
export const calendarResultSchema=z.strictObject({asOf:z.number().int().nonnegative(),month:calendarMonthSchema,timeZone:eventTimeZoneSchema,startsAt:z.number().int(),endsAt:z.number().int(),categoryId:z.string().min(1).max(256).nullable(),items:z.array(eventCardSchema).max(48),cursor:cursorSchema,nextCursor:cursorSchema}).superRefine((value,ctx)=>{
 const window=calendarWindow(value.month,value.timeZone);if(value.startsAt!==window.startsAt||value.endsAt!==window.endsAt)ctx.addIssue({code:'custom',message:'Calendar bounds must match its civil month and time zone'});
 const ids=new Set<string>();let previous=-Infinity;for(const [index,item] of value.items.entries()){if(ids.has(item.id)||Math.max(item.startsAt,window.startsAt)<previous||!eventOverlapsWindow(item,window))ctx.addIssue({code:'custom',path:['items',index],message:'Calendar events must be unique, ordered by their first visible day and overlap the selected month'});ids.add(item.id);previous=Math.max(item.startsAt,window.startsAt);}
 if(value.nextCursor!==null&&value.nextCursor===value.cursor)ctx.addIssue({code:'custom',path:['nextCursor'],message:'Calendar pagination must advance'});
});
export type CalendarResult=z.infer<typeof calendarResultSchema>;
export function calendarMatchesArgs(args:CalendarArgs,result:CalendarResult){return (args.category??null)===result.categoryId&&(!args.timeZone||args.timeZone===result.timeZone)&&(args.month??calendarMonthAt(result.asOf,result.timeZone))===result.month&&args.cursor===result.cursor&&result.items.length<=args.limit;}
/** Shareable visitor state cannot override saved filters or authority. */
export function parseCalendarNavigation(value:string):CalendarNavigation{if(value.length>4096)throw Error('Calendar navigation exceeds its limit');return calendarNavigationSchema.parse(JSON.parse(value));}
export function calendarHref(href:string,blockId:string,month:string,cursor:string|null=null){return blockPageHref(href,blockId,JSON.stringify(calendarNavigationSchema.parse({month,cursor})));}
