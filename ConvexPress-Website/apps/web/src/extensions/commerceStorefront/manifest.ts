import { defineExtension } from "../sdk/define";
/**
 * The shop under Commerce: product pages, catalog, cart and checkout, and
 * order tracking. On wherever Commerce is, unless a site sells only
 * subscriptions and turns it off; then the header shows no cart and site
 * search stays site search.
 */
export default defineExtension({
  "id": "commerceStorefront",
  "title": "Storefront",
  "settingsKey": "commerceStorefrontEnabled",
  "defaultEnabled": true,
  "routePrefixes": [
    "/products",
    "/categories",
    "/brands",
    "/cart",
    "/checkout",
    "/track"
  ],
  "chromeParts": [
    "chrome.cartDrawer"
  ],
  "parentId": "commerce"
});
