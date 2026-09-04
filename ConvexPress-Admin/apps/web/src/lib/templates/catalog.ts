/**
 * Surface catalog — every customer-facing screen or region a template pack
 * can implement, grouped into the coverage areas the admin shows.
 *
 * MIRROR of ConvexPress-Website/apps/web/src/templates/sdk/catalog.ts — the
 * Website owns the ids; the Website's `check:templates` verifies this copy agrees.
 * Plan: specs/research/TEMPLATE-SYSTEM-PLAN-2026-09-04.md §3.
 */

import type { AdminPluginId } from "@/lib/plugins/registry";

export interface CoverageArea {
  id: string;
  title: string;
  /** Plugin that must be enabled for the area to count toward coverage. */
  plugin?: AdminPluginId;
}

export const COVERAGE_AREAS: CoverageArea[] = [
  { id: "chrome", title: "Chrome & system" },
  { id: "pages", title: "Pages" },
  { id: "blog", title: "Blog" },
  { id: "search", title: "Search" },
  { id: "shop", title: "Shop", plugin: "commerce" },
  { id: "cart", title: "Cart & checkout", plugin: "commerce" },
  { id: "bundles", title: "Bundles", plugin: "commerceBundles" },
  { id: "wishlist", title: "Wishlist & sharing", plugin: "commerceWishlists" },
  { id: "subscriptions", title: "Subscriptions & pricing", plugin: "commerceSubscriptions" },
  { id: "courses", title: "Courses & certificates", plugin: "lms" },
  { id: "help", title: "Help center", plugin: "knowledgeBase" },
  { id: "support", title: "Support", plugin: "tickets" },
  { id: "gallery", title: "Gallery", plugin: "gallery" },
  { id: "recipes", title: "Recipes", plugin: "recipes" },
  { id: "forms", title: "Forms", plugin: "forms" },
  { id: "dashboard", title: "Account dashboard" },
  { id: "auth", title: "Sign in & sign up" },
];

export interface SurfaceDefinition {
  id: string;
  title: string;
  area: string;
  /** Sub-plugin gate when narrower than the area's plugin. */
  plugin?: AdminPluginId;
  /** Variant ids this surface may offer; packs may add their own. */
  variants?: string[];
}

const S = (id: string, title: string, area: string, extra: Partial<SurfaceDefinition> = {}): SurfaceDefinition => ({ id, title, area, ...extra });

