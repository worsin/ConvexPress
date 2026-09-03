import { v } from "convex/values";

import { internalQuery } from "../_generated/server";

const credentialEnvelope = v.object({
  encrypted: v.string(),
  iv: v.string(),
  authTag: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  lastRotatedAt: v.number(),
  version: v.number(),
});

export const listTargets = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      connectionId: v.id("overseer_connections"),
      websiteKey: v.string(),
      instanceKey: v.string(),
      managementOrigin: v.string(),
      credentials: credentialEnvelope,
    }),
  ),
  handler: async (ctx) => {
    const connections = await ctx.db
      .query("overseer_connections")
      .withIndex("by_status", (q) => q.eq("status", "connected"))
      .take(501);
    if (connections.length > 500) {
      throw new Error("Too many connected environments for one revocation pass");
    }

    const targets = [];
    for (const connection of connections) {
      if (
        !connection.isActive ||
        !connection.credentials ||
        !connection.instance_id ||
        !connection.website_id
      ) {
        continue;
      }
      const instance = await ctx.db.get(connection.instance_id);
      const website = instance ? await ctx.db.get(instance.website_id) : null;
      if (
        !instance ||
        instance.status !== "active" ||
        !website ||
        website.status !== "active" ||
        connection.website_id !== website._id ||
        connection.instance_id !== instance._id ||
        instance.website_id !== website._id
      ) {
        continue;
      }
      targets.push({
        connectionId: connection._id,
        websiteKey: website.websiteKey,
        instanceKey: instance.instanceKey,
        managementOrigin: instance.managementOrigin,
        credentials: {
          encrypted: connection.credentials.encrypted,
          iv: connection.credentials.iv,
          authTag: connection.credentials.authTag,
          createdAt: connection.credentials.createdAt ?? connection.createdAt,
          updatedAt: connection.credentials.updatedAt ?? connection.updatedAt,
          lastRotatedAt:
            connection.credentials.lastRotatedAt ?? connection.updatedAt,
          version: connection.credentials.version ?? 1,
        },
      });
    }
    return targets;
  },
});
