import type { ReactNode } from "react";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { api } from "@convexpress-website/backend/generated/api";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import {
  isPublicPluginEnabled,
  type PublicPluginId,
  type PublicPluginSettings,
} from "@/lib/plugins/public";

interface PublicPluginGateProps {
  pluginId: PublicPluginId;
  children: ReactNode;
}

export function PublicPluginGate({
  pluginId,
  children,
}: PublicPluginGateProps) {
  const { data } = useSuspenseQuery(
    convexQuery(api.settings.queries.getPublic, {}) as any,
  );
  const settings = data as PublicPluginSettings;

  if (!isPublicPluginEnabled(pluginId, settings)) {
    return <NotFoundPage />;
  }

  return <>{children}</>;
}
