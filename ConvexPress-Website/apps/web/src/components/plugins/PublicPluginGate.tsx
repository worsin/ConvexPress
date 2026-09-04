import type { ReactNode } from "react";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convexpress-website/backend/generated/api";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import {
  isPublicPluginEnabled,
  type PublicPluginId,
} from "@/lib/plugins/public";

interface PublicPluginGateProps {
  pluginId: PublicPluginId;
  children: ReactNode;
  pendingFallback?: ReactNode;
}

/**
 * Hides a public route unless its plugin is enabled for this site.
 *
 * Reads settings through the TanStack query cache (the same cache route
 * loaders prefetch into), so the server and the hydrating client render the
 * same tree instead of the client flipping from "pending" to content.
 */
export function PublicPluginGate({
  pluginId,
  children,
  pendingFallback = null,
}: PublicPluginGateProps) {
  const { data: settings } = useTanStackQuery(
    convexQuery(api.settings.queries.getPublic, {}) as any,
  ) as { data: Record<string, unknown> | null | undefined };

  if (settings === undefined) return <>{pendingFallback}</>;
  if (!settings) return <NotFoundPage />;
  if (!isPublicPluginEnabled(pluginId, settings as any)) {
    return <NotFoundPage />;
  }

  return <>{children}</>;
}
