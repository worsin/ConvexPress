/**
 * Settings System - exact section value types.
 *
 * `settings.values` is untyped storage (the schema keeps it `v.any()` because
 * every section has its own shape). This module states each section's shape
 * once, as a Convex validator, and reads stored values back at exactly that
 * shape with `readValidated`: a stored field is used when it has the declared
 * type, a missing or mistyped field falls back to the section default, and
 * fields the section does not declare are dropped. Queries can therefore return
 * section values through `returns` validators built from these, and those
 * validators hold at runtime.
 *
 * The validators are checked against the section interfaces in `defaults.ts`
 * (the defaults map below must satisfy them), so the two cannot drift silently.
 */
import { v, type Infer, type PropertyValidators, type VBoolean } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { authCapabilitiesValidator, clerkVerificationValidator } from "../auth/clerkValidators";
import { partial } from "convex-helpers/validators";
import { boundedJsonValidator } from "../helpers/jsonValue";
import { readValidated, settingsRecord } from "../helpers/settingsReader";
import { redactSettingSecrets } from "../helpers/settingsSecret";
import { PLUGIN_DEFAULTS, PLUGIN_SETTINGS_KEY } from "../plugins/registry";
import {
  AI_DEFAULTS,
  ANALYTICS_DEFAULTS,
  ANALYTICS_GA4_DEFAULTS,
  APPEARANCE_TEMPLATE_DEFAULTS,
  BLOCK_DEFAULTS,
  BRAND_DEFAULTS,
  CLERK_INTEGRATION_DEFAULTS,
  COMMERCE_ASSISTANT_DEFAULTS,
  COMMERCE_GENERAL_DEFAULTS,
  COMMERCE_LAYOUT_DEFAULTS,
  COMMERCE_PAYMENTS_DEFAULTS,
  COMMERCE_SUBSCRIPTIONS_COUNTERS_DEFAULTS,
  DASHBOARD_DEFAULTS,
  DISCUSSION_DEFAULTS,
  EMAIL_DEFAULTS,
  FOOTER_DEFAULTS,
  GENERAL_DEFAULTS,
  GOOGLE_INTEGRATION_DEFAULTS,
  HEADER_DEFAULTS,
  KB_FEATURES_DEFAULTS,
  KB_GENERAL_DEFAULTS,
  KB_SEARCH_DEFAULTS,
  LAYOUT_ASSIGNMENT_DEFAULTS,
  MEDIA_DEFAULTS,
  MEMBERSHIP_GENERAL_DEFAULTS,
  PERMALINK_DEFAULTS,
  PLUGINS_DEFAULTS,
  PRIVACY_DEFAULTS,
  READING_DEFAULTS,
  SEARCH_DEFAULTS,
  SHIPPING_INTEGRATION_DEFAULTS,
  SHIPPING_PROVIDER_SECTION_DEFAULTS,
  SUPPORT_AI_SECTION_DEFAULTS,
  SUPPORT_WIDGET_SECTION_DEFAULTS,
  TICKET_GENERAL_DEFAULTS,
  TICKET_SLA_DEFAULTS,
  WRITING_DEFAULTS,
  type SettingsSection,
} from "./defaults";

const nullableString = v.union(v.null(), v.string());
const nullableNumber = v.union(v.null(), v.number());

// ─── Core sections ───────────────────────────────────────────────────────────

export const generalSettingsValidator = v.object({
  siteTitle: v.string(),
  tagline: v.string(),
  siteUrl: v.string(),
  homeUrl: v.string(),
  adminEmail: v.string(),
  membershipEnabled: v.boolean(),
  registrationMode: v.union(v.literal("invite_only"), v.literal("closed")),
  defaultRole: v.string(),
  siteLanguage: v.string(),
  timezone: v.string(),
  dateFormat: v.string(),
  timeFormat: v.string(),
  weekStartsOn: v.number(),
  sendPasswordResetEmail: v.boolean(),
  sendPasswordChangedEmail: v.boolean(),
  notifyAdminOnPasswordReset: v.boolean(),
  /** Site logo media id (written by content promotion and site identity). */
  siteLogo: v.optional(v.string()),
  /** Site logo URL (written by content promotion and site identity). */
  logoUrl: v.optional(v.string()),
});

export const readingSettingsValidator = v.object({
  homepageDisplays: v.union(v.literal("latest_posts"), v.literal("static_page"), v.literal("shop")),
  homepageId: nullableString,
  postsPageId: nullableString,
  postsPerPage: v.number(),
  feedItemCount: v.number(),
  feedContentDisplay: v.union(v.literal("full"), v.literal("summary")),
  searchEngineVisibility: v.boolean(),
});

export const writingSettingsValidator = v.object({
  defaultCategory: nullableString,
  defaultPostFormat: v.string(),
});

export const discussionSettingsValidator = v.object({
  attemptNotifyLinkedBlogs: v.boolean(),
  allowLinkNotifications: v.boolean(),
  allowComments: v.boolean(),
  requireNameEmail: v.boolean(),
  requireRegistration: v.boolean(),
  autoCloseEnabled: v.boolean(),
  autoCloseAfterDays: v.number(),
  enableThreadedComments: v.boolean(),
  threadedCommentsDepth: v.number(),
  enablePaginatedComments: v.boolean(),
  commentsPerPage: v.number(),
  defaultCommentsPage: v.union(v.literal("newest"), v.literal("oldest")),
  commentOrder: v.union(v.literal("asc"), v.literal("desc")),
  emailOnNewComment: v.boolean(),
  emailOnHeldForModeration: v.boolean(),
  manualApprovalRequired: v.boolean(),
  previouslyApprovedRequired: v.boolean(),
  holdIfLinksExceed: v.number(),
  moderationWordList: v.string(),
  disallowedWordList: v.string(),
  showAvatars: v.boolean(),
  avatarRating: v.union(v.literal("G"), v.literal("PG"), v.literal("R"), v.literal("X")),
  defaultAvatar: v.string(),
});

