import { ConvexError } from "convex/values";
import { getCurrentUser } from "../../helpers/permissions";
import { requireCommerceEnabled } from "../helpers";

/** The storefront generates UUID bearer tokens; user IDs are not session tokens. */
export async function assistantScope(ctx: any, sessionToken: string) {
  await requireCommerceEnabled(ctx);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionToken)) {
    throw new ConvexError({ code: "INVALID_SESSION", message: "Please refresh the shop to start a new session." });
  }
  const user = await getCurrentUser(ctx);
  // A Clerk identity may precede its site-local profile. It can use a guest
  // session, but cannot satisfy either resource's persisted user ownership.
  if (user && user.status !== "active") throw new ConvexError({ code: "FORBIDDEN", message: "Please sign in again to use the shopping assistant." });
  const [session, cart] = await Promise.all([
    ctx.db.query("commerce_assistant_sessions").withIndex("by_session_token", (q: any) => q.eq("sessionToken", sessionToken)).unique(),
    ctx.db.query("commerce_carts").withIndex("by_session", (q: any) => q.eq("sessionToken", sessionToken)).unique(),
  ]);
  for (const resource of [session, cart]) {
    if (resource?.userId && String(resource.userId) !== String(user?._id ?? "")) {
      throw new ConvexError({ code: "SESSION_OWNER_MISMATCH", message: "This shopping session belongs to another account. Please refresh the shop." });
    }
  }
  return { session, cart, user, subjectKey: user ? String(user._id) : sessionToken, memoryKeys: user ? [String(user._id), sessionToken] : [sessionToken] };
}
