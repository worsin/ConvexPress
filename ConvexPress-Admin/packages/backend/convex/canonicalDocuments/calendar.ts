import {streamQuery,type IndexKey} from 'convex-helpers/server/pagination';
import {z} from 'zod';
import {sha256Hex} from '@convexpress/site-contract';
import schema from '../schema';
import type {QueryCtx} from '../_generated/server';
import type {Id} from '../_generated/dataModel';
import {RequestReadLedger} from '../helpers/requestReadLedger';
import {isPluginEnabled} from '../helpers/plugins';
import {canReadEventsRoute,canReadEventDetailRoute} from '../extensions/events/publicAccess';
import {assertCalendarIndexReady} from '../extensions/events/calendarIndex';
import {getDefaults} from '../settings/defaults';
import {SourceByteLedger,SOURCE_LIMITS} from './sourceBudget';
import {CanonicalDataError,stableKey,type DataScope} from './foundation/contracts';
import {calendarArgsSchema,calendarResultSchema,calendarMonthAt,calendarWindow,type CalendarResult} from './foundation/calendarContracts';
import {eventTimeZoneSchema} from './foundation/eventContracts';
import {eventCarryoverRanges,eventIntervalBucket} from './foundation/eventIntervalIndex';
const cursorSchema=z.strictObject({version:z.literal(1),binding:z.string().regex(/^[a-f0-9]{64}$/),phase:z.number().int().min(0).max(53),key:z.array(z.union([z.string().max(256),z.number().finite()])).min(4).max(6).nullable()});
type Segment={index:'by_calendar_start'|'by_calendar_end'|'by_category_calendar_start'|'by_category_calendar_end'|'by_status_start'|'by_category_status_start';prefix:IndexKey;low:number;high:number;lowInclusive:boolean;highInclusive:boolean};
function segments(point:number,end:number,category?:Id<'extension_event_categories'>):Segment[]{
 const carry:Segment[]=eventCarryoverRanges(point).map(range=>({
  index:category?(range.bound==='startsBefore'?'by_category_calendar_start':'by_category_calendar_end'):(range.bound==='startsBefore'?'by_calendar_start':'by_calendar_end'),
  prefix:category?[category,range.bucket,'published']:[range.bucket,'published'],
  low:range.bound==='startsBefore'?0:point,high:range.bound==='startsBefore'?point:8_640_000_000_000_000,
  lowInclusive:range.bound==='startsBefore',highInclusive:range.bound==='endsAfter',
 }));
 return [...carry,{index:category?'by_category_status_start':'by_status_start',prefix:category?[category,'published']:['published'],low:Math.max(0,point),high:end,lowInclusive:true,highInclusive:false}];
}
/** Trusted page dependency: historical windows are indexed and paginated,
 * including events that began earlier and continue into this civil month. */
