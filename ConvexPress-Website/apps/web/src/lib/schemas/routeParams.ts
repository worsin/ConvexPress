/**
 * Route Parameter Validation Schemas
 *
 * Zod schemas for validating dynamic route parameters before they reach
 * Convex queries. Prevents injection of unexpected characters.
 */

import { z } from "zod";

/** A URL-safe slug: lowercase alphanumeric, hyphens, max 200 chars */
const slugPattern = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

export const slugParamsSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(slugPattern, "Invalid slug format"),
});

/** Numeric archive ID param */
export const archiveIdParamsSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9_-]+$/i, "Invalid archive ID"),
});

/** Year/month/day route params for blog date routes */
export const dateSlugParamsSchema = z.object({
  year: z.string().regex(/^\d{4}$/, "Invalid year"),
  month: z.string().regex(/^\d{1,2}$/, "Invalid month"),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(slugPattern, "Invalid slug format"),
});

export const dateDaySlugParamsSchema = z.object({
  year: z.string().regex(/^\d{4}$/, "Invalid year"),
  month: z.string().regex(/^\d{1,2}$/, "Invalid month"),
  day: z.string().regex(/^\d{1,2}$/, "Invalid day"),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(slugPattern, "Invalid slug format"),
});
