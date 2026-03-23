/**
 * Widget System Actions
 *
 * Server actions for widget functionality.
 */

import { action } from "../_generated/server";
import { v } from "convex/values";

/**
 * Fetch RSS feed content for RSS widget.
 * Returns empty items until RSS fetching is implemented.
 */
export const fetchRssFeed = action({
  args: {
    feedUrl: v.string(),
    maxItems: v.optional(v.number()),
  },
  handler: async (_ctx, _args) => {
    // Return empty items until RSS fetching is implemented
    return {
      title: "",
      description: "",
      items: [],
    };
  },
});
