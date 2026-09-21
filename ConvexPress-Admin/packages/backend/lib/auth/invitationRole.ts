import { ConvexError } from "convex/values";
import type { QueryCtx } from "../../convex/_generated/server";
import {
  CUSTOMER_ROLE_ASSIGNMENT_EXPLANATION,
  roleCompatibleWithIdentity,
} from "./roleAssignment";

/** Validate the promise before creating/linking an invited website account. */
export async function requireCustomerInvitationRole(
  ctx: Pick<QueryCtx, "db">,
  slug: string,
) {
  const role = await ctx.db
    .query("roles")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (
    !role ||
    role.status !== "active" ||
    !roleCompatibleWithIdentity({ authSource: "clerk" }, role)
  ) {
    throw new ConvexError({
      code: "INVITATION_ROLE_UNAVAILABLE",
      message: `${CUSTOMER_ROLE_ASSIGNMENT_EXPLANATION} Ask an administrator to revoke this invitation and send a new one with an active customer role.`,
    });
  }
  return role;
}
