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
}

export function PublicPluginGate({
  pluginId,
  children,
}: PublicPluginGateProps) {
  const settings = useQuery(api.settings.queries.getPublic);

  if (!settings) return null;
  if (!isPublicPluginEnabled(pluginId, settings)) {
    return <NotFoundPage />;
  }

  return <>{children}</>;
}
