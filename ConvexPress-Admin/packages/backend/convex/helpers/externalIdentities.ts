/**
 * External identity resolution: the only way an identity from an integrator's
 * trusted issuer (neither ConvexPress's own nor the configured Clerk instance)
 * reaches a ConvexPress user.
 *
 * Resolution requires a server-side `userExternalIdentities` row whose
 * tokenIdentifier equals the verified identity's, pointing at a user with
 * authSource "external". Subject, email or any other claim alone never maps
 * to a user. Every failure resolves to null.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { RequestReadLedger } from "./requestReadLedger";

type DbReadCtx = Pick<QueryCtx, "db">;
type ExternalIdentityLink = Doc<"userExternalIdentities">;

/**
 * The single link for a tokenIdentifier, or null. Reads two rows so that a
 * duplicated link (an invariant the integrator API maintains) fails closed
 * instead of picking one arbitrarily.
 */
export async function readExternalIdentityLink(
  ctx: DbReadCtx,
  tokenIdentifier: string,
  budget?: RequestReadLedger,
): Promise<ExternalIdentityLink | null> {
  budget?.beforeRead();
  const links = await ctx.db
    .query("userExternalIdentities")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", tokenIdentifier))
    .take(2);
  for (const link of links) budget?.record(link);
  if (links.length !== 1) return null;
  const [link] = links;
  return link.tokenIdentifier === tokenIdentifier ? link : null;
}

/**
 * Resolve a verified external identity to its linked, active external user.
 * Applies the same active-status rule as management sessions.
 */
export async function readExternalIdentityUser(
  ctx: DbReadCtx,
  identity: { tokenIdentifier: string },
  budget?: RequestReadLedger,
): Promise<Doc<"users"> | null> {
  const link = await readExternalIdentityLink(ctx, identity.tokenIdentifier, budget);
  if (!link) return null;
  budget?.beforeRead();
  const user = await ctx.db.get("users", link.userId);
  budget?.record(user);
  if (!user || user.authSource !== "external" || user.status !== "active") return null;
  return user;
}

/** True when the given external identity link still binds exactly this user. */
export async function externalIdentityStillLinks(
  ctx: DbReadCtx,
  tokenIdentifier: string,
  userId: Id<"users">,
  budget?: RequestReadLedger,
): Promise<boolean> {
  const link = await readExternalIdentityLink(ctx, tokenIdentifier, budget);
  return link !== null && link.userId === userId;
}

/**
 * Remove every external identity link for a user. Called when the user record
 * itself is deleted so no link can outlive (or be re-pointed through) it.
 */
export async function deleteExternalIdentityLinksForUser(
  ctx: Pick<MutationCtx, "db">,
  userId: Id<"users">,
): Promise<number> {
  const links = await ctx.db
    .query("userExternalIdentities")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const link of links) await ctx.db.delete("userExternalIdentities", link._id);
  return links.length;
}
