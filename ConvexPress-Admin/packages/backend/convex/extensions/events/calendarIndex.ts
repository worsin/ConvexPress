import type {Id} from "../../_generated/dataModel";
import type {EventCarryoverRange} from "../../canonicalDocuments/foundation/eventIntervalIndex";
import {makeFunctionReference} from 'convex/server';
import {v,ConvexError} from 'convex/values';
import {internalMutation,type QueryCtx} from '../../_generated/server';
import {eventIntervalBucket} from '../../canonicalDocuments/foundation/eventIntervalIndex';
import type {RequestReadLedger} from '../../helpers/requestReadLedger';
/** Before an old/imported site can serve calendar windows, every event must
 * have its derived coordinates. Recovery never changes editor revision times. */
export async function assertCalendarIndexReady(ctx:QueryCtx,budget:RequestReadLedger){
 budget.beforeRead();const missing=budget.record(await ctx.db.query('extension_events').withIndex('by_calendar_bucket',q=>q.eq('calendarBucket',undefined)).first());
 if(missing)throw new ConvexError({code:'EVENT_CALENDAR_INDEX_PENDING',message:'The event calendar is being prepared. Please try again shortly.'});
}
export const recover=internalMutation({args:{},returns:v.null(),handler:async ctx=>{
 const page=await ctx.db.query('extension_events').withIndex('by_calendar_bucket',q=>q.eq('calendarBucket',undefined)).paginate({cursor:null,numItems:16,maximumRowsRead:16,maximumBytesRead:1024*1024});
 for(const event of page.page)await ctx.db.patch('extension_events',event._id,{calendarBucket:eventIntervalBucket(event.startsAt,event.endsAt)});
 if(page.page.length||!page.isDone)await ctx.scheduler.runAfter(250,makeFunctionReference<'mutation'>('extensions/events/calendarIndex:recover'),{});
 return null;
}});

/** Each range contains only intervals straddling point, provided the derived
 * bucket is current. The reader still verifies returned source coordinates. */
export function eventCarryoverQuery(ctx:QueryCtx,range:EventCarryoverRange,categoryId?:Id<'extension_event_categories'>){
 const events=ctx.db.query('extension_events');
 if(categoryId){
  return range.bound==='startsBefore'?events.withIndex('by_category_calendar_start',q=>q.eq('categoryId',categoryId).eq('calendarBucket',range.bucket).eq('status','published').lt('startsAt',range.point)):
   events.withIndex('by_category_calendar_end',q=>q.eq('categoryId',categoryId).eq('calendarBucket',range.bucket).eq('status','published').gt('endsAt',range.point));
 }
 return range.bound==='startsBefore'?events.withIndex('by_calendar_start',q=>q.eq('calendarBucket',range.bucket).eq('status','published').lt('startsAt',range.point)):
  events.withIndex('by_calendar_end',q=>q.eq('calendarBucket',range.bucket).eq('status','published').gt('endsAt',range.point));
}
