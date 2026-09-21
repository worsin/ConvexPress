import type {QueryCtx} from '../../_generated/server';
import type {RequestReadLedger} from '../../helpers/requestReadLedger';
import {evaluateMembershipAccess} from '../../membership/access';
export async function canReadEventsRoute(ctx:QueryCtx,budget?:RequestReadLedger):Promise<boolean> {
 return (await evaluateMembershipAccess(ctx,{resourceType:'route',resourceIdOrKey:'/events'},budget)).allowed;
}
/** Listing callers have already checked /events once before examining sources. */
export async function canReadEventDetailRoute(ctx:QueryCtx,slug:string,budget?:RequestReadLedger):Promise<boolean> {
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>100)return false;
 return (await evaluateMembershipAccess(ctx,{resourceType:'route',resourceIdOrKey:`/events/${slug}`},budget)).allowed;
}
/** Event discovery and direct reads share the same route authority. */
export async function canReadEventRoute(ctx:QueryCtx,slug:string,budget?:RequestReadLedger):Promise<boolean> {
 return await canReadEventsRoute(ctx,budget) && await canReadEventDetailRoute(ctx,slug,budget);
}