export const permalinkSettingsValidator = v.object({
  structure: v.union(
    v.literal("plain"),
    v.literal("day_and_name"),
    v.literal("month_and_name"),
    v.literal("numeric"),
    v.literal("post_name"),
    v.literal("custom"),
  ),
  customStructure: v.string(),
  categoryBase: v.string(),
  tagBase: v.string(),
});

export const privacySettingsValidator = v.object({
  privacyPolicyPageId: nullableString,
  showPrivacyPolicyLink: v.boolean(),
});

export const emailSettingsValidator = v.object({
  enabled: v.boolean(),
  resendApiKey: v.string(),
  webhookSecret: v.string(),
  fromAddress: v.string(),
  fromName: v.string(),
  replyTo: v.string(),
  rateLimit: v.number(),
  dailyLimit: v.number(),
  batchWindow: v.number(),
  unsubscribeUrl: v.string(),
  maxRetries: v.number(),
  retryDelay: v.number(),
  queueRetentionDays: v.number(),
  trackingEnabled: v.boolean(),
  digestEnabled: v.boolean(),
  digestDay: v.number(),
  digestHour: v.number(),
  includeUnsubscribeLink: v.boolean(),
});

export const mediaSettingsValidator = v.object({
  maxUploadSize: v.number(),
  thumbnailWidth: v.number(),
  thumbnailHeight: v.number(),
  thumbnailCrop: v.boolean(),
  mediumWidth: v.number(),
  mediumMaxHeight: v.number(),
  mediumLargeWidth: v.number(),
  mediumLargeMaxHeight: v.number(),
  largeWidth: v.number(),
  largeMaxHeight: v.number(),
});

export const analyticsSettingsValidator = v.object({
  trackingEnabled: v.boolean(),
  respectDoNotTrack: v.boolean(),
  retentionDays: v.number(),
  // GA4 connection state written by ga4/mutations and ga4/internals.
  ga4PropertyId: v.optional(nullableString),
  ga4Connected: v.optional(v.boolean()),
  ga4ServiceAccountEmail: v.optional(nullableString),
  ga4LastSync: v.optional(nullableNumber),
  ga4Error: v.optional(nullableString),
});

export const aiSettingsValidator = v.object({
  provider: v.union(v.literal("openrouter"), v.literal("anthropic"), v.literal("openai")),
  apiKey: v.string(),
  defaultModel: v.string(),
  pageGenerationModel: v.string(),
  blockEditingModel: v.string(),
  researchModel: v.string(),
  legacyContentModel: v.string(),
  imageApiKey: v.string(),
  imageModel: v.string(),
  tavilyApiKey: v.string(),
});

export const blockSettingsValidator = v.object({
  disabledBlockNames: v.array(v.string()),
});

// Plugin flags: the documented ones plus every flag the plugin registry declares
// (extensions add their own `<id>Enabled` key at build time).
const staticPluginFlagFields = {
  dashboardEnabled: v.boolean(),
  commerceEnabled: v.boolean(),
  commerceSubscriptionsEnabled: v.boolean(),
  commerceDigitalEnabled: v.boolean(),
  commerceReviewsEnabled: v.boolean(),
  commerceWishlistsEnabled: v.boolean(),
  commerceBundlesEnabled: v.boolean(),
  commerceReturnsEnabled: v.boolean(),
  membershipEnabled: v.boolean(),
  knowledgeBaseEnabled: v.boolean(),
  ticketsEnabled: v.boolean(),
  customFieldsEnabled: v.boolean(),
  recipesEnabled: v.boolean(),
  galleryEnabled: v.boolean(),
  lmsEnabled: v.boolean(),
  formsEnabled: v.boolean(),
};
type PluginFlagFields = { [flag: `${string}Enabled`]: VBoolean<boolean, "required"> };
const registryPluginFlagFields: PluginFlagFields = Object.fromEntries(
  Object.values(PLUGIN_SETTINGS_KEY)
    .filter((key) => key.endsWith("Enabled"))
    .map((key) => [key, v.boolean()]),
);
export const pluginsSettingsValidator = v.object(Object.assign({}, registryPluginFlagFields, staticPluginFlagFields));

export const membershipGeneralSettingsValidator = v.object({
  logAccessChecks: v.boolean(),
  accessLogRetentionDays: v.number(),
});

export const searchSettingsValidator = v.object({
  meilisearchHost: v.string(),
  meilisearchApiKey: v.string(),
});

// ─── Commerce sections ───────────────────────────────────────────────────────

const shippingPromiseValidator = v.object({
  icon: v.union(v.literal("clock"), v.literal("check"), v.literal("heart"), v.literal("map-pin"), v.literal("mail")),
  title: v.string(),
  body: v.string(),
  href: nullableString,
});

export const commerceGeneralSettingsValidator = v.object({
  storefrontPromises: v.array(shippingPromiseValidator),
  storeName: v.string(),
  storeEmail: v.string(),
  currencyCode: v.string(),
  currencySymbol: v.string(),
  pricesIncludeTax: v.boolean(),
  taxRateBasis: v.union(v.literal("billing"), v.literal("shipping"), v.literal("store")),
  defaultCountryCode: v.string(),
  defaultState: v.string(),
  checkoutRequiresPhone: v.boolean(),
  allowGuestCheckout: v.boolean(),
  returnWindowDays: v.number(),
  requireDeliveryBeforeReturn: v.boolean(),
  shippingEnabled: v.boolean(),
  shippingMethods: v.array(v.object({ code: v.string(), label: v.string() })),
  paymentMethods: v.array(v.object({ code: v.string(), label: v.string(), enabled: v.boolean() })),
});

