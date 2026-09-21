import { defineExtension } from "../sdk/define";
export default defineExtension({
  "id": "commerceWishlists",
  "title": "Wishlists",
  "settingsKey": "commerceWishlistsEnabled",
  "defaultEnabled": false,
  "routePrefixes": [
    "/wishlist"
  ],
  "parentId": "commerce"
});
