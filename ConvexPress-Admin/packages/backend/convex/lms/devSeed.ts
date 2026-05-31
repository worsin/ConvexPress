/**
 * TEMP — LMS verification helper. DELETE after verifying.
 *   bunx convex run lms/devSeed:seedTestAdmin '{"email":"...","username":"...","password":"..."}'
 */

"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { hashPassword } from "../auth/helpers";

// @ts-ignore: Convex generated API types exceed TS instantiation depth.
export const seedTestAdmin = action({
  args: { email: v.string(), username: v.string(), password: v.string() },
  // @ts-ignore: Convex generated API types exceed TS instantiation depth.
  handler: async (ctx, { email, username, password }): Promise<unknown> => {
    const passwordHash = await hashPassword(password);
    return await (ctx as any).runMutation(
      (internal as any).lms.devSeedMutations.upsertTestAdmin,
      { email, username, passwordHash },
    );
  },
});
