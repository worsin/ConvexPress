import { HEADER_DEFAULTS, FOOTER_DEFAULTS } from "./chromeDefinitions";
import type { HeaderConfig, FooterConfig } from "@/lib/layout/types";
import { useTemplateSettings } from "./useTemplateSettings";

/** Per-pack builder values already contain SDK defaults and the local draft. */
export function useTemplateHeaderConfig(): HeaderConfig {
  const { values, get } = useTemplateSettings();
  const header = values.header ?? HEADER_DEFAULTS;
  for (const key of Object.keys(header)) get("header", key);
  return header as unknown as HeaderConfig;
}
export function useTemplateFooterConfig(): FooterConfig {
  const { values, get } = useTemplateSettings();
  const footer = values.footer ?? FOOTER_DEFAULTS;
  for (const key of Object.keys(footer)) get("footer", key);
  return footer as unknown as FooterConfig;
}
