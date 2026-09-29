import { defineExtension } from "../sdk/define";
export default defineExtension({
  "id": "tickets",
  "title": "Support",
  "settingsKey": "ticketsEnabled",
  "defaultEnabled": true,
  "routePrefixes": [
    "/support"
  ],
  "chromeParts": [
    "support.widget"
  ]
});
