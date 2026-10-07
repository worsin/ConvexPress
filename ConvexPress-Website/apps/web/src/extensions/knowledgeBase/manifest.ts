import { defineExtension } from "../sdk/define";
export default defineExtension({
  "id": "knowledgeBase",
  "title": "Knowledge base",
  "settingsKey": "knowledgeBaseEnabled",
  "defaultEnabled": true,
  "routePrefixes": [
    "/help"
  ],
  "aliases": [
    "kb"
  ],
  "legacySettingsKeys": [
    "kbEnabled"
  ]
});
