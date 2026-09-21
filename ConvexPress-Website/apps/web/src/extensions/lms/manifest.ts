import { defineExtension } from "../sdk/define";
export default defineExtension({
  "id": "lms",
  "title": "Courses",
  "settingsKey": "lmsEnabled",
  "defaultEnabled": true,
  "routePrefixes": [
    "/courses"
  ]
});
