import { defineExtension } from "../sdk/define";
/** Commerce: orders, customers and payments. The shop itself is the Storefront sub-extension. */
export default defineExtension({
  "id": "commerce",
  "title": "Commerce",
  "settingsKey": "commerceEnabled",
  "defaultEnabled": false,
  "routePrefixes": []
});