export const commercePaymentsSettingsValidator = v.object({
  stripePublishableKey: v.string(),
  stripeSecretKey: v.string(),
  stripeWebhookSecret: v.string(),
  stripeMode: v.union(v.literal("sandbox"), v.literal("production")),
  paypalClientId: v.string(),
  paypalClientSecret: v.string(),
  paypalWebhookId: v.string(),
  paypalMode: v.union(v.literal("sandbox"), v.literal("production")),
  subscriptionChargingEnabled: v.boolean(),
  taxProviderMode: v.union(v.literal("rules"), v.literal("stripe")),
  shippingTaxClass: v.string(),
  // Written by commerce/payments.ts updateSettings.
  stripeEnabled: v.optional(v.boolean()),
  paypalEnabled: v.optional(v.boolean()),
  defaultCurrency: v.optional(v.string()),
  allowGuestCheckout: v.optional(v.boolean()),
  methodOrder: v.optional(v.array(v.string())),
});

const routeFlagsValidator = v.object({
  search: v.boolean(),
  catalog: v.boolean(),
  product: v.boolean(),
  cart: v.boolean(),
  checkout: v.boolean(),
});

export const commerceAssistantSettingsValidator = v.object({
  enabled: v.boolean(),
  displayName: v.string(),
  tagline: v.string(),
  placement: v.union(v.literal("left"), v.literal("right")),
  railWidthPx: v.number(),
  autoOpen: v.union(v.literal("firstSearch"), v.literal("always"), v.literal("never")),
  routes: routeFlagsValidator,
  mobileMode: v.union(v.literal("sheet"), v.literal("hidden")),
  model: v.string(),
  maxPicks: v.number(),
  cardsPerGroup: v.number(),
  groups: v.object({
    accessory: v.boolean(),
    consumable: v.boolean(),
    maintenance: v.boolean(),
    upgrade: v.boolean(),
    similar: v.boolean(),
  }),
  promptChips: v.union(v.literal("auto"), v.literal("curated"), v.literal("off")),
  curatedPrompts: v.array(v.string()),
  starterPrompts: v.array(v.string()),
  proactiveTips: v.boolean(),
  tipCooldownMs: v.number(),
  memoryEnabled: v.boolean(),
  memoryRetentionDays: v.number(),
  disclosureText: v.string(),
  tone: v.string(),
  boostedProductIds: v.array(v.string()),
  excludedCategoryIds: v.array(v.string()),
  rateLimitPerMinute: v.number(),
  searchFacets: v.boolean(),
  drawerRecommendations: v.boolean(),
  freeShippingThresholdMinor: v.number(),
});

export const commerceLayoutSettingsValidator = v.object({
  shopLayout: v.union(v.literal("boutique"), v.literal("marketplace")),
  productLayout: v.union(
    v.literal("classic"),
    v.literal("marketplace"),
    v.literal("split"),
    v.literal("showcase"),
    v.literal("minimal"),
  ),
  cartPanel: v.union(v.literal("persistent"), v.literal("drawer")),
  gridDensity: v.union(v.literal("comfortable"), v.literal("dense")),
});

/**
 * Template Customize values are pack-defined JSON: pack → module → field →
 * value. Field values nest at most seven levels (a footer `rows` field:
 * rows → row → columns → column → cell → items → item).
 */
export const TEMPLATE_FIELD_JSON_DEPTH = 7;
const templateFieldValueValidator = boundedJsonValidator(TEMPLATE_FIELD_JSON_DEPTH);

export const appearanceTemplateSettingsValidator = v.object({
  active: v.string(),
  overrides: v.record(v.string(), v.string()),
  variants: v.record(v.string(), v.string()),
  settings: v.record(v.string(), v.record(v.string(), v.record(v.string(), templateFieldValueValidator))),
});

const sizeScale = v.union(v.literal("compact"), v.literal("comfortable"), v.literal("spacious"));

export const brandSettingsValidator = v.object({
  moodPrompt: v.string(),
  references: v.array(v.string()),
  voice: v.string(),
  industry: v.string(),
  hardRules: v.array(v.string()),
  typography: v.object({ display: v.string(), body: v.string(), scale: sizeScale }),
  density: sizeScale,
  radius: v.union(v.literal("sharp"), v.literal("subtle"), v.literal("rounded"), v.literal("pill")),
  logoUrl: v.string(),
  faviconUrl: v.string(),
});

export const commerceSubscriptionsCountersSettingsValidator = v.object({
  invoiceCounter: v.number(),
  invoicePrefix: v.string(),
});

// ─── Integrations ────────────────────────────────────────────────────────────

export const shippingIntegrationSettingsValidator = v.object({
  preferredProvider: v.union(
    v.literal("shipstation"),
    v.literal("ups"),
    v.literal("usps"),
    v.literal("fedex"),
    v.literal("dhl"),
    v.literal(""),
  ),
  liveRatesEnabled: v.boolean(),
  fallbackToManualRates: v.boolean(),
  fallbackMessage: v.string(),
  recommendationStrategy: v.literal("best_value_weighted"),
  cheapestBadgeLabel: v.string(),
  fastestBadgeLabel: v.string(),
  bestOptionBadgeLabel: v.string(),
  quoteCacheTtlSeconds: v.number(),
  defaultPackageWeightOz: v.number(),
  shipFromName: v.string(),
  shipFromCompany: v.string(),
  shipFromLine1: v.string(),
  shipFromLine2: v.string(),
  shipFromCity: v.string(),
  shipFromState: v.string(),
  shipFromPostalCode: v.string(),
  shipFromCountryCode: v.string(),
});

