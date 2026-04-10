import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { NotFoundPage } from "@/components/blog/NotFoundPage";

type PublicPluginId =
  | "commerce"
  | "commerceDigital"
  | "commerceSubscriptions"
  | "commerceWishlists"
  | "commerceReturns"
  | "kb"
  | "tickets"
  | "recipes"
  | "gallery"
  | "membership";

interface PublicPluginGateProps {
  pluginId: PublicPluginId;
  children: ReactNode;
}

function isPluginEnabled(
  pluginId: PublicPluginId,
  settings: {
    plugins?: {
      commerceEnabled?: boolean;
      commerceDigitalEnabled?: boolean;
      commerceSubscriptionsEnabled?: boolean;
      commerceWishlistsEnabled?: boolean;
      commerceReturnsEnabled?: boolean;
      kbEnabled?: boolean;
      ticketsEnabled?: boolean;
      recipesEnabled?: boolean;
      galleryEnabled?: boolean;
      membershipEnabled?: boolean;
    };
  } | null | undefined,
) {
  if (!settings) return false;

  switch (pluginId) {
    case "commerce":
      return settings.plugins?.commerceEnabled !== false;
    case "commerceDigital":
      return settings.plugins?.commerceDigitalEnabled !== false;
    case "commerceSubscriptions":
      return settings.plugins?.commerceSubscriptionsEnabled !== false;
    case "commerceWishlists":
      return settings.plugins?.commerceWishlistsEnabled !== false;
    case "commerceReturns":
      return settings.plugins?.commerceReturnsEnabled !== false;
    case "kb":
      return settings.plugins?.kbEnabled !== false;
    case "tickets":
      return settings.plugins?.ticketsEnabled !== false;
    case "recipes":
      return settings.plugins?.recipesEnabled !== false;
    case "gallery":
      return settings.plugins?.galleryEnabled !== false;
    case "membership":
      return settings.plugins?.membershipEnabled !== false;
    default:
      return false;
  }
}

export function PublicPluginGate({
  pluginId,
  children,
}: PublicPluginGateProps) {
  const settings = useQuery(api.settings.queries.getPublic);

  if (!settings) return null;
  if (!isPluginEnabled(pluginId, settings)) {
    return <NotFoundPage />;
  }

  return <>{children}</>;
}
