import { defineExtension } from "../sdk/define";
export default defineExtension({
  "id": "dashboard",
  "title": "Customer Dashboard",
  "settingsKey": "dashboardEnabled",
  "defaultEnabled": true,
  "routePrefixes": [
    "/dashboard"
  ]
});
