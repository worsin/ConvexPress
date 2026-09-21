import { defineExtension } from "../sdk/define";
export default defineExtension({
  "id": "commerceBundles",
  "title": "Bundles",
  "settingsKey": "commerceBundlesEnabled",
  "defaultEnabled": false,
  "routePrefixes": [
    "/bundles"
  ],
  "parentId": "commerce"
});