export const shippingProviderSettingsValidator = v.object({
  enabled: v.boolean(),
  displayName: v.string(),
  mode: v.union(v.literal("sandbox"), v.literal("production")),
  isPrimary: v.boolean(),
  rateShoppingEnabled: v.boolean(),
  rateShoppingPriority: v.number(),
  accountNickname: v.string(),
});

export const clerkIntegrationSettingsValidator = v.object({
  clerkSecretKey: v.string(),
  clerkWebhookSecret: v.string(),
  clerkJwtIssuerDomain: v.string(),
  clerkPublishableKey: v.string(),
  clerkFrontendApi: v.string(),
  clerkEnvironmentType: v.union(v.literal(""), v.literal("development"), v.literal("production")),
  clerkInstanceId: v.string(),
  clerkConnectionMode: v.union(v.literal(""), v.literal("manual"), v.literal("secret_key"), v.literal("keyless")),
  clerkClaimUrl: v.string(),
  clerkDashboardUrl: v.string(),
  clerkClaimedAt: nullableNumber,
  clerkConnectedAt: nullableNumber,
  clerkJwtTemplateId: v.string(),
  clerkSvixConfigured: v.boolean(),
  clerkSiteOrigins: v.array(v.string()),
  clerkCapabilities: v.union(v.null(), authCapabilitiesValidator),
  clerkCapabilitiesSyncedAt: nullableNumber,
  clerkLastVerification: v.union(v.null(), clerkVerificationValidator),
  clerkLastVerifiedAt: nullableNumber,
  clerkWebhookLastReceivedAt: nullableNumber,
});

export const googleIntegrationSettingsValidator = v.object({
  placesApiKey: v.string(),
  geocodeApiKey: v.string(),
});

export const dashboardSettingsValidator = v.object({
  basePath: v.string(),
  layout: v.union(v.literal("sidebar"), v.literal("topbar"), v.literal("both")),
  sidebarLocation: v.string(),
  topbarLocation: v.string(),
  profileLocation: v.string(),
  sidebarCollapsedByDefault: v.boolean(),
  sidebarWidth: v.number(),
  showThemeToggle: v.boolean(),
  showNotificationBell: v.boolean(),
  showSearch: v.boolean(),
  brandMark: v.union(v.literal("site"), v.literal("custom"), v.literal("none")),
  customLogoUrl: v.string(),
  landingPage: v.string(),
  footerVariant: v.union(v.literal("minimal"), v.literal("full"), v.literal("none")),
  membersCanEditHome: v.boolean(),
  welcomeHeadline: v.string(),
});

export const analyticsGa4SettingsValidator = v.object({
  ga4ServiceAccountJson: v.string(),
  ga4PropertyId: v.string(),
});

// ─── Knowledge base, tickets, support ────────────────────────────────────────

export const kbGeneralSettingsValidator = v.object({
  siteName: v.string(),
  siteDescription: v.string(),
  homepageLayout: v.union(v.literal("categories"), v.literal("search"), v.literal("featured")),
  articlesPerPage: v.number(),
});

export const kbFeaturesSettingsValidator = v.object({
  commentsEnabled: v.boolean(),
  bookmarksEnabled: v.boolean(),
  progressTrackingEnabled: v.boolean(),
  ratingsEnabled: v.boolean(),
  relatedArticlesEnabled: v.boolean(),
});

export const kbSearchSettingsValidator = v.object({
  meilisearchEnabled: v.boolean(),
  meilisearchUrl: v.string(),
  meilisearchApiKey: v.string(),
  ragEnabled: v.boolean(),
  ragProvider: v.union(v.literal("openai"), v.literal("anthropic")),
  ragApiKey: v.string(),
  ragModel: v.string(),
});

export const ticketGeneralSettingsValidator = v.object({
  categories: v.array(v.object({ value: v.string(), label: v.string() })),
  defaultPriority: v.union(v.literal("low"), v.literal("medium"), v.literal("high"), v.literal("urgent")),
  autoCloseAfterDays: v.number(),
});

export const ticketSlaSettingsValidator = v.object({
  firstResponseTarget: v.number(),
  resolutionTarget: v.number(),
});

export const supportWidgetSettingsValidator = v.object({
  enabled: v.boolean(),
  widgetTitle: v.string(),
  widgetSubtitle: v.string(),
  widgetColor: v.string(),
  showKbSearch: v.boolean(),
  showTicketHistory: v.boolean(),
  aiEnabled: v.boolean(),
  escalationButtonLabel: v.string(),
});

export const supportAiSettingsValidator = v.object({
  aiProvider: v.union(v.null(), v.literal("openai"), v.literal("anthropic")),
  aiApiKey: v.string(),
  aiModel: v.string(),
  meilisearchEnabled: v.boolean(),
  meilisearchUrl: v.string(),
  meilisearchApiKey: v.string(),
  ragEnabled: v.boolean(),
});

// ─── Website appearance ──────────────────────────────────────────────────────

export const layoutAssignmentSettingsValidator = v.object({
  blogPostLayout: v.string(),
  pageLayout: v.string(),
  blogIndexLayout: v.string(),
  categoryArchiveLayout: v.string(),
  tagArchiveLayout: v.string(),
  authorArchiveLayout: v.string(),
  searchResultsLayout: v.string(),
  kbArticleLayout: v.string(),
});

