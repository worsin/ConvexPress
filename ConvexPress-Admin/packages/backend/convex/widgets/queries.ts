/**
 * Widget System Queries
 *
 * Provides widget data for the public website.
 * Returns empty arrays until full widget management is implemented.
 */

import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get widgets for a specific widget area.
 * Returns an empty array until widget management is implemented.
 */
export const getAreaWidgets = query({
  args: {
    areaSlug: v.string(),
  },
  handler: async (_ctx, _args) => {
    // Return empty array until widget management is implemented
    return [];
  },
});

/**
 * Get widget area configuration by slug.
 * Returns null until widget areas are implemented.
 */
export const getWidgetArea = query({
  args: {
    slug: v.string(),
  },
  handler: async (_ctx, _args) => {
    // Return null until widget areas are implemented
    return null;
  },
});
