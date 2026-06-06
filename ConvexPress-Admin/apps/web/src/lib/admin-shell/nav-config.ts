import {
  LayoutDashboard,
  FileText,
  Image,
  Images,
  File,
  MessageSquare,
  Users,
  Palette,
  Settings,
  Wrench,
  SlidersHorizontal,
  Search,
  RefreshCcw,
  BarChart3,
  Brain,
  Mail,
  Puzzle,
  BookOpen,
  GraduationCap,
  TicketCheck,
  ChefHat,
  ArrowUpCircle,
  ShoppingCart,
  ShoppingBag,
  Repeat,
  ShieldCheck,
  KeyRound,
} from "lucide-react";

import type { AdminNavSection } from "./types";
import { PLUGINS_NAV_SECTION } from "@/lib/plugins/registry";

/**
 * Admin sidebar navigation configuration.
 * Mirrors WordPress admin menu structure.
 * Items are filtered at render time by user capabilities.
 *
 * ─── Extension v2 nav scanner ───────────────────────────────────────────────
 * User and official v2 extensions discovered at build time from two roots:
 *   apps/web/src/extensions/<id>/nav.ts        (official, tracked)
 *   apps/web/src/extensions.local/<id>/nav.ts  (user, gitignored)
 * Each `nav.ts` must default-export an AdminNavSection. The scanner appends
 * discovered sections to PLATFORM_NAV_SECTIONS at the bottom of this module,
 * exported as ADMIN_NAV_SECTIONS. Sections without `nav.ts` simply don't
 * appear in the sidebar — useful for plugin-only extensions with no nav.
 */