export async function readCalendar(ctx:QueryCtx,rawArgs:unknown,scope:DataScope,documentId:string,budget=new RequestReadLedger(),sources=new SourceByteLedger()):Promise<CalendarResult>{
 const args=calendarArgsSchema.parse(rawArgs),asOf=Date.now();
 let timeZone=args.timeZone;
 if(!timeZone){budget.beforeRead();const settings=budget.record(await ctx.db.query('settings').withIndex('by_section',q=>q.eq('section','general')).unique());timeZone=eventTimeZoneSchema.parse(settings?.values.timezone??getDefaults('general').timezone);}
 const month=args.month??calendarMonthAt(asOf,timeZone),window=calendarWindow(month,timeZone);
 const binding=sha256Hex(stableKey({scope,documentId,month,timeZone,category:args.category??null,limit:args.limit}));
 const cursor=args.cursor===null?null:cursorSchema.parse(JSON.parse(args.cursor));
 if(cursor&&cursor.binding!==binding)throw new CanonicalDataError('CALENDAR_CURSOR_SCOPE','cursor','Calendar cursor belongs to another document, filter, month, time zone or environment');
 const empty=():CalendarResult=>({...window,asOf,categoryId:args.category??null,items:[],cursor:args.cursor,nextCursor:null});
 if(!await isPluginEnabled(ctx,'events',budget)||!await canReadEventsRoute(ctx,budget))return empty();
 let category:Id<'extension_event_categories'>|undefined;
 if(args.category){const normalized=ctx.db.normalizeId('extension_event_categories',args.category);if(!normalized)return empty();budget.beforeRead();if(!budget.record(await ctx.db.get('extension_event_categories',normalized)))return empty();category=normalized;}
 await assertCalendarIndexReady(ctx,budget);
 const ranges=segments(window.startsAt,window.endsAt,category);
 if(cursor&&cursor.phase>=ranges.length)throw new CanonicalDataError('CALENDAR_CURSOR_RANGE','cursor','Invalid calendar index phase');
 if(cursor?.key){const range=ranges[cursor.phase]!;const key=cursor.key,at=key[range.prefix.length];
  if(key.length!==range.prefix.length+3||stableKey(key.slice(0,range.prefix.length))!==stableKey(range.prefix)||typeof at!=='number'||at<range.low||at>range.high||(!range.lowInclusive&&at===range.low)||(!range.highInclusive&&at===range.high)||typeof key[key.length-2]!=='number'||typeof key[key.length-1]!=='string'||!ctx.db.normalizeId('extension_events',key[key.length-1] as string))throw new CanonicalDataError('CALENDAR_CURSOR_RANGE','cursor','Calendar cursor is outside its selected index');
 }
 const items:CalendarResult['items']=[];let phase=cursor?.phase??0,lastKey:IndexKey|null=cursor?.key??null,scanned=0;
 const finish=(more:boolean)=>calendarResultSchema.parse({...window,asOf,categoryId:args.category??null,items,cursor:args.cursor,nextCursor:more?JSON.stringify({version:1,binding,phase,key:lastKey}):null});
 for(;phase<ranges.length;phase++,lastKey=null){
  const range=ranges[phase]!;
  const iterator=streamQuery(ctx,{schema,table:'extension_events',index:range.index,order:'asc',startIndexKey:lastKey??[...range.prefix,range.low],startInclusive:lastKey===null&&range.lowInclusive,endIndexKey:[...range.prefix,range.high],endInclusive:range.highInclusive});
  try{while(true){
   if(scanned>=96||budget.queries>=budget.limits.queries-32||sources.usedBytes>SOURCE_LIMITS.total-SOURCE_LIMITS.event){
    if(phase===(cursor?.phase??0)&&stableKey(lastKey)===stableKey(cursor?.key??null))throw new CanonicalDataError('CALENDAR_READ_BUDGET','calendar','Calendar cannot advance within the remaining page read budget');
    return finish(true);
   }
   budget.beforeRead();sources.beforeRead();const next=await iterator.next();if(next.done)break;
   const [event,key]=next.value;budget.record(event);sources.record('event',event);
   if(event.calendarBucket!==eventIntervalBucket(event.startsAt,event.endsAt))throw new CanonicalDataError('CALENDAR_INDEX_STALE','calendar','Event calendar coordinates require repair');
   if(items.length>=args.limit)return finish(true);
   lastKey=key;scanned++;
   if(event.status!=='published'||(category&&event.categoryId!==category)||event.startsAt>=window.endsAt||event.endsAt<=window.startsAt)throw new CanonicalDataError('CALENDAR_INDEX_RANGE','calendar','Event source does not match the selected calendar range');
   if(!await canReadEventDetailRoute(ctx,event.slug,budget))continue;
   items.push({id:event._id,title:event.title,href:`/events/${event.slug}`,description:event.description.slice(0,1000),startsAt:event.startsAt,endsAt:event.endsAt,timeZone:event.timeZone,venue:event.venue});
  }}finally{await iterator.return?.(undefined);}
 }
 return finish(false);
}