const headerContentValidator = v.union(
  v.literal("contact"),
  v.literal("announcement"),
  v.literal("social"),
  v.literal("none"),
);

export const headerSettingsValidator = v.object({
  layout: v.object({
    style: v.union(v.literal("standard"), v.literal("centered"), v.literal("split")),
    sticky: v.union(v.literal("always"), v.literal("scroll-up"), v.literal("none")),
    background: v.union(v.literal("solid"), v.literal("transparent"), v.literal("glass")),
    height: v.union(v.literal("compact"), v.literal("normal"), v.literal("tall")),
    bottomBorder: v.union(v.literal("subtle"), v.literal("bold"), v.literal("none"), v.literal("shadow")),
  }),
  topBar: v.object({
    enabled: v.boolean(),
    leftContent: headerContentValidator,
    rightContent: headerContentValidator,
    email: v.string(),
    phone: v.string(),
    announcementText: v.string(),
  }),
  logo: v.object({
    enabled: v.boolean(),
    showImage: v.boolean(),
    showTitle: v.boolean(),
    showTagline: v.boolean(),
    size: v.union(v.literal("small"), v.literal("medium"), v.literal("large")),
  }),
  navigation: v.object({
    enabled: v.boolean(),
    menuSource: v.union(v.literal("primary"), v.literal("secondary"), v.literal("custom")),
    customLocation: v.optional(v.string()),
    style: v.union(v.literal("inline"), v.literal("pills"), v.literal("underline")),
    dropdownStyle: v.union(v.literal("flyout"), v.literal("mega")),
  }),
  search: v.object({
    enabled: v.boolean(),
    variant: v.union(v.literal("inline"), v.literal("icon"), v.literal("expandable")),
    placeholder: v.string(),
  }),
  cta: v.object({
    enabled: v.boolean(),
    label: v.string(),
    url: v.string(),
    style: v.union(v.literal("filled"), v.literal("outline"), v.literal("ghost")),
  }),
  userMenu: v.object({
    enabled: v.boolean(),
    guestDisplay: v.union(v.literal("login-register"), v.literal("login-only"), v.literal("hidden")),
    loggedInDisplay: v.union(v.literal("avatar-dropdown"), v.literal("name-dropdown"), v.literal("avatar-only")),
    dropdownPreset: v.union(
      v.literal("dashboard-profile-logout"),
      v.literal("profile-settings-logout"),
      v.literal("custom"),
    ),
  }),
  darkModeToggle: v.object({
    enabled: v.boolean(),
    variant: v.union(v.literal("icon"), v.literal("switch")),
  }),
  mobileMenu: v.object({
    variant: v.union(v.literal("drawer"), v.literal("fullscreen"), v.literal("dropdown")),
    drawerSide: v.union(v.literal("left"), v.literal("right")),
  }),
});

const footerAlignment = v.union(v.literal("left"), v.literal("center"), v.literal("right"));
const footerCellBase = { heading: v.optional(v.string()), alignment: v.optional(footerAlignment) };

export const footerCellValidator = v.union(
  v.object({ type: v.literal("text"), ...footerCellBase, body: v.string() }),
  v.object({
    type: v.literal("links"),
    ...footerCellBase,
    items: v.array(v.object({
      label: v.string(),
      url: v.string(),
      target: v.optional(v.union(v.literal("_self"), v.literal("_blank"))),
      rel: v.optional(v.string()),
    })),
  }),
  v.object({ type: v.literal("nav"), ...footerCellBase, menuLocation: v.string() }),
  v.object({
    type: v.literal("image"),
    ...footerCellBase,
    mediaId: nullableString,
    alt: v.string(),
    href: v.optional(v.string()),
    width: v.optional(v.number()),
  }),
  v.object({
    type: v.literal("social"),
    ...footerCellBase,
    style: v.union(v.literal("icons"), v.literal("icons-and-labels"), v.literal("labels")),
  }),
  v.object({
    type: v.literal("newsletter"),
    ...footerCellBase,
    subtext: v.string(),
    buttonText: v.string(),
    audienceId: v.optional(v.string()),
  }),
  v.object({
    type: v.literal("contact"),
    ...footerCellBase,
    address: v.string(),
    phone: v.string(),
    email: v.string(),
    showIcons: v.boolean(),
  }),
  v.object({
    type: v.literal("brand"),
    ...footerCellBase,
    showLogo: v.boolean(),
    showTagline: v.boolean(),
    showDescription: v.boolean(),
    description: v.string(),
  }),
  v.object({ type: v.literal("html"), ...footerCellBase, rawHtml: v.string() }),
  v.object({
    type: v.literal("divider"),
    ...footerCellBase,
    thickness: v.union(v.literal("thin"), v.literal("medium"), v.literal("thick")),
  }),
  v.object({ type: v.literal("copyright"), ...footerCellBase, text: v.string(), insertYear: v.boolean() }),
  v.object({ type: v.literal("payments"), ...footerCellBase, methods: v.array(v.string()) }),
);

