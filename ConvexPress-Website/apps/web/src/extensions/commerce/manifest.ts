import { defineExtension } from "../sdk/define";
export default defineExtension({
  "id": "commerce",
  "title": "Commerce",
  "settingsKey": "commerceEnabled",
  "defaultEnabled": false,
  "routePrefixes": [
    "/products",
    "/cart",
    "/checkout"
  ],
  "chromeParts": [
    "chrome.cartDrawer"
  ]
});
