import { defineTable } from "convex/server";
import { v } from "convex/values";

const notificationPriorityValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("critical"),
);

const notificationChannelValidator = v.union(
  v.literal("in-app"),
  v.literal("email"),
  v.literal("both"),
);

export const userProfileTables = {
  overseer_userProfiles: defineTable({
    userId: v.id("overseer_users"),
    displayName: v.optional(v.string()),
    bio: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    avatarMediaAssetId: v.optional(v.id("mediacenter_mediaAssets")),
    avatarMediaUsageRefId: v.optional(v.id("mediacenter_mediaUsageRefs")),
    timezone: v.optional(v.string()),
    language: v.optional(v.string()),
    activeOrganizationId: v.optional(v.id("overseer_organizations")),
    activeBusinessId: v.optional(v.id("overseer_businesses")),
    activeTeamId: v.optional(v.id("overseer_teams")),
    activeVoProjectId: v.optional(v.id("genericprojects_projects")),
    defaultVoProjectId: v.optional(v.id("genericprojects_projects")),
    activeTagIds: v.optional(v.array(v.id("overseer_tags"))),
    activeWebsiteId: v.optional(v.id("overseer_websites")),
    activeWebsiteInstanceId: v.optional(v.id("overseer_websiteInstances")),
    desktopTheme: v.optional(v.any()),
    desktopThemeUpdatedAt: v.optional(v.number()),
    desktopWallpaperMediaUsageRefId: v.optional(
      v.id("mediacenter_mediaUsageRefs"),
    ),
    notificationPreferences: v.optional(
      v.object({
        email: v.optional(v.boolean()),
        desktop: v.optional(v.boolean()),
        approvalAlerts: v.optional(v.boolean()),
        budgetAlerts: v.optional(v.boolean()),
        errorAlerts: v.optional(v.boolean()),
        digestEnabled: v.optional(v.boolean()),
        digestTime: v.optional(v.string()),
        approvalPriority: v.optional(notificationPriorityValidator),
        budgetPriority: v.optional(notificationPriorityValidator),
        errorPriority: v.optional(notificationPriorityValidator),
        approvalChannel: v.optional(notificationChannelValidator),
        budgetChannel: v.optional(notificationChannelValidator),
        errorChannel: v.optional(notificationChannelValidator),
        quietHours: v.optional(
          v.object({
            enabled: v.boolean(),
            startTime: v.string(),
            endTime: v.string(),
          }),
        ),
      }),
    ),
    uiPreferences: v.optional(
      v.object({
        theme: v.optional(
          v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
        ),
        sidebarCollapsed: v.optional(v.boolean()),
        compactMode: v.optional(v.boolean()),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
};
