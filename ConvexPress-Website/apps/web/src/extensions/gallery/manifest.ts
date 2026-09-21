import { defineExtension } from "../sdk/define";
export default defineExtension({
  "id": "gallery",
  "title": "Gallery",
  "settingsKey": "galleryEnabled",
  "defaultEnabled": false,
  "routePrefixes": [
    "/gallery"
  ]
});