export const footerSettingsValidator = v.object({
  rows: v.array(v.object({
    id: v.string(),
    heading: v.optional(v.string()),
    background: v.union(
      v.literal("default"),
      v.literal("muted"),
      v.literal("accent"),
      v.literal("contrast"),
      v.literal("transparent"),
    ),
    padding: v.union(v.literal("none"), v.literal("compact"), v.literal("normal"), v.literal("spacious")),
    container: v.union(v.literal("narrow"), v.literal("default"), v.literal("wide"), v.literal("full")),
    alignment: v.optional(footerAlignment),
    topBorder: v.optional(v.union(v.literal("none"), v.literal("subtle"), v.literal("bold"), v.literal("accent"))),
    columns: v.array(v.object({
      id: v.string(),
      width: v.optional(v.number()),
      alignment: v.optional(footerAlignment),
      cell: footerCellValidator,
    })),
  })),
  layout: v.object({
    columns: v.union(
      v.literal("1"),
      v.literal("2"),
      v.literal("3"),
      v.literal("4"),
      v.literal("centered"),
      v.literal("minimal"),
    ),
    background: v.union(v.literal("dark"), v.literal("match-site"), v.literal("accent"), v.literal("image")),
    backgroundImageId: nullableString,
    topBorder: v.union(v.literal("subtle"), v.literal("bold"), v.literal("accent"), v.literal("none")),
    padding: v.union(v.literal("compact"), v.literal("normal"), v.literal("spacious")),
  }),
  branding: v.object({
    enabled: v.boolean(),
    showLogo: v.boolean(),
    showDescription: v.boolean(),
    description: v.string(),
    showSocial: v.boolean(),
  }),
  navColumns: v.object({
    enabled: v.boolean(),
    columns: v.array(v.object({
      heading: v.string(),
      menuSource: v.union(
        v.literal("footer-1"),
        v.literal("footer-2"),
        v.literal("footer-3"),
        v.literal("auto-pages"),
        v.literal("custom"),
      ),
    })),
  }),
  newsletter: v.object({
    enabled: v.boolean(),
    heading: v.string(),
    subtext: v.string(),
    buttonText: v.string(),
  }),
  contactInfo: v.object({
    enabled: v.boolean(),
    address: v.string(),
    phone: v.string(),
    email: v.string(),
  }),
  bottomBar: v.object({
    enabled: v.boolean(),
    copyrightText: v.string(),
    legalLinks: v.union(v.literal("privacy-terms"), v.literal("privacy-only"), v.literal("custom"), v.literal("none")),
    poweredBy: v.boolean(),
  }),
});

// ─── Section registry ────────────────────────────────────────────────────────

export const SECTION_VALUE_VALIDATORS = {
  general: generalSettingsValidator,
  reading: readingSettingsValidator,
  writing: writingSettingsValidator,
  discussion: discussionSettingsValidator,
  permalinks: permalinkSettingsValidator,
  privacy: privacySettingsValidator,
  email: emailSettingsValidator,
  media: mediaSettingsValidator,
  analytics: analyticsSettingsValidator,
  ai: aiSettingsValidator,
  blocks: blockSettingsValidator,
  plugins: pluginsSettingsValidator,
  "membership.general": membershipGeneralSettingsValidator,
  search: searchSettingsValidator,
  "commerce.general": commerceGeneralSettingsValidator,
  "commerce.payments": commercePaymentsSettingsValidator,
  "commerce.assistant": commerceAssistantSettingsValidator,
  "commerce.layout": commerceLayoutSettingsValidator,
  "appearance.template": appearanceTemplateSettingsValidator,
  brand: brandSettingsValidator,
  "commerce.subscriptions.counters": commerceSubscriptionsCountersSettingsValidator,
  "integrations.shipping": shippingIntegrationSettingsValidator,
  "integrations.shipping.shipstation": shippingProviderSettingsValidator,
  "integrations.shipping.ups": shippingProviderSettingsValidator,
  "integrations.shipping.usps": shippingProviderSettingsValidator,
  "integrations.shipping.fedex": shippingProviderSettingsValidator,
  "integrations.shipping.dhl": shippingProviderSettingsValidator,
  "integrations.clerk": clerkIntegrationSettingsValidator,
  "integrations.google": googleIntegrationSettingsValidator,
  dashboard: dashboardSettingsValidator,
  "analytics.ga4": analyticsGa4SettingsValidator,
  "kb.general": kbGeneralSettingsValidator,
  "kb.features": kbFeaturesSettingsValidator,
  "kb.search": kbSearchSettingsValidator,
  "ticket.general": ticketGeneralSettingsValidator,
  "ticket.sla": ticketSlaSettingsValidator,
  "support.widget": supportWidgetSettingsValidator,
  "support.ai": supportAiSettingsValidator,
  layout: layoutAssignmentSettingsValidator,
  header: headerSettingsValidator,
  footer: footerSettingsValidator,
} satisfies Record<SettingsSection, unknown>;

type SectionValueValidators = typeof SECTION_VALUE_VALIDATORS;

/** The exact stored values of one settings section. */
export type SectionValues<S extends SettingsSection> = Infer<SectionValueValidators[S]>;

