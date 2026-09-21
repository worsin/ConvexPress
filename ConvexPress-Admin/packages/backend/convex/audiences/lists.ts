import type {RegisteredQuery,RegisteredMutation} from "convex/server";
import type {Id} from "../_generated/dataModel";
import type {MailingListFields,MailingListView,ListIdArgs,ListUpdateArgs,ListPageArgs,Page} from "./types";
import {v} from "convex/values";
import {paginationOptsValidator} from "convex/server";
import {query,mutation} from "../_generated/server";
import {mailingListStatus} from "../schema/audiences";
import {requireCan} from "../helpers/permissions";
import {listFieldsSchema,fail,audienceInstallation,ownedMailingList,boundedAudiencePage} from "./policy";
const fields={name:v.string(),description:v.string(),consentText:v.string(),privacyUrl:v.string(),status:mailingListStatus};
const result=v.object({id:v.id("mailingLists"),...fields,revision:v.number(),updatedAt:v.number()});
export const create:RegisteredMutation<"public",MailingListFields,Promise<Id<"mailingLists">>>=mutation({args:fields,returns:v.id("mailingLists"),handler:async(ctx,args)=>{
 const user=await requireCan(ctx,"manage_options"),scope=await audienceInstallation(ctx),values=listFieldsSchema.parse(args),now=Date.now();
 return ctx.db.insert("mailingLists",{...scope,...values,revision:1,createdBy:user._id,updatedBy:user._id,createdAt:now,updatedAt:now});
}});
export const update:RegisteredMutation<"public",ListUpdateArgs,Promise<null>>=mutation({args:{listId:v.id("mailingLists"),expectedRevision:v.number(),...fields},returns:v.null(),handler:async(ctx,args)=>{
 const user=await requireCan(ctx,"manage_options"),{listId,expectedRevision,...raw}=args,values=listFieldsSchema.parse(raw),list=await ownedMailingList(ctx,listId);
 if(!list)fail("This mailing list is not available in this website");if(list!.revision!==expectedRevision)fail("The mailing list changed. Reload it before saving");
 if(!Number.isSafeInteger(list!.revision+1))fail("The mailing list revision limit has been reached");
 await ctx.db.patch("mailingLists",listId,{...values,revision:list!.revision+1,updatedBy:user._id,updatedAt:Date.now()});return null;
}});
export const get:RegisteredQuery<"public",ListIdArgs,Promise<MailingListView|null>>=query({args:{listId:v.id("mailingLists")},returns:v.union(v.null(),result),handler:async(ctx,args)=>{
 await requireCan(ctx,"manage_options");const list=await ownedMailingList(ctx,args.listId);if(!list)return null;const {name,description,consentText,privacyUrl,status,revision,updatedAt}=list;return {id:list._id,name,description,consentText,privacyUrl,status,revision,updatedAt};
}});
export const list:RegisteredQuery<"public",ListPageArgs,Promise<Page<MailingListView>>>=query({args:{paginationOpts:paginationOptsValidator,status:v.optional(mailingListStatus)},returns:v.object({page:v.array(result),isDone:v.boolean(),continueCursor:v.string()}),handler:async(ctx,args)=>{
 await requireCan(ctx,"manage_options");boundedAudiencePage(args.paginationOpts.numItems);const scope=await audienceInstallation(ctx);
 const query=args.status?ctx.db.query("mailingLists").withIndex("by_installation_status_name",q=>q.eq("websiteKey",scope.websiteKey).eq("instanceKey",scope.instanceKey).eq("status",args.status!)):ctx.db.query("mailingLists").withIndex("by_installation_name",q=>q.eq("websiteKey",scope.websiteKey).eq("instanceKey",scope.instanceKey));
 const page=await query.paginate({...args.paginationOpts,maximumRowsRead:50,maximumBytesRead:512*1024});
 return {page:page.page.map(({_id,name,description,consentText,privacyUrl,status,revision,updatedAt})=>({id:_id,name,description,consentText,privacyUrl,status,revision,updatedAt})),isDone:page.isDone,continueCursor:page.continueCursor};
}});
