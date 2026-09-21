import { WEBSITE_EXTENSIONS } from "../../extensions/sdk/registry";
import { extensionEnabled } from "../../extensions/sdk/registry-core";
export type PublicPluginId = string;
export type PublicPluginSettings = { plugins?: Record<string, boolean | undefined> } | null | undefined;
/** Enablement and dependency policy belongs to each installed Website manifest. */
export function isPublicPluginEnabled(pluginId: PublicPluginId, settings: PublicPluginSettings): boolean {
  return !!settings && extensionEnabled(WEBSITE_EXTENSIONS, pluginId, settings.plugins ?? {});
}