const PLATFORM_NAV_SECTIONS: AdminNavSection[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    to: "/dashboard",
    icon: LayoutDashboard,
    // No capability - all authenticated admin users can see Dashboard
  },
  {
    id: "setup",
    label: "Setup",
    to: "/setup",
    icon: KeyRound,
    capability: "manage_options",
  },
  {
    id: "posts",
    label: "Posts",
    to: "/posts",
    icon: FileText,
    capability: "edit_posts",
    separator: true,
    children: [
      { id: "posts-all", label: "All Posts", to: "/posts", exact: true },
      {
        id: "posts-new",
        label: "Add New Post",
        to: "/posts/new",
        isAddNew: true,
      },
      {
        id: "posts-categories",
        label: "Categories",
        to: "/posts/categories",
        capability: "manage_categories",
      },
      {
        id: "posts-tags",
        label: "Tags",
        to: "/posts/tags",
        capability: "manage_categories",
      },
    ],
  },
  {
    id: "media",
    label: "Media",
    to: "/media",
    icon: Image,
    capability: "upload_files",
    children: [
      { id: "media-library", label: "Library", to: "/media", exact: true },
      { id: "media-new", label: "Add New", to: "/media/upload", isAddNew: true },
    ],
  },
  {
    id: "lms",
    label: "Courses",
    to: "/lms/courses",
    icon: GraduationCap,
    capability: "lms.course.view",
    pluginId: "lms",
    children: [
      { id: "lms-courses", label: "All Courses", to: "/lms/courses", exact: true, capability: "lms.course.view" },
      {
        id: "lms-new",
        label: "Add New Course",
        to: "/lms/courses/new",
        isAddNew: true,
        capability: "lms.course.create",
      },
      { id: "lms-catalog", label: "Catalog", to: "/lms/catalog" },
      { id: "lms-mylearning", label: "My Learning", to: "/lms/my-courses" },
      { id: "lms-enrollments", label: "Enrollments", to: "/lms/enrollments", capability: "lms.enroll.manage" },
      { id: "lms-certificates", label: "Certificates", to: "/lms/certificates", capability: "lms.certificate.manage" },
      { id: "lms-settings", label: "Settings", to: "/lms/settings", capability: "lms.settings.manage" },
    ],
  },
  {
    id: "pages",
    label: "Pages",
    to: "/pages",
    icon: File,
    capability: "edit_pages",
    children: [
      { id: "pages-all", label: "All Pages", to: "/pages", exact: true },
      {
        id: "pages-new",
        label: "Add New Page",
        to: "/pages/new",
        isAddNew: true,
      },
      {
        id: "pages-blocks",
        label: "Blocks",
        to: "/pages/blocks",
        capability: "manage_options",
      },
    ],
  },
  {
    id: "commerce",
    label: "Commerce",
    to: "/commerce",
    icon: ShoppingCart,
    capability: "manage_options",
    pluginId: "commerce",
    separator: true,
    children: [
      { id: "commerce-overview", label: "Overview", to: "/commerce", exact: true },
      { id: "commerce-orders", label: "Orders", to: "/commerce/orders" },
      { id: "commerce-orders-abandoned", label: "Abandoned Carts", to: "/commerce/orders/abandoned" },
      { id: "commerce-customers", label: "Customers", to: "/commerce/customers" },
      { id: "commerce-discounts", label: "Discounts", to: "/commerce/discounts" },
      { id: "commerce-pricing", label: "Dynamic Pricing", to: "/commerce/pricing" },
      { id: "commerce-draft-orders", label: "Draft Orders", to: "/commerce/draft-orders" },
      { id: "commerce-wishlists", label: "Wishlists", to: "/commerce/wishlists", pluginId: "commerceWishlists" },
      { id: "commerce-returns", label: "Returns", to: "/commerce/returns", pluginId: "commerceReturns" },
      { id: "commerce-payments", label: "Payments", to: "/commerce/payments" },
      { id: "commerce-payment-collections", label: "Payment Collections", to: "/commerce/payment-collections" },
      { id: "commerce-order-changes", label: "Order Changes", to: "/commerce/order-changes" },
      { id: "commerce-regions", label: "Regions", to: "/commerce/regions" },
      { id: "commerce-sales-channels", label: "Sales Channels", to: "/commerce/sales-channels" },
      { id: "commerce-customer-groups", label: "Customer Groups", to: "/commerce/customer-groups" },
      { id: "commerce-workflows", label: "Workflows", to: "/commerce/workflows" },
      { id: "commerce-settings", label: "Settings", to: "/commerce/settings" },
    ],
  },
  {
    id: "products",
    label: "Products",
    to: "/commerce/products",
    icon: ShoppingBag,
    capability: "manage_options",
    pluginId: "commerce",
    children: [
      { id: "products-all", label: "All Products", to: "/commerce/products", exact: true },
      { id: "products-new", label: "Add New", to: "/commerce/products/new", isAddNew: true },
      { id: "products-categories", label: "Categories", to: "/commerce/categories" },
      { id: "products-attributes", label: "Attributes", to: "/commerce/attributes" },
      { id: "products-reviews", label: "Reviews", to: "/commerce/reviews", pluginId: "commerceReviews" },
      { id: "products-bundles", label: "Bundles", to: "/commerce/bundles", pluginId: "commerceBundles" },
      { id: "products-digital", label: "Digital Products", to: "/commerce/digital", pluginId: "commerceDigital" },
    ],
  },
  {
    id: "commerce-subscriptions",
    label: "Subscriptions",
    to: "/commerce/subscriptions",
    icon: Repeat,
    capability: "manage_options",
    pluginId: "commerceSubscriptions",
    children: [
      { id: "subs-overview", label: "Overview", to: "/commerce/subscriptions", exact: true },
      { id: "subs-contracts", label: "Contracts", to: "/commerce/subscriptions/contracts" },
      { id: "subs-templates", label: "Templates", to: "/commerce/subscriptions/templates" },
      { id: "subs-offers", label: "Offers", to: "/commerce/subscriptions/offers" },
      { id: "subs-coupons", label: "Coupons", to: "/commerce/subscriptions/coupons" },
      { id: "subs-order-forms", label: "Order Forms", to: "/commerce/subscriptions/order-forms" },
      { id: "subs-form-submissions", label: "Form Submissions", to: "/commerce/subscriptions/form-submissions" },
      { id: "subs-pricing-cards", label: "Pricing Cards", to: "/commerce/subscriptions/pricing-cards" },
      { id: "subs-invoices", label: "Invoices", to: "/commerce/subscriptions/invoices" },
      { id: "subs-dunning", label: "Dunning", to: "/commerce/subscriptions/dunning" },
    ],
  },
  {
    id: "membership",
    label: "Membership",
    to: "/membership",
    icon: ShieldCheck,
    capability: "manage_options",
    pluginId: "membership",
    children: [
      { id: "membership-overview", label: "Overview", to: "/membership", exact: true },
      { id: "membership-plans", label: "Plans", to: "/membership/plans" },
      { id: "membership-grants", label: "Grants", to: "/membership/grants" },
      { id: "membership-grants-new", label: "Add Grant", to: "/membership/grants/new", isAddNew: true },
      { id: "membership-restrictions", label: "Restrictions", to: "/membership/restrictions" },
      { id: "membership-restrictions-new", label: "Add Restriction", to: "/membership/restrictions/new", isAddNew: true },
      { id: "membership-settings", label: "Settings", to: "/membership/settings" },
    ],
  },
  {
    id: "gallery",
    label: "Galleries",
    to: "/gallery",
    icon: Images,
    capability: "edit_posts",
    pluginId: "gallery",
    children: [
      { id: "gallery-all", label: "All Albums", to: "/gallery", exact: true },
      { id: "gallery-new", label: "Add New", to: "/gallery/new", isAddNew: true },
      { id: "gallery-categories", label: "Categories", to: "/gallery/categories" },
      { id: "gallery-settings", label: "Settings", to: "/gallery/settings" },
    ],
  },
  {
    id: "kb",
    label: "Knowledge Base",
    to: "/kb",
    icon: BookOpen,
    capability: "kb.view",
    pluginId: "knowledgeBase",
    children: [
      { id: "kb-all", label: "All Articles", to: "/kb", exact: true },
      { id: "kb-new", label: "Add New", to: "/kb/new", isAddNew: true },
      { id: "kb-categories", label: "Categories", to: "/kb/categories" },
      { id: "kb-tags", label: "Tags", to: "/kb/tags" },
      { id: "kb-collections", label: "Collections", to: "/kb/collections" },
      { id: "kb-templates", label: "Templates", to: "/kb/templates" },
      { id: "kb-workflows", label: "Workflows", to: "/kb/workflows", capability: "manage_options" },
      { id: "kb-analytics", label: "Analytics", to: "/kb/analytics" },
      { id: "kb-settings", label: "Settings", to: "/kb/settings", capability: "manage_options" },
    ],
  },
  {
    id: "tickets",
    label: "Support Tickets",
    to: "/tickets",
    icon: TicketCheck,
    capability: "ticket.view",
    pluginId: "tickets",
    children: [
      { id: "tickets-all", label: "All Tickets", to: "/tickets", exact: true },
      { id: "tickets-canned", label: "Canned Responses", to: "/tickets/canned-responses", capability: "manage_options" },
      { id: "tickets-analytics", label: "Analytics", to: "/tickets/analytics" },
      { id: "support-analytics", label: "Deflection Analytics", to: "/support/analytics", icon: BarChart3, capability: "manage_options" },
      { id: "support-settings", label: "Support Settings", to: "/support/settings", capability: "manage_options" },
      { id: "tickets-settings", label: "Settings", to: "/tickets/settings", capability: "manage_options" },
    ],
  },
  {
    id: "comments",
    label: "Comments",
    to: "/comments",
    icon: MessageSquare,
    capability: "moderate_comments",
    // badge: dynamically set from pending comment count
    children: [
      { id: "comments-all", label: "All Comments", to: "/comments", exact: true },
      {
        id: "comments-pending",
        label: "Pending",
        to: "/comments/pending",
        capability: "moderate_comments",
      },
    ],
  },
  {
    id: "custom-fields",
    label: "Custom Fields",
    to: "/custom-fields",
    icon: SlidersHorizontal,
    capability: "manage_options",
    pluginId: "customFields",
    children: [
      {
        id: "custom-fields-all",
        label: "Field Groups",
        to: "/custom-fields",
        exact: true,
      },
      {
        id: "custom-fields-new",
        label: "Add New",
        to: "/custom-fields/new",
        isAddNew: true,
      },
    ],
  },
  {
    id: "recipes",
    label: "Recipes",
    to: "/recipes",
    icon: ChefHat,
    capability: "edit_posts",
    pluginId: "recipes",
    children: [
      { id: "recipes-all", label: "All Recipes", to: "/recipes", exact: true },
      {
        id: "recipes-new",
        label: "Add New",
        to: "/recipes/new",
        isAddNew: true,
      },
      {
        id: "recipes-categories",
        label: "Categories",
        to: "/recipes/categories",
      },
    ],
  },
  {
    id: "users",
    label: "Users",
    to: "/users",
    icon: Users,
    capability: "list_users",
    separator: true,
    children: [
      {
        id: "users-all",
        label: "All Users",
        to: "/users",
        exact: true,
        capability: "list_users",
      },
      {
        id: "users-new",
        label: "Add New User",
        to: "/users/new",
        isAddNew: true,
        capability: "create_users",
      },
      { id: "users-profile", label: "Your Profile", to: "/profile" },
      {
        id: "users-roles",
        label: "Roles & Capabilities",
        to: "/roles",
        capability: "role.update",
      },
      {
        id: "users-roles-new",
        label: "Add New Role",
        to: "/roles/new",
        capability: "role.update",
        isAddNew: true,
      },
    ],
  },
  {
    id: "appearance",
    label: "Appearance",
    to: "/appearance",
    icon: Palette,
    capability: "edit_theme_options",
    separator: true,
    children: [
      // ── Site chrome composers ─────────────────────────────────────────────
      // Dynamic header/footer/colors authoring. These write to the `header`,
      // `footer`, and color settings sections; the Website reads them via
      // useHeaderConfig / useFooterConfig and renders SiteHeader / SiteFooter
      // from the live values. NOT a preset picker — full per-section control.
      { id: "appearance-header", label: "Header", to: "/appearance/header" },
      { id: "appearance-footer", label: "Footer", to: "/appearance/footer" },
      { id: "appearance-colors", label: "Colors", to: "/appearance/colors" },

      // ── Menus ─────────────────────────────────────────────────────────────
      { id: "appearance-menus", label: "Menus", to: "/menus", exact: true },
      { id: "appearance-menu-locations", label: "Menu Locations", to: "/menus/locations" },

      // ── Hidden — preset theme picker (intentionally not in nav) ───────────
      // /appearance/themes is a pre-built preset picker that's too restrictive
      // for our one-admin-many-sites model. The route file still exists for
      // historical reasons but is not surfaced. Header/Footer/Colors above
      // give per-section control without locking sites into a preset.
    ],
  },
  {
    id: "seo",
    label: "SEO",
    to: "/seo",
    icon: Search,
    capability: "seo.update_global",
    children: [
      { id: "seo-dashboard", label: "Dashboard", to: "/seo", exact: true },
      { id: "seo-settings", label: "Settings", to: "/seo/settings" },
      {
        id: "seo-sitemap",
        label: "Sitemap",
        to: "/seo/sitemap",
        capability: "seo.generate_sitemap",
      },
    ],
  },
  // Widgets section removed — widget infrastructure deprecated (AI handles frontend design)
  {
    ...PLUGINS_NAV_SECTION,
    separator: true,
  },
  {
    id: "settings",
    label: "Settings",
    to: "/settings",
    icon: Settings,
    capability: "manage_settings",
    children: [
      {
        id: "settings-overview",
        label: "Overview",
        to: "/settings",
        exact: true,
        capability: "manage_options",
      },
      {
        id: "settings-general",
        label: "General",
        to: "/settings/general",
        capability: "settings.update_general",
      },
      {
        id: "settings-reading",
        label: "Reading",
        to: "/settings/reading",
        capability: "settings.update_reading",
      },
      {
        id: "settings-writing",
        label: "Writing",
        to: "/settings/writing",
        capability: "settings.update_writing",
      },
      {
        id: "settings-discussion",
        label: "Discussion",
        to: "/settings/discussion",
        capability: "settings.update_discussion",
      },
      {
        id: "settings-notifications",
        label: "Notifications",
        to: "/settings/notifications",
        capability: "notification.update_preferences",
      },
      {
        id: "settings-permalinks",
        label: "Permalinks",
        to: "/settings/permalinks",
        capability: "settings.update_permalinks",
      },
      {
        id: "settings-privacy",
        label: "Privacy",
        to: "/settings/privacy",
        capability: "settings.update_privacy",
      },
      {
        id: "settings-email",
        label: "Email",
        to: "/settings/email",
        icon: Mail,
        capability: "settings.update_email",
      },
      {
        id: "settings-media",
        label: "Media",
        to: "/settings/media",
        icon: Image,
        capability: "manage_options",
      },
      {
        id: "settings-search",
        label: "Search",
        to: "/settings/search",
        icon: Search,
        capability: "search.query",
      },
      {
        id: "settings-analytics",
        label: "Analytics",
        to: "/settings/analytics",
        icon: BarChart3,
        capability: "manage_options",
      },
      {
        id: "settings-ai",
        label: "AI Providers",
        to: "/settings/ai",
        icon: Brain,
        capability: "manage_options",
      },
      {
        id: "settings-integrations",
        label: "Integrations",
        to: "/settings/integrations",
        icon: Puzzle,
        capability: "manage_options",
      },
      {
        id: "settings-tools",
        label: "Import / Export",
        to: "/settings/tools",
        icon: Wrench,
        capability: "manage_options",
      },
    ],
  },
  {
    id: "tools",
    label: "Tools",
    to: "/tools",
    icon: Wrench,
    capability: "manage_options",
    separator: true,
    children: [
      {
        id: "tools-website-import",
        label: "Website Import",
        to: "/tools/website-import",
        icon: RefreshCcw,
        capability: "manage_options",
      },
      {
        id: "tools-wordpress-sync",
        label: "WordPress Sync",
        to: "/tools/wordpress-sync",
        capability: "manage_options",
      },
      { id: "tools-activity", label: "Activity Log", to: "/tools/activity" },
      { id: "tools-404-log", label: "404 Log", to: "/tools/404-log" },
      { id: "tools-audit-log", label: "Audit Log", to: "/tools/audit-log" },
      { id: "tools-roles", label: "Roles", to: "/tools/roles" },
      {
        id: "tools-capabilities",
        label: "Capabilities",
        to: "/tools/capabilities",
      },
      { id: "tools-events", label: "Events", to: "/tools/events" },
      { id: "tools-routes", label: "Routes", to: "/tools/routes" },
      {
        id: "tools-email",
        label: "Email Notifications",
        to: "/tools/email-notifications",
      },
      {
        id: "tools-site-notif",
        label: "Site Notifications",
        to: "/tools/site-notifications",
      },
      {
        id: "tools-redirects",
        label: "Redirects",
        to: "/tools/redirects",
        capability: "routing.create_redirect",
      },
      {
        id: "tools-api-keys",
        label: "API Keys",
        to: "/api-keys",
        capability: "api.create_key",
      },
      {
        id: "tools-webhooks",
        label: "Webhooks",
        to: "/webhooks",
        capability: "api.create_webhook",
      },
      {
        id: "tools-updates",
        label: "Updates",
        to: "/updates",
        icon: ArrowUpCircle,
        capability: "manage_options",
      },
    ],
  },
];

// ─── Extension v2 nav scanner ────────────────────────────────────────────────

interface NavModule {
  default: AdminNavSection;
}

const officialNavModules = import.meta.glob<NavModule>(
  "../../extensions/*/nav.ts",
  { eager: true },
);
const localNavModules = import.meta.glob<NavModule>(
  "../../extensions.local/*/nav.ts",
  { eager: true },
);

function navSectionsFromModules(
  modules: Record<string, NavModule>,
): AdminNavSection[] {
  return Object.values(modules)
    .map((mod) => mod.default)
    .filter((section): section is AdminNavSection => Boolean(section));
}

const EXTENSION_NAV_SECTIONS: AdminNavSection[] = [
  ...navSectionsFromModules(officialNavModules),
  ...navSectionsFromModules(localNavModules),
];

/**
 * The merged sidebar configuration. Consumers should refer to this
 * exported array; they cannot tell platform sections from extension
 * sections. The order is: platform sections in their hand-edited order,
 * then official extensions, then local extensions, all appended.
 */
export const ADMIN_NAV_SECTIONS: AdminNavSection[] = [
  ...PLATFORM_NAV_SECTIONS,
  ...EXTENSION_NAV_SECTIONS,
];
