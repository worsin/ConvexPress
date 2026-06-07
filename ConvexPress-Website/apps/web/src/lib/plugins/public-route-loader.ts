import { convexQuery } from "@convex-dev/react-query";
import { notFound } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { api } from "@convexpress-website/backend/generated/api";

import {
  isPublicPluginEnabled,
  type PublicPluginId,
} from "@/lib/plugins/public";

export async function requirePublicPluginEnabled(
  queryClient: QueryClient,
  pluginId: PublicPluginId,
) {
  const settings = await queryClient.ensureQueryData(
    convexQuery(api.settings.queries.getPublic, {}),
  );

  if (!isPublicPluginEnabled(pluginId, settings)) {
    throwPublicNotFound({ pluginId, reason: "plugin_disabled" });
  }

  return settings;
}

export function throwPublicNotFound(data?: unknown): never {
  throw notFound({
    data,
    headers: {
      "X-Robots-Tag": "noindex",
    },
  });
}
