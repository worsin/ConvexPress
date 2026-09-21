import { defineExtension } from "../sdk/define";
export default defineExtension({
  "id": "tickets",
  "title": "Support",
  "settingsKey": "ticketsEnabled",
  "defaultEnabled": false,
  "routePrefixes": [
    "/support"
  ],
  "chromeParts": [
    "support.widget"
  ]
});