export const SURFACE_CATALOG: SurfaceDefinition[] = [
  // Chrome & system
  S("chrome.header", "Header", "chrome"),
  S("chrome.mobileNav", "Mobile navigation", "chrome"),
  S("chrome.footer", "Footer", "chrome"),
  S("chrome.searchOverlay", "Search overlay", "chrome"),
  S("chrome.cartDrawer", "Cart drawer", "chrome", { plugin: "commerce" }),
  S("system.notFound", "Not found", "chrome"),
  S("system.error", "Error", "chrome"),
  S("system.restricted", "Restricted content", "chrome"),
  S("system.passwordGate", "Password gate", "chrome"),
  // Pages
  S("home", "Home", "pages"),
  S("page", "Page", "pages", { variants: ["default", "sidebar-left", "full-width", "no-sidebar", "landing", "blank"] }),
  // Blog
  S("blog.index", "Blog index", "blog"),
  S("blog.post", "Post", "blog"),
  S("blog.archive", "Date archive", "blog"),
  S("blog.author", "Author archive", "blog"),
  S("blog.category", "Category archive", "blog"),
  S("blog.tag", "Tag archive", "blog"),
  // Search
  S("search", "Search results", "search"),
  // Shop
  S("shop.catalog", "Catalog & search", "shop", { variants: ["boutique", "marketplace"] }),
  S("shop.product", "Product page", "shop", { variants: ["classic", "marketplace", "split", "showcase", "minimal"] }),
  S("shop.categories", "Category directory", "shop"),
  S("shop.category", "Category archive", "shop"),
  // Cart & checkout
  S("cart", "Cart", "cart"),
  S("cart.shared", "Shared cart", "cart"),
  S("checkout.details", "Checkout: details", "cart"),
  S("checkout.shipping", "Checkout: shipping", "cart"),
  S("checkout.payment", "Checkout: payment", "cart"),
  S("checkout.review", "Checkout: review", "cart"),
  S("checkout.confirmation", "Order confirmation", "cart"),
  S("order.track", "Order tracking", "cart"),
  // Bundles / wishlist / subscriptions
  S("bundles.index", "Bundles", "bundles"),
  S("bundles.detail", "Bundle", "bundles"),
  S("wishlist.shared", "Shared wishlist", "wishlist"),
  S("pricing", "Pricing", "subscriptions"),
  S("signup.offer", "Offer signup", "subscriptions"),
  // Courses
  S("courses.index", "Course catalog", "courses"),
  S("courses.detail", "Course", "courses"),
  S("courses.lessonPreview", "Lesson preview", "courses"),
  S("certificates.verify", "Verify certificate", "courses"),
  S("certificates.view", "Certificate", "courses"),
  // Help center
  S("help.home", "Help home", "help"),
  S("help.search", "Help search", "help"),
  S("help.category", "Help category", "help"),
  S("help.article", "Help article", "help"),
  S("help.collection", "Help collection", "help"),
  // Support
  S("support.home", "Support home", "support"),
  S("support.new", "New ticket", "support"),
  S("support.tickets", "My tickets", "support"),
  S("support.ticket", "Ticket", "support"),
  // Gallery / recipes / forms
  S("gallery.index", "Albums", "gallery"),
  S("gallery.album", "Album", "gallery"),
  S("gallery.category", "Gallery category", "gallery"),
  S("recipes.index", "Recipes", "recipes"),
  S("recipes.detail", "Recipe", "recipes"),
  S("recipes.category", "Recipe category", "recipes"),
  S("forms.form", "Form", "forms"),
  S("forms.resume", "Resume form", "forms"),
  // Dashboard
  S("dashboard.shell", "Dashboard shell", "dashboard"),
  S("dashboard.home", "Overview", "dashboard"),
  S("dashboard.profile", "Profile", "dashboard"),
  S("dashboard.settings", "Settings", "dashboard"),
  S("dashboard.security", "Security", "dashboard"),
  S("dashboard.notifications", "Notifications", "dashboard"),
  S("dashboard.comments", "Comments", "dashboard"),
  S("dashboard.posts", "Posts", "dashboard"),
  S("dashboard.courses", "Courses", "dashboard", { plugin: "lms" }),
  S("dashboard.lesson", "Lesson player", "dashboard", { plugin: "lms" }),
  S("dashboard.orders", "Orders", "dashboard", { plugin: "commerce" }),
  S("dashboard.order", "Order", "dashboard", { plugin: "commerce" }),
  S("dashboard.orderReturn", "Start a return", "dashboard", { plugin: "commerceReturns" }),
  S("dashboard.returns", "Returns", "dashboard", { plugin: "commerceReturns" }),
  S("dashboard.return", "Return", "dashboard", { plugin: "commerceReturns" }),
  S("dashboard.subscriptions", "Subscriptions", "dashboard", { plugin: "commerceSubscriptions" }),
  S("dashboard.subscription", "Subscription", "dashboard", { plugin: "commerceSubscriptions" }),
  S("dashboard.downloads", "Downloads", "dashboard", { plugin: "commerceDigital" }),
  S("dashboard.reviews", "Reviews", "dashboard", { plugin: "commerceReviews" }),
  S("dashboard.wishlist", "Wishlist", "dashboard", { plugin: "commerceWishlists" }),
  S("dashboard.addresses", "Addresses", "dashboard", { plugin: "commerce" }),
  S("dashboard.membership", "Membership", "dashboard", { plugin: "membership" }),
  // Auth
  S("auth.shell", "Auth frame", "auth"),
  S("auth.login", "Sign in", "auth"),
  S("auth.register", "Sign up", "auth"),
  S("auth.logout", "Sign out", "auth"),
  S("auth.forgot", "Forgot password", "auth"),
  S("auth.reset", "Reset password", "auth"),
  S("auth.verify", "Verify email", "auth"),
];

export const SURFACE_IDS = SURFACE_CATALOG.map((surface) => surface.id);
export type SurfaceId = (typeof SURFACE_IDS)[number];

export function surfaceById(id: string): SurfaceDefinition | undefined {
  return SURFACE_CATALOG.find((surface) => surface.id === id);
}
