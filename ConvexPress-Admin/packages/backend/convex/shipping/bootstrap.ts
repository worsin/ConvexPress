/**
 * Tier 1.3 — Bootstrap shipping email templates.
 *
 * Upserts the 5 shipping notification templates so tracking notifications
 * have defaults to render instead of silent-failing. Fires whenever
 * `integrations.shipping` is saved. Idempotent.
 */

import { internalMutation } from "../_generated/server";
import { DEFAULT_TEMPLATES, templateActiveByDefault } from "../emails/templateDefaults";
import type { MutationCtx } from "../_generated/server";

import { v } from "convex/values";
const SHIPPING_TEMPLATE_SLUGS = new Set([
  "shipping_picked_up",
  "shipping_out_for_delivery",
  "shipping_delivered",
  "shipping_exception",
  "shipping_returned",
]);

export function getShippingTemplateDefaults() {
  return DEFAULT_TEMPLATES.filter((t) => SHIPPING_TEMPLATE_SLUGS.has(t.slug));
}

export async function runBootstrapShippingTemplates(
  ctx: MutationCtx,
  now = Date.now(),
): Promise<{ created: number; existing: number }> {
  let created = 0;
  let existing = 0;

  for (const def of getShippingTemplateDefaults()) {
    const found = await ctx.db
      .query("emailTemplates")
      .withIndex("by_slug", (q) => q.eq("slug", def.slug))
      .unique();

    if (found) {
      existing++;
      continue;
    }

    await ctx.db.insert("emailTemplates", {
      slug: def.slug,
      name: def.name,
      description: def.description,
      subjectTemplate: def.subjectTemplate,
      bodyHtml: def.bodyHtml,
      preheaderText: def.preheaderText,
      availableVariables: def.availableVariables,
      priority: def.priority,
      recipientType: def.recipientType,
      isActive: templateActiveByDefault(def),
      eventCode: def.eventCode,
      isCustomized: false,
      defaultSubjectTemplate: def.subjectTemplate,
      defaultBodyHtml: def.bodyHtml,
      category: def.category,
      lastSentAt: undefined,
      totalSent: 0,
      createdAt: now,
      updatedAt: now,
    });
    created++;
  }

  return { created, existing };
}

export const bootstrapShippingTemplates = internalMutation({
  args: {},
  returns: v.object({ created: v.number(), existing: v.number() }),
  handler: async (ctx) => runBootstrapShippingTemplates(ctx),
});
