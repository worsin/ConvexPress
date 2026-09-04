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
  getHttpErrorCode,
  getHttpErrorMessage,
  jsonResponse,
} from "./helpers";
import { redactSettingSecrets } from "../helpers/settingsSecret";
import { isValidSection } from "../settings/defaults";

export const settingsReadHandler = httpAction(async (ctx, request) => {
  const auth = await authenticateApiRequest(ctx, request, "read:settings");
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const section = url.searchParams.get("section") || undefined;

  try {
    if (section) {
      if (!isValidSection(section)) {
        return errorResponse(`Unknown settings section: ${section}`, "VALIDATION_ERROR", 400);
      }
      // Section reads are redacted: API keys may see configuration, never
      // stored credentials (they come back as the "__set__" sentinel).
      const settings = await ctx.runQuery(internal.settings.httpInternals.getBySectionInternal, {
        section,
      });
      return jsonResponse(redactSettingSecrets(settings as Record<string, unknown>));
    } else {
      // Get all public settings
      const settings = await ctx.runQuery(internal.settings.httpInternals.getPublicInternal, {});
      return jsonResponse(settings);
    }
  } catch (error: unknown) {
    return errorResponse(
      getHttpErrorMessage(error, "Failed to read settings"),
      getHttpErrorCode(error, "INTERNAL_ERROR"),
      500,
    );
  }
});
