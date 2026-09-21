import { defineExtension } from "../sdk/define";
export default defineExtension({
  "id": "commerceSubscriptions",
  "title": "Subscriptions",
  "settingsKey": "commerceSubscriptionsEnabled",
  "defaultEnabled": false,
  "routePrefixes": [
    "/subscriptions"
  ],
  "parentId": "commerce"
});
