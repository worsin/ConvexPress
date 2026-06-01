import type { ReactNode } from "react";
import { useQuery } from "convex/react";
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

export function PublicPluginGate({
  pluginId,
  children,
  pendingFallback = null,
}: PublicPluginGateProps) {
  const settings = useQuery(api.settings.queries.getPublic);

  if (settings === undefined) return <>{pendingFallback}</>;
  if (!settings) return <NotFoundPage />;
  if (!isPublicPluginEnabled(pluginId, settings)) {
    return <NotFoundPage />;
  }

  return <>{children}</>;
}