/** Defaults for every section, at exactly the section's type. */
const SECTION_DEFAULTS: { [S in SettingsSection]: SectionValues<S> } = {
  general: GENERAL_DEFAULTS,
  reading: READING_DEFAULTS,
  writing: WRITING_DEFAULTS,
  discussion: DISCUSSION_DEFAULTS,
  permalinks: PERMALINK_DEFAULTS,
  privacy: PRIVACY_DEFAULTS,
  email: EMAIL_DEFAULTS,
  media: MEDIA_DEFAULTS,
  analytics: ANALYTICS_DEFAULTS,
  ai: AI_DEFAULTS,
  blocks: BLOCK_DEFAULTS,
  // Registry defaults win, matching getDefaults("plugins").
  plugins: Object.assign(
    {},
    PLUGINS_DEFAULTS,
    Object.fromEntries(
      Object.entries(PLUGIN_SETTINGS_KEY)
        .filter(([, key]) => key.endsWith("Enabled"))
        .map(([id, key]) => [key, PLUGIN_DEFAULTS[id] === true]),
    ),
  ),
  "membership.general": MEMBERSHIP_GENERAL_DEFAULTS,
  search: SEARCH_DEFAULTS,
  "commerce.general": COMMERCE_GENERAL_DEFAULTS,
  "commerce.payments": COMMERCE_PAYMENTS_DEFAULTS,
  "commerce.assistant": COMMERCE_ASSISTANT_DEFAULTS,
  "commerce.layout": COMMERCE_LAYOUT_DEFAULTS,
  "appearance.template": APPEARANCE_TEMPLATE_DEFAULTS,
  brand: BRAND_DEFAULTS,
  "commerce.subscriptions.counters": COMMERCE_SUBSCRIPTIONS_COUNTERS_DEFAULTS,
  "integrations.shipping": SHIPPING_INTEGRATION_DEFAULTS,
  "integrations.shipping.shipstation": SHIPPING_PROVIDER_SECTION_DEFAULTS["integrations.shipping.shipstation"],
  "integrations.shipping.ups": SHIPPING_PROVIDER_SECTION_DEFAULTS["integrations.shipping.ups"],
  "integrations.shipping.usps": SHIPPING_PROVIDER_SECTION_DEFAULTS["integrations.shipping.usps"],
  "integrations.shipping.fedex": SHIPPING_PROVIDER_SECTION_DEFAULTS["integrations.shipping.fedex"],
  "integrations.shipping.dhl": SHIPPING_PROVIDER_SECTION_DEFAULTS["integrations.shipping.dhl"],
  "integrations.clerk": CLERK_INTEGRATION_DEFAULTS,
  "integrations.google": GOOGLE_INTEGRATION_DEFAULTS,
  dashboard: DASHBOARD_DEFAULTS,
  "analytics.ga4": ANALYTICS_GA4_DEFAULTS,
  "kb.general": KB_GENERAL_DEFAULTS,
  "kb.features": KB_FEATURES_DEFAULTS,
  "kb.search": KB_SEARCH_DEFAULTS,
  "ticket.general": TICKET_GENERAL_DEFAULTS,
  "ticket.sla": TICKET_SLA_DEFAULTS,
  "support.widget": SUPPORT_WIDGET_SECTION_DEFAULTS,
  "support.ai": SUPPORT_AI_SECTION_DEFAULTS,
  layout: LAYOUT_ASSIGNMENT_DEFAULTS,
  header: HEADER_DEFAULTS,
  footer: FOOTER_DEFAULTS,
};

/** Read stored `values` for a section at exactly its declared type. */
export function readSectionValues<S extends SettingsSection>(section: S, stored: unknown): SectionValues<S> {
  return readValidated(SECTION_VALUE_VALIDATORS[section], stored, SECTION_DEFAULTS[section]);
}

/** Load one section from the settings table at exactly its declared type. */
export async function readSettingsSection<S extends SettingsSection>(
  ctx: Pick<QueryCtx, "db">,
  section: S,
): Promise<{ doc: Doc<"settings"> | null; values: SectionValues<S> }> {
  const doc = await ctx.db
    .query("settings")
    .withIndex("by_section", (q) => q.eq("section", section))
    .unique();
  return { doc, values: readSectionValues(section, doc?.values) };
}

// ─── Section + document metadata ─────────────────────────────────────────────

/** Metadata `getBySection`-style reads add beside the section's values. */
const sectionMetaFields = {
  _id: v.union(v.null(), v.id("settings")),
  updatedAt: nullableNumber,
  updatedBy: v.union(v.null(), v.id("users")),
};

export function sectionMeta(doc: Doc<"settings"> | null) {
  return { _id: doc?._id ?? null, updatedAt: doc?.updatedAt ?? null, updatedBy: doc?.updatedBy ?? null };
}

/**
 * One section's values plus its document metadata, as `getBySection` and the
 * internal section reads return them. `redact` masks stored secrets with the
 * "__set__" sentinel before reading (masked fields remain strings).
 */
export async function readSectionWithMeta(
  ctx: Pick<QueryCtx, "db">,
  section: SettingsSection,
  options: { redact: boolean },
) {
  const doc = await ctx.db
    .query("settings")
    .withIndex("by_section", (q) => q.eq("section", section))
    .unique();
  const stored = options.redact ? redactSettingSecrets(settingsRecord(doc?.values)) : doc?.values;
  return { ...readSectionValues(section, stored), ...sectionMeta(doc) };
}

function withMeta<F extends PropertyValidators>(fields: F) {
  return v.object(Object.assign({}, fields, sectionMetaFields));
}

/** One section's values with the document metadata, for any section. */
export const sectionWithMetaValidator = v.union(
  withMeta(generalSettingsValidator.fields),
  withMeta(readingSettingsValidator.fields),
  withMeta(writingSettingsValidator.fields),
  withMeta(discussionSettingsValidator.fields),
  withMeta(permalinkSettingsValidator.fields),
  withMeta(privacySettingsValidator.fields),
  withMeta(emailSettingsValidator.fields),
  withMeta(mediaSettingsValidator.fields),
  withMeta(analyticsSettingsValidator.fields),
  withMeta(aiSettingsValidator.fields),
  withMeta(blockSettingsValidator.fields),
  withMeta(pluginsSettingsValidator.fields),
  withMeta(membershipGeneralSettingsValidator.fields),
  withMeta(searchSettingsValidator.fields),
  withMeta(commerceGeneralSettingsValidator.fields),
  withMeta(commercePaymentsSettingsValidator.fields),
  withMeta(commerceAssistantSettingsValidator.fields),
  withMeta(commerceLayoutSettingsValidator.fields),
  withMeta(appearanceTemplateSettingsValidator.fields),
  withMeta(brandSettingsValidator.fields),
  withMeta(commerceSubscriptionsCountersSettingsValidator.fields),
  withMeta(shippingIntegrationSettingsValidator.fields),
  withMeta(shippingProviderSettingsValidator.fields),
  withMeta(clerkIntegrationSettingsValidator.fields),
  withMeta(googleIntegrationSettingsValidator.fields),
  withMeta(dashboardSettingsValidator.fields),
  withMeta(analyticsGa4SettingsValidator.fields),
  withMeta(kbGeneralSettingsValidator.fields),
  withMeta(kbFeaturesSettingsValidator.fields),
  withMeta(kbSearchSettingsValidator.fields),
  withMeta(ticketGeneralSettingsValidator.fields),
  withMeta(ticketSlaSettingsValidator.fields),
  withMeta(supportWidgetSettingsValidator.fields),
  withMeta(supportAiSettingsValidator.fields),
  withMeta(layoutAssignmentSettingsValidator.fields),
  withMeta(headerSettingsValidator.fields),
  withMeta(footerSettingsValidator.fields),
);

