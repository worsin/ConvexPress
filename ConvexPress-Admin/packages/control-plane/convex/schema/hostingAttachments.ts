import { defineTable } from "convex/server";
import { v } from "convex/values";
export const hostingAttachmentTables = {
  overseer_hostingAttachments: defineTable({
    receiptId: v.id("overseer_hostingProvisioning"),
    accountId: v.id("overseer_hostingAccounts"),
    websiteId: v.id("overseer_websites"),
    productionInstanceId: v.id("overseer_websiteInstances"),
    stagingInstanceId: v.id("overseer_websiteInstances"),
    createdAt: v.number(),
  })
    .index("by_receipt", ["receiptId"])
    .index("by_production", ["productionInstanceId"])
    .index("by_staging", ["stagingInstanceId"]),
};
