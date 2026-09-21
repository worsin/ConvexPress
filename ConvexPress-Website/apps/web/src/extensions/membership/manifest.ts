import { defineExtension } from "../sdk/define";
export default defineExtension({
  "id": "membership",
  "title": "Membership",
  "settingsKey": "membershipEnabled",
  "defaultEnabled": false,
  "routePrefixes": [
    "/membership"
  ]
});
