import type { QueryCtx } from "../../_generated/server";
import type { RequestReadLedger } from "../../helpers/requestReadLedger";
import type { PublicSearchSource } from "../../search/publicSource";
import type { ExtensionSearchSource } from "../../search/extensionSources";
import { isPluginEnabled } from "../../helpers/plugins";
import { canReadEventRoute } from "./publicAccess";
import type {Id} from "../../_generated/dataModel";
import type {MutationCtx} from "../../_generated/server";
import {stripContentForSearch} from "../../search/helpers";
/** Search coordinates are maintained in the same transaction as event authoring. */
export async function syncEventSearch(ctx:Pick<MutationCtx,"db">,eventId:Id<"extension_events">):Promise<void>{
 const event=await ctx.db.get("extension_events",eventId);
 const existing=await ctx.db.query("searchIndex").withIndex("by_content",q=>q.eq("contentType","event").eq("contentId",eventId)).unique();
 if(!event){if(existing)await ctx.db.delete("searchIndex",existing._id);return;}
 const content=stripContentForSearch(event.description).slice(0,100000);
 const fields={contentType:"event" as const,contentId:String(eventId),title:event.title.slice(0,500),content,excerpt:content.slice(0,200),authorId:"",authorName:"",status:event.status==="published"?"publish":event.status,url:`/events/${event.slug}`,publishedAt:event.createdAt,indexedAt:Date.now(),createdAt:event.createdAt,updatedAt:event.updatedAt};
 if(existing)await ctx.db.patch("searchIndex",existing._id,fields);else await ctx.db.insert("searchIndex",fields);
}


/** Only this installed extension may interpret its record IDs. Cached search
 * rows contribute identities, never publication or membership authority. */
export const searchSource = {
  id: "events",
  contentType: "event" as const,
  matchesId: (ctx: Pick<QueryCtx, "db">, rawId: string) => ctx.db.normalizeId("extension_events", rawId) !== null,
  createReader(ctx: QueryCtx, budget?: RequestReadLedger) {
    let enabled: Promise<boolean> | undefined;
    return async (rawId: string): Promise<PublicSearchSource | null> => {
      enabled ??= isPluginEnabled(ctx, "events", budget);
      if (!await enabled) return null;
      const id = ctx.db.normalizeId("extension_events", rawId);
      if (!id) return null;
      budget?.beforeRead();
      const event = await ctx.db.get("extension_events", id);
      budget?.record(event);
      if (!event || event.status !== "published" || !await canReadEventRoute(ctx, event.slug, budget)) return null;
      return { contentType: "event", contentId: rawId, title: event.title, excerpt: stripContentForSearch(event.description).slice(0, 1000), content: "", url: `/events/${event.slug}`, authorName: "", publishedAt: event.createdAt };
    };
  },
} satisfies ExtensionSearchSource;
