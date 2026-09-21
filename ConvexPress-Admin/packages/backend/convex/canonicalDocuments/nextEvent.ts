import type {QueryCtx} from '../_generated/server';
import {RequestReadLedger} from '../helpers/requestReadLedger';
import {SourceByteLedger} from './sourceBudget';
import {nextEventArgsSchema,type NextEventResult} from './foundation/eventContracts';
import {readEventCards} from './upcomingEvents';
import {isPluginEnabled} from '../helpers/plugins';
import {canReadEventsRoute} from '../extensions/events/publicAccess';
export async function readNextEvent(ctx:QueryCtx,rawArgs:unknown,budget=new RequestReadLedger(),sources=new SourceByteLedger()):Promise<NextEventResult>{
 const args=nextEventArgsSchema.parse(rawArgs),empty={asOf:Date.now(),categoryId:args.category??null,event:null};
 if(!await isPluginEnabled(ctx,'events',budget)||!await canReadEventsRoute(ctx,budget))return empty;
 const categoryId=args.category?ctx.db.normalizeId('extension_event_categories',args.category):undefined;
 if(args.category){
  if(!categoryId)return empty;
  budget.beforeRead();const category=budget.record(await ctx.db.get('extension_event_categories',categoryId));if(!category)return empty;
 }
 const result=await readEventCards(ctx,{limit:1,showDescription:true},budget,sources,categoryId??undefined);
 return {asOf:result.asOf,categoryId:args.category??null,event:result.items[0]??null};
}
