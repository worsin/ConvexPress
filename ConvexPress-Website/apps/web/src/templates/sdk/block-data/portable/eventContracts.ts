import {z} from 'zod';
import {safeLinkSchema} from './generated/field-runtime.mjs';
const timestamp=z.number().int().min(0).max(8_640_000_000_000_000);
export const eventTimeZoneSchema=z.string().min(1).max(100).refine(value=>{
 try {new Intl.DateTimeFormat('en',{timeZone:value}).format(0);return true;} catch{return false;}
},'Invalid event time zone');
export const upcomingEventsArgsSchema=z.strictObject({limit:z.number().int().min(1).max(12).default(3),showDescription:z.boolean().default(true)});
export const eventCardSchema=z.strictObject({
 id:z.string().min(1).max(256),title:z.string().min(1).max(200),
 href:safeLinkSchema(z,['relative']).max(256),description:z.string().max(1000).nullable(),
 startsAt:timestamp,endsAt:timestamp,timeZone:eventTimeZoneSchema,venue:z.string().max(250),
}).refine(value=>value.endsAt>value.startsAt,'Event end must follow its start');
export const upcomingEventsResultSchema=z.strictObject({asOf:timestamp,items:z.array(eventCardSchema).max(12)}).superRefine((value,ctx)=>{
 const seen=new Set<string>();let previous=value.asOf;
 for(const [index,item] of value.items.entries()) {
  if(seen.has(item.id)||item.startsAt<previous)ctx.addIssue({code:'custom',path:['items',index],message:'Upcoming events must be unique, current and chronological'});
  seen.add(item.id);previous=item.startsAt;
 }
});
export type UpcomingEventsArgs=z.infer<typeof upcomingEventsArgsSchema>;
export type UpcomingEventsResult=z.infer<typeof upcomingEventsResultSchema>;
export function upcomingEventsMatchArgs(args:UpcomingEventsArgs,result:UpcomingEventsResult) {
 return result.items.length<=args.limit && result.items.every(item=>args.showDescription || item.description===null);
}

export const nextEventArgsSchema=z.strictObject({category:z.string().min(1).max(256).optional()});
export const nextEventResultSchema=z.strictObject({asOf:timestamp,categoryId:z.string().min(1).max(256).nullable(),event:eventCardSchema.nullable()}).refine(value=>!value.event||value.event.startsAt>=value.asOf,'Next event must be upcoming');
export type NextEventArgs=z.infer<typeof nextEventArgsSchema>;
export type NextEventResult=z.infer<typeof nextEventResultSchema>;
export function nextEventMatchesArgs(args:NextEventArgs,result:NextEventResult){return (args.category??null)===result.categoryId;}
