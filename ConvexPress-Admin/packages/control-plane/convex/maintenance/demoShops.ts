/**
 * Demo shop fixtures for the control plane.
 *
 * Renames the acceptance hierarchy into two distinct businesses with their
 * own storefronts, and points every environment's site address at a local
 * loopback port so "View website" starts that storefront through the desktop
 * site runner:
 *
 *   Northstar Coffee Co.  → Northstar Coffee   live 127.0.0.1:4201 (alpha)
 *                                              staging 127.0.0.1:4202 (beta)
 *   Ridgeline Cycles      → Ridgeline Cycles   live 127.0.0.1:4203 (gamma)
 *
 * Internal only; run with the deployment admin key.
 */

import { v } from "convex/values";

import { internalMutation } from "../_generated/server";

const PLAN = {
  northstar: {
    businessSlug: "northstar-commerce",
    businessName: "Northstar Coffee Co.",
    businessDescription: "Small-batch roastery and home espresso gear.",
    accentColor: "#b5542a",
    websiteTitle: "Northstar Shop",
    newWebsiteTitle: "Northstar Coffee",
    primaryDomain: "northstar.coffee",
    instances: {
      "acceptance:northstar:shop:live": { siteOrigin: "http://127.0.0.1:4201", label: "Live" },
      "acceptance:northstar:shop:staging": { siteOrigin: "http://127.0.0.1:4202", label: "Staging" },
    },
  },
  ridgeline: {
    businessSlug: "ridgeline-cycles",
    businessName: "Ridgeline Cycles",
    businessDescription: "Trail, gravel and commute bikes with parts that fit.",
    accentColor: "#c6f135",
    websiteTitle: "Northstar Journal",
    newWebsiteTitle: "Ridgeline Cycles",
    primaryDomain: "ridgeline.bike",
    instances: {
      "acceptance:northstar:journal:live": { siteOrigin: "http://127.0.0.1:4203", label: "Live" },
    },
  },
} as const;

export const applyShopDemo = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx: any, args: any) => {
    const now = Date.now();
    const log: string[] = [];

    const northstarBusiness = await ctx.db
      .query("overseer_businesses")
      .filter((q: any) => q.eq(q.field("slug"), PLAN.northstar.businessSlug))
      .first();
    if (!northstarBusiness) throw new Error(`Business ${PLAN.northstar.businessSlug} not found`);

    if (!args.dryRun) {
      await ctx.db.patch(northstarBusiness._id, {
        name: PLAN.northstar.businessName,
        description: PLAN.northstar.businessDescription,
        accentColor: PLAN.northstar.accentColor,
        updatedAt: now,
      });
    }
    log.push(`business ${northstarBusiness.name} → ${PLAN.northstar.businessName}`);

    let ridgelineBusiness = await ctx.db
      .query("overseer_businesses")
      .filter((q: any) => q.eq(q.field("slug"), PLAN.ridgeline.businessSlug))
      .first();
    if (!ridgelineBusiness) {
      const { _id, _creationTime, ...template } = northstarBusiness;
      const doc = {
        ...template,
        name: PLAN.ridgeline.businessName,
        slug: PLAN.ridgeline.businessSlug,
        description: PLAN.ridgeline.businessDescription,
        accentColor: PLAN.ridgeline.accentColor,
        order: (northstarBusiness.order ?? 0) + 1,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      if (!args.dryRun) {
        const id = await ctx.db.insert("overseer_businesses", doc);
        ridgelineBusiness = await ctx.db.get(id);
      }
      log.push(`business created: ${PLAN.ridgeline.businessName}`);
    } else if (!args.dryRun) {
      await ctx.db.patch(ridgelineBusiness._id, {
        name: PLAN.ridgeline.businessName,
        description: PLAN.ridgeline.businessDescription,
        accentColor: PLAN.ridgeline.accentColor,
        isActive: true,
        updatedAt: now,
      });
    }

    const websites = await ctx.db.query("overseer_websites").take(500);
    const instances = await ctx.db.query("overseer_websiteInstances").take(1000);
    const connections = await ctx.db.query("overseer_connections").take(1000);

    for (const shop of [PLAN.northstar, PLAN.ridgeline]) {
      const business = shop === PLAN.northstar ? northstarBusiness : ridgelineBusiness;
      const website = websites.find(
        (entry: any) =>
          entry.status === "active" &&
          (entry.title === shop.websiteTitle || entry.title === shop.newWebsiteTitle),
      );
      if (!website) {
        log.push(`website ${shop.websiteTitle} not found`);
        continue;
      }
      if (!args.dryRun && business) {
        await ctx.db.patch(website._id, {
          title: shop.newWebsiteTitle,
          primaryDomain: shop.primaryDomain,
          business_id: business._id,
          description: shop.businessDescription,
          updatedAt: now,
        });
      }
      log.push(`website ${website.title} → ${shop.newWebsiteTitle} (${shop.primaryDomain})`);

      for (const [instanceKey, target] of Object.entries(shop.instances)) {
        const instance = instances.find((entry: any) => entry.instanceKey === instanceKey);
        if (!instance) {
          log.push(`instance ${instanceKey} not found`);
          continue;
        }
        if (!args.dryRun && business) {
          await ctx.db.patch(instance._id, {
            siteOrigin: target.siteOrigin,
            domain: new URL(target.siteOrigin).hostname,
            label: target.label,
            business_id: business._id,
            updatedAt: now,
          });
        }
        log.push(`instance ${instanceKey} → ${target.siteOrigin}`);
        // Session exchange requires the connection to agree with the website's business.
        for (const connection of connections) {
          if (String(connection.instance_id ?? "") !== String(instance._id)) continue;
          if (!args.dryRun && business) {
            const config =
              connection.config && typeof connection.config === "object"
                ? { ...connection.config, siteOrigin: target.siteOrigin }
                : connection.config;
            await ctx.db.patch(connection._id, {
              business_id: business._id,
              website_id: website._id,
              config,
              updatedAt: now,
            });
          }
          log.push(`connection ${String(connection._id)} realigned to ${shop.businessName}`);
        }
      }
    }

    return { dryRun: args.dryRun === true, log };
  },
});
