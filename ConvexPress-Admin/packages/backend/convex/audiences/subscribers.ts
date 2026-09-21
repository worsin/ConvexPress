import type {RegisteredQuery,RegisteredMutation} from "convex/server";
import type {SubscriberView,SubscriberPageArgs,SuppressArgs,Page} from "./types";
import {v} from "convex/values";
import {paginationOptsValidator} from "convex/server";
import {query,mutation} from "../_generated/server";
import {audienceStatus} from "../schema/audiences";
import {requireCan} from "../helpers/permissions";
import {ownedMailingList,boundedAudiencePage,fail} from "./policy";
/** Subscriber data is moderator-only. No public caller can probe an email,
 * enumerate a list, subscribe someone or re-enable a suppressed address here. */
export const list:RegisteredQuery<"public",SubscriberPageArgs,Promise<Page<SubscriberView>>>=query({args:{listId:v.id("mailingLists"),status:audienceStatus,paginationOpts:paginationOptsValidator},returns:v.object({page:v.array(v.object({id:v.id("mailingListSubscribers"),email:v.string(),status:audienceStatus,consentText:v.string(),privacyUrl:v.string(),consentedAt:v.number(),unsubscribedAt:v.union(v.number(),v.null()),updatedAt:v.number()})),isDone:v.boolean(),continueCursor:v.string()}),handler:async(ctx,args)=>{
 await requireCan(ctx,"manage_options");boundedAudiencePage(args.paginationOpts.numItems);if(!await ownedMailingList(ctx,args.listId))fail("This mailing list is not available in this website");
 const page=await ctx.db.query("mailingListSubscribers").withIndex("by_list_status",q=>q.eq("listId",args.listId).eq("status",args.status)).paginate({...args.paginationOpts,maximumRowsRead:50,maximumBytesRead:512*1024});
 return {page:page.page.map(({_id,email,status,consentText,privacyUrl,consentedAt,unsubscribedAt,updatedAt})=>({id:_id,email,status,consentText,privacyUrl,consentedAt,unsubscribedAt:unsubscribedAt??null,updatedAt})),isDone:page.isDone,continueCursor:page.continueCursor};
}});
export const suppress:RegisteredMutation<"public",SuppressArgs,Promise<null>>=mutation({args:{listId:v.id("mailingLists"),subscriberId:v.id("mailingListSubscribers"),reason:v.union(v.literal("unsubscribed"),v.literal("bounced")),expectedUpdatedAt:v.number()},returns:v.null(),handler:async(ctx,args)=>{
 await requireCan(ctx,"manage_options");if(!await ownedMailingList(ctx,args.listId))fail("This mailing list is not available in this website");
 const member=await ctx.db.get("mailingListSubscribers",args.subscriberId);if(!member||member.listId!==args.listId)fail("This subscriber is not in the selected list");
 if(member!.updatedAt!==args.expectedUpdatedAt)fail("The subscription changed. Reload it before updating");
 if(member!.status===args.reason)return null;
 // A permanent bounce must not be downgraded to an unsubscribe by a later edit.
 if(member!.status==="bounced")return null;
 const now=Date.now();await ctx.db.patch("mailingListSubscribers",member!._id,{status:args.reason,unsubscribedAt:member!.unsubscribedAt??now,updatedAt:Math.max(now,member!.updatedAt+1)});return null;
}});
