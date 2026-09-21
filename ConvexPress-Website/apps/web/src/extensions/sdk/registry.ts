import type { WebsiteExtensionManifest } from "./types";
import { INSTALLED_MANIFESTS } from "./manifests.generated";
import { buildExtensionRegistry } from "./registry-core";
const modules = (() => {
  try { return {
  ...import.meta.glob<WebsiteExtensionManifest>("../*/manifest.ts", { eager: true, import: "default" }),
  ...import.meta.glob<WebsiteExtensionManifest>("../../extensions.local/*/manifest.ts", { eager: true, import: "default" }),
  }; } catch (error) {
    if (typeof import.meta.glob === "function") throw error;
    return {}; // Bun/Node tooling uses the generated index; Vite statically expands the calls above.
  }
})();
export const WEBSITE_EXTENSIONS = buildExtensionRegistry(Object.keys(modules).length ? Object.values(modules) : INSTALLED_MANIFESTS);
export function extensionForRoute(pathname: string): WebsiteExtensionManifest | undefined {
  return [...new Set(WEBSITE_EXTENSIONS.values())].filter(manifest => manifest.routePrefixes.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))).sort((a,b) => Math.max(...b.routePrefixes.map(p=>p.length)) - Math.max(...a.routePrefixes.map(p=>p.length)))[0];
}
