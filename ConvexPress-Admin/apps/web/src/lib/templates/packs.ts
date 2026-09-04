/**
 * Installed template packs as the admin knows them. Mirrors each pack's
 * `template.json` in the Website checkout (the admin cannot import Website
 * files). `check:templates` on the Website side compares the two.
 */

export interface TemplatePackSummary {
  id: string;
  name: string;
  version: string;
  tagline: string;
  description: string;
  author?: string;
  bestFor?: string[];
  /** Surface ids the pack implements itself; the rest fall back to Core. */
  surfaces: string[];
  variants?: Record<string, string[]>;
  modules?: string[];
}

export const TEMPLATE_PACKS: TemplatePackSummary[] = [
  {
    id: "core",
    name: "Core",
    version: "1.0.0",
    tagline: "The built-in front end, every area covered",
    description:
      "The storefront as shipped: centred content, configurable header and footer, the boutique and marketplace shop layouts, five product page layouts. Every surface is implemented, so it is the fallback for any surface another template leaves out.",
    author: "ConvexPress",
    bestFor: ["Any site as the safe default", "Sites that customise through the header, footer and colour settings"],
    surfaces: [
      "chrome.header",
      "chrome.mobileNav",
      "chrome.footer",
      "chrome.searchOverlay",
      "chrome.cartDrawer",
      "system.notFound",
      "system.error",
      "system.restricted",
      "system.passwordGate",
      "home",
      "page",
      "blog.index",
      "blog.post",
      "blog.archive",
      "blog.author",
      "blog.category",
      "blog.tag",
      "search",
      "shop.catalog",
      "shop.product",
      "shop.categories",
      "shop.category",
      "cart",
      "cart.shared",
      "checkout.details",
      "checkout.shipping",
      "checkout.payment",
      "checkout.review",
      "checkout.confirmation",
      "order.track",
      "bundles.index",
      "bundles.detail",
      "wishlist.shared",
      "pricing",
      "signup.offer",
      "courses.index",
      "courses.detail",
      "courses.lessonPreview",
      "certificates.verify",
      "certificates.view",
      "help.home",
      "help.search",
      "help.category",
      "help.article",
      "help.collection",
      "support.home",
      "support.new",
      "support.tickets",
      "support.ticket",
      "gallery.index",
      "gallery.album",
      "gallery.category",
      "recipes.index",
      "recipes.detail",
      "recipes.category",
      "forms.form",
      "forms.resume",
      "dashboard.shell",
      "dashboard.home",
      "dashboard.profile",
      "dashboard.settings",
      "dashboard.security",
      "dashboard.notifications",
      "dashboard.comments",
      "dashboard.posts",
      "dashboard.courses",
      "dashboard.lesson",
      "dashboard.orders",
      "dashboard.order",
      "dashboard.orderReturn",
      "dashboard.returns",
      "dashboard.return",
      "dashboard.subscriptions",
      "dashboard.subscription",
      "dashboard.downloads",
      "dashboard.reviews",
      "dashboard.wishlist",
      "dashboard.addresses",
      "dashboard.membership",
      "auth.shell",
      "auth.login",
      "auth.register",
      "auth.logout",
      "auth.forgot",
      "auth.reset",
      "auth.verify",
    ],
    variants: {
      page: ["default", "sidebar-left", "full-width", "no-sidebar", "landing", "blank"],
      "shop.catalog": ["boutique", "marketplace"],
      "shop.product": ["classic", "marketplace", "split", "showcase", "minimal"],
    },
    modules: ["colors", "typography", "layout", "header", "footer", "menuLayout", "shop", "pageTemplates"],
  },
];

export function getTemplatePack(id: string): TemplatePackSummary | undefined {
  return TEMPLATE_PACKS.find((pack) => pack.id === id);
}
