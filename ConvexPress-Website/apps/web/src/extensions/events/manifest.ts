import { defineExtension } from "../sdk/define";
export default defineExtension({
  "id": "events",
  "title": "Events",
  "settingsKey": "eventsEnabled",
  "defaultEnabled": false,
  "routePrefixes": [
    "/events"
  ],
  "parts": [
    "events.card"
  ],
  "dashboardNav": [
    {
      "pageId": "events"
    }
  ]
});
