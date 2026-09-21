import { defineExtension } from "../sdk/define";
export default defineExtension({
  "id": "recipes",
  "title": "Recipes",
  "settingsKey": "recipesEnabled",
  "defaultEnabled": false,
  "routePrefixes": [
    "/recipes"
  ]
});
