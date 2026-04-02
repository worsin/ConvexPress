import { defineSchema } from "convex/server";

// ─── Modular Schema Imports ──────────────────────────────────────────────────
// Each system owns its own schema file in convex/schema/
// Add new system tables by creating a file and spreading here
import { usersTables } from "./schema/users";
import { rolesTables } from "./schema/roles";
import { eventsTables } from "./schema/events";
import { settingsTables } from "./schema/settings";
import { mediaTables } from "./schema/media";
import { taxonomyTables } from "./schema/taxonomies";
import { customFieldTables } from "./schema/customFields";
import { auditLogTables } from "./schema/auditLogs";
import { postTables } from "./schema/posts";
import { emailTables } from "./schema/emails";
import { notificationTables } from "./schema/notifications";
import { commentTables } from "./schema/comments";
import { editorTables } from "./schema/editor";
import { revisionTables } from "./schema/revisions";
import { registrationTables } from "./schema/registration";
import { menuTables } from "./schema/menus";
import { routingTables } from "./schema/routing";
import { searchTables } from "./schema/search";
import { seoTables } from "./schema/seo";
import { sitemapTables } from "./schema/sitemap";
import { apiTables } from "./schema/api";
import { dashboardTables } from "./schema/dashboard";
import { capabilitiesTables } from "./schema/capabilities";
import { eventDefinitionsTables } from "./schema/eventDefinitions";
import { routeDefinitionsTables } from "./schema/routeDefinitions";
import { siteNotificationDefinitionsTables } from "./schema/siteNotificationDefinitions";
import { authTrackingTables } from "./schema/authTracking";
import { wordpressSyncTables } from "./schema/wordpressSync";
import { authTables } from "./schema/auth";
import { analyticsTables } from "./schema/analytics";
import { ga4Tables } from "./schema/ga4";

// ─── Compose Schema ──────────────────────────────────────────────────────────
export default defineSchema({
  ...usersTables,
  ...rolesTables,
  ...eventsTables,
  ...settingsTables,
  ...mediaTables,
  ...taxonomyTables,
  ...customFieldTables,
  ...auditLogTables,
  ...postTables,
  ...emailTables,
  ...notificationTables,
  ...commentTables,
  ...editorTables,
  ...revisionTables,
  ...registrationTables,
  ...menuTables,
  ...routingTables,
  ...searchTables,
  ...seoTables,
  ...sitemapTables,
  ...apiTables,
  ...dashboardTables,
  ...capabilitiesTables,
  ...eventDefinitionsTables,
  ...routeDefinitionsTables,
  ...siteNotificationDefinitionsTables,
  ...authTrackingTables,
  ...wordpressSyncTables,
  ...authTables,
  ...analyticsTables,
  ...ga4Tables,
});
