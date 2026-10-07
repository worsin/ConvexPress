import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { retireLegacyPostFields } from "./service";

/** Explicit deployment migration, never an operator/customer content API. */
export const retirePostFields = internalMutation({
  args: { postId: v.id("posts"), expectedSourceDigest: v.string() },
  returns: v.object({ changed: v.boolean() }),
  handler: retireLegacyPostFields,
});
