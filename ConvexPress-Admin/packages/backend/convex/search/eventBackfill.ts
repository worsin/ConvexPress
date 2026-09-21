import {v} from "convex/values";
import {internalMutation} from "../_generated/server";
import {syncEventSearch} from "./events";
/** Idempotent bounded migration. The operator persists each returned cursor;
 * concurrent event edits maintain their own index in the same transaction. */
export const page=internalMutation({
 args:{cursor:v.union(v.string(),v.null())},
 returns:v.object({cursor:v.union(v.string(),v.null()),isDone:v.boolean(),processed:v.number()}),
 handler:async(ctx,args)=>{
  if(args.cursor!==null&&args.cursor.length>4096)throw Error("Invalid event backfill cursor");
  const page=await ctx.db.query("extension_events").paginate({cursor:args.cursor,numItems:20,maximumRowsRead:20,maximumBytesRead:512*1024});
  for(const event of page.page)await syncEventSearch(ctx,event._id);
  return {cursor:page.isDone?null:page.continueCursor,isDone:page.isDone,processed:page.page.length};
 },
});
