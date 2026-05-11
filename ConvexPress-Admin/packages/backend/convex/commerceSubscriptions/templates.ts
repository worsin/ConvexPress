/**
 * Commerce Subscriptions — Templates CRUD (Wave 2).
 *
 * Templates define the default billing cadence (week / month / year) and
 * cross-cutting policy defaults (`gracePeriodDays`, dunning policy code,
 * pausable, cancel-at-period-end default, trial days). Offers reference
 * a template via `templateId`.
 *
 * Most template CRUD already exists in `commerceSubscriptions/mutations.ts`
 * and `commerceSubscriptions/queries.ts`:
 *   - `createTemplate` (mutations.ts)
 *   - `updateTemplate` (mutations.ts)
 *   - `listTemplates`  (queries.ts)
 *   - `getTemplate`    (queries.ts)
 *
 * Wave 2 only adds the missing `archiveTemplate` soft-delete mutation here
 * so the admin UI has a cancel/archive action separate from hard-delete.
 * Archiving a template does NOT cascade to offers: offers are not
 * automatically archived. Existing contracts are untouched (they hold a
 * snapshot of the template via the subscription item pricing fields).
 *
 * Plugin gate: every public handler starts with
 *   `await requirePluginEnabled(ctx, "commerceSubscriptions")`
 * Admin handlers additionally require the `manage_options` capability.
 * Wave 7 will swap in `commerceSubscriptions.templates.manage`.
 *
 * `@ts-nocheck` matches the existing subscriptions backend file pattern;
 * Wave 7 removes it across all subscriptions files in one pass.
 */

import { ConvexError, v } from "convex/values";

import { mutation } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { requirePluginEnabled } from "../helpers/plugins";
import { requireCommerceSubscriptionsEnabled } from "./helpers";

/**
 * Soft-delete a subscription template by flipping its status to `archived`.
 *
 * This is a non-destructive operation:
 *   - Existing offers that reference the template continue to work.
 *   - Existing contracts continue to bill on their snapshot pricing.
 *   - New offers should not be created against an archived template
 *     (the admin UI filters archived templates out of the create-offer
 *     dropdown; `offers.createOffer` does NOT block archived templates —
 *     that's enforced at the UI layer in Wave 2 and can be tightened in
 *     Wave 7 if needed).
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const archiveTemplate = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    templateId: v.id("commerce_subscription_templates"),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceSubscriptions");
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const template = await ctx.db.get(args.templateId);
    if (!template) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Subscription template not found.",
      });
    }

    if (template.status === "archived") {
      // Idempotent: already archived.
      return { success: true, alreadyArchived: true };
    }

    const now = Date.now();
    await ctx.db.patch(args.templateId, {
      status: "archived",
      updatedAt: now,
    });
    return { success: true };
  },
});
