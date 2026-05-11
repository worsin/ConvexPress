import { DEFAULT_LAYOUT_CONFIG } from "@/lib/layout/constants";
import type { LayoutConfig } from "@/lib/layout/types";

/**
 * Returns layout configuration.
 * Currently returns sensible defaults.
 * Can be extended to pull from the settings system in the future.
 */
export function useLayoutConfig(): LayoutConfig {
  return DEFAULT_LAYOUT_CONFIG;
}