/** Any one section's values (no metadata). */
export const anySectionValuesValidator = v.union(
  generalSettingsValidator,
  readingSettingsValidator,
  writingSettingsValidator,
  discussionSettingsValidator,
  permalinkSettingsValidator,
  privacySettingsValidator,
  emailSettingsValidator,
  mediaSettingsValidator,
  analyticsSettingsValidator,
  aiSettingsValidator,
  blockSettingsValidator,
  pluginsSettingsValidator,
  membershipGeneralSettingsValidator,
  searchSettingsValidator,
  commerceGeneralSettingsValidator,
  commercePaymentsSettingsValidator,
  commerceAssistantSettingsValidator,
  commerceLayoutSettingsValidator,
  appearanceTemplateSettingsValidator,
  brandSettingsValidator,
  commerceSubscriptionsCountersSettingsValidator,
  shippingIntegrationSettingsValidator,
  shippingProviderSettingsValidator,
  clerkIntegrationSettingsValidator,
  googleIntegrationSettingsValidator,
  dashboardSettingsValidator,
  analyticsGa4SettingsValidator,
  kbGeneralSettingsValidator,
  kbFeaturesSettingsValidator,
  kbSearchSettingsValidator,
  ticketGeneralSettingsValidator,
  ticketSlaSettingsValidator,
  supportWidgetSettingsValidator,
  supportAiSettingsValidator,
  layoutAssignmentSettingsValidator,
  headerSettingsValidator,
  footerSettingsValidator,
);

/**
 * Document fields a client may send back beside a section's values: section
 * reads return them (see sectionMeta), and updateSection strips them before
 * anything is stored. They are accepted, never trusted.
 */
const sectionPatchMetaFields = {
  _id: v.optional(v.union(v.null(), v.string())),
  _creationTime: v.optional(v.number()),
  section: v.optional(v.string()),
  updatedAt: v.optional(v.union(v.null(), v.number())),
  updatedBy: v.optional(v.union(v.null(), v.string())),
  legacyAppearanceMigration: v.optional(v.object({ version: v.number(), migratedAt: v.number() })),
};

/** A section's values as an update sends them: any subset of its fields. */
function patchOf<F extends PropertyValidators>(fields: F) {
  return v.object(Object.assign({}, partial(fields), sectionPatchMetaFields));
}

/**
 * Any one section's values as updateSection accepts them. The args validator
 * cannot tie `values` to `section`, so it takes a subset of any section;
 * settings/validators.ts `sectionValuesPatchErrors` checks the section named.
 */
export const sectionValuesPatchValidator = v.union(
  patchOf(generalSettingsValidator.fields),
  patchOf(readingSettingsValidator.fields),
  patchOf(writingSettingsValidator.fields),
  patchOf(discussionSettingsValidator.fields),
  patchOf(permalinkSettingsValidator.fields),
  patchOf(privacySettingsValidator.fields),
  patchOf(emailSettingsValidator.fields),
  patchOf(mediaSettingsValidator.fields),
  patchOf(analyticsSettingsValidator.fields),
  patchOf(aiSettingsValidator.fields),
  patchOf(blockSettingsValidator.fields),
  patchOf(pluginsSettingsValidator.fields),
  patchOf(membershipGeneralSettingsValidator.fields),
  patchOf(searchSettingsValidator.fields),
  patchOf(commerceGeneralSettingsValidator.fields),
  patchOf(commercePaymentsSettingsValidator.fields),
  patchOf(commerceAssistantSettingsValidator.fields),
  patchOf(commerceLayoutSettingsValidator.fields),
  patchOf(appearanceTemplateSettingsValidator.fields),
  patchOf(brandSettingsValidator.fields),
  patchOf(commerceSubscriptionsCountersSettingsValidator.fields),
  patchOf(shippingIntegrationSettingsValidator.fields),
  patchOf(shippingProviderSettingsValidator.fields),
  patchOf(clerkIntegrationSettingsValidator.fields),
  patchOf(googleIntegrationSettingsValidator.fields),
  patchOf(dashboardSettingsValidator.fields),
  patchOf(analyticsGa4SettingsValidator.fields),
  patchOf(kbGeneralSettingsValidator.fields),
  patchOf(kbFeaturesSettingsValidator.fields),
  patchOf(kbSearchSettingsValidator.fields),
  patchOf(ticketGeneralSettingsValidator.fields),
  patchOf(ticketSlaSettingsValidator.fields),
  patchOf(supportWidgetSettingsValidator.fields),
  patchOf(supportAiSettingsValidator.fields),
  patchOf(layoutAssignmentSettingsValidator.fields),
  patchOf(headerSettingsValidator.fields),
  patchOf(footerSettingsValidator.fields),
);
