// @ts-nocheck — Convex generated API union types exceed TypeScript's instantiation
// depth (TS2589) for ctx.runMutation calls in this module (see auth/clerkManagement.ts).
/**
 * Profile actions — operations that need the network.
 *
 *   deleteOwnAccount  customer self-service: close the ConvexPress account,
 *                     then delete the Clerk user so the sign-in is gone too.
 */

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";
import { getServiceKeyFromAction } from "../helpers/serviceKeys";

export const deleteOwnAccount = action({
  args: {},
  handler: async (ctx): Promise<{ closed: true; clerkDeleted: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });

    // 1. Close the account on this site (also detaches the Clerk id).
    const closed = (await ctx.runMutation(internal.profiles.mutations.closeOwnAccount, {})) as {
      userId: string;
      clerkUserId: string;
    };

    // 2. Delete the Clerk user so the credential cannot sign in again.
    const secretKey = await getServiceKeyFromAction(
      ctx,
      "integrations.clerk",
      "clerkSecretKey",
      "CLERK_SECRET_KEY",
    );
    let clerkDeleted = false;
    if (secretKey && closed.clerkUserId) {
      try {
        const response = await fetch(`https://api.clerk.com/v1/users/${closed.clerkUserId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${secretKey}` },
        });
        clerkDeleted = response.ok || response.status === 404;
        if (!clerkDeleted) {
          console.warn(`[deleteOwnAccount] Clerk user ${closed.clerkUserId} was not deleted (HTTP ${response.status}).`);
        }
      } catch (error) {
        console.warn(`[deleteOwnAccount] Clerk delete failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { closed: true, clerkDeleted };
  },
});
