import type {Id} from '../_generated/dataModel';
import type {QueryCtx} from '../_generated/server';
import {RequestReadLedger} from '../helpers/requestReadLedger';
import {isPluginEnabled} from '../helpers/plugins';
import {canReadEventsRoute,canReadEventDetailRoute} from '../extensions/events/publicAccess';
import {SourceByteLedger} from './sourceBudget';
import {CanonicalDataError} from './foundation/contracts';
import {upcomingEventsArgsSchema,upcomingEventsResultSchema,type UpcomingEventsResult} from './foundation/eventContracts';

/** A trusted page-query dependency. Never accepts a plugin flag or visitor identity. */
export async function readUpcomingEvents(ctx:QueryCtx,rawArgs:unknown,budget=new RequestReadLedger(),sources=new SourceByteLedger()):Promise<UpcomingEventsResult> {
 const args=upcomingEventsArgsSchema.parse(rawArgs);
 return readEventCards(ctx,args,budget,sources);
}
export async function readEventCards(ctx:QueryCtx,args:{limit:number;showDescription:boolean},budget:RequestReadLedger,sources:SourceByteLedger,categoryId?:Id<"extension_event_categories">):Promise<UpcomingEventsResult> {
 const asOf=Date.now();
 if(!await isPluginEnabled(ctx,'events',budget)||!await canReadEventsRoute(ctx,budget))return {asOf,items:[]};
 const items:UpcomingEventsResult['items']=[];
 const query=categoryId?ctx.db.query('extension_events').withIndex('by_category_status_start',q=>q.eq('categoryId',categoryId).eq('status','published').gte('startsAt',asOf)):ctx.db.query('extension_events').withIndex('by_status_start',q=>q.eq('status','published').gte('startsAt',asOf));
 const iterator=query.order('asc')[Symbol.asyncIterator]();
 let scanned=0;
 try {
  while(items.length<args.limit) {
   sources.beforeRead();budget.beforeRead();
   const next=await iterator.next();if(next.done)break;
   const event=budget.record(next.value);sources.record('event',event);
   if(++scanned>96)throw new CanonicalDataError('EVENT_DISCOVERY_BUDGET','events','Event discovery exceeded its bounded source scan; no partial collection is returned');
   if(!await canReadEventDetailRoute(ctx,event.slug,budget))continue;
   items.push({id:event._id,title:event.title,href:`/events/${event.slug}`,description:args.showDescription?event.description.slice(0,1000):null,
    startsAt:event.startsAt,endsAt:event.endsAt,timeZone:event.timeZone,venue:event.venue});
  }
 } finally {await iterator.return?.();}
 return upcomingEventsResultSchema.parse({asOf,items});
}
