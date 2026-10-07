import type { HeaderConfig } from "@/lib/layout/types";
import { useMenuForLocation } from "./useMenuForLocation";

/** Site chrome uses the same selection on public and compact account pages. */
export function useHeaderMenu(navigation: HeaderConfig["navigation"]) {
  const location = navigation.menuSource === "secondary"
    ? "secondary"
    : navigation.menuSource === "custom"
      ? navigation.customLocation?.trim() || "header"
      : "header";
  return useMenuForLocation(location);
}
