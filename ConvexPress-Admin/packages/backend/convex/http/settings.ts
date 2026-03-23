/**
 * Settings API Endpoints
 *
 * GET /api/v1/settings - Read settings (read:settings)
 *
 * Returns public site settings. Uses the getPublic query which
 * returns settings safe for external consumption (no secrets).
 */

import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  authenticateApiRequest,
  errorResponse,
  jsonResponse,
} from "./helpers";

export const settingsReadHandler = httpAction(async (ctx, request) => {
  const auth = await authenticateApiRequest(ctx, request, "read:settings");
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const section = url.searchParams.get("section") || undefined;

  try {
    if (section) {
      // Get settings for a specific section
      const settings = await ctx.runQuery(internal.settings.httpInternals.getBySectionInternal, {
        section,
      });
      return jsonResponse(settings);
    } else {
      // Get all public settings
      const settings = await ctx.runQuery(internal.settings.httpInternals.getPublicInternal, {});
      return jsonResponse(settings);
    }
  } catch (error: unknown) {
    return errorResponse(
      error?.data?.message ?? "Failed to read settings",
      error?.data?.code ?? "INTERNAL_ERROR",
      500,
    );
  }
});
