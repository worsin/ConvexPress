import {socialFeedTables} from "./schema/socialFeeds";
import { canonicalDraftTables } from "./schema/canonicalDrafts";
import {syncedBlockTables} from "./schema/syncedBlocks";
import { blockDefinitionTables } from "./schema/blockDefinitions";
import {leadMagnetTables} from "./schema/leadMagnets";
import { defineSchema } from "convex/server";
import type {} from "./types/convexQueryBuilder";

// ─── Modular Schema Imports ──────────────────────────────────────────────────
// Each system owns its own schema file in convex/schema/
// Add new system tables by creating a file and spreading here.
//
// Extension v2 tables (anything under convex/extensions/* or
// convex/extensions.local/*) are merged via the auto-generated index
// file. The codegen script runs as a predev/predeploy hook:
//   packages/backend/scripts/generate-extension-index.mjs
// Generated output is gitignored. Hand-edits will be overwritten.
import { localizationTables } from "./schema/localization";
import { contentPromotionTables } from "./schema/contentPromotion";
import { extensionTables } from "./schema/_extensionsIndex.generated";
import { usersTables } from "./schema/users";
import { authorCountTables } from "./schema/authorCounts";
import { rolesTables } from "./schema/roles";
import { eventsTables } from "./schema/events";
import { settingsTables } from "./schema/settings";
import { mediaTables } from "./schema/media";
import { taxonomyTables } from "./schema/taxonomies";
import { customFieldTables } from "./schema/customFields";
import { auditLogTables } from "./schema/auditLogs";
import { postTables } from "./schema/posts";
import { audienceTables } from "./schema/audiences";
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
import { kbTables } from "./schema/kb";
import { ticketTables } from "./schema/tickets";
import { supportTables } from "./schema/support";
import { recipeTables } from "./schema/recipes";
import { commerceAssistantTables } from "./schema/commerceAssistant";
import { galleryTables } from "./schema/gallery";
import { purchaseTables } from "./schema/purchases";
import { commerceTables } from "./schema/commerce";
import { shippingTables } from "./schema/shipping";
import { commerceSubscriptionTables } from "./schema/commerceSubscriptions";
import { membershipTables } from "./schema/membership";
import { commerceDigitalTables } from "./schema/commerceDigital";
import { commerceReviewsTables } from "./schema/commerceReviews";
import { commerceWishlistsTables } from "./schema/commerceWishlists";
import { commerceBundlesTables } from "./schema/commerceBundles";
import { commerceReturnsTables } from "./schema/commerceReturns";
import { productAttributesTables } from "./schema/productAttributes";
import { lmsTables } from "./schema/lms";
import { managementTables } from "./schema/management";
import { integrationsTables } from "./schema/integrations";

// ─── Compose Schema ──────────────────────────────────────────────────────────
import { withMediaReferenceIndexes } from "./media/referenceIndexes";
export default defineSchema(withMediaReferenceIndexes({
  ...canonicalDraftTables,
  ...contentPromotionTables,
  ...localizationTables,
  ...usersTables,
  ...authorCountTables,
  ...rolesTables,
  ...eventsTables,
  ...settingsTables,
  ...integrationsTables,
  ...mediaTables,
  ...taxonomyTables,
  ...customFieldTables,
  ...auditLogTables,
  ...postTables,
  ...emailTables,
  ...audienceTables,
  ...leadMagnetTables,
  ...socialFeedTables,
  ...syncedBlockTables,
  ...blockDefinitionTables,
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
  ...kbTables,
  ...ticketTables,
  ...supportTables,
  ...recipeTables,
  ...galleryTables,
  ...purchaseTables,
  ...commerceTables,
  ...commerceAssistantTables,
  ...shippingTables,
  ...commerceSubscriptionTables,
  ...membershipTables,
  ...commerceDigitalTables,
  ...commerceReviewsTables,
  ...commerceWishlistsTables,
  ...commerceBundlesTables,
  ...commerceReturnsTables,
  ...productAttributesTables,
  ...lmsTables,
  ...managementTables,

  // ─── Extension v2 tables (discovered via codegen scanner) ────────────────
  // Merges both extensions/* (official) and extensions.local/* (user).
  // See _extensionsIndex.generated.ts header for the regen command.
  ...extensionTables,
}));
