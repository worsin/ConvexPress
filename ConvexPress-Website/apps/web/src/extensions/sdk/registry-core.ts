import type { WebsiteExtensionManifest } from "./types";
export function buildExtensionRegistry(manifests: WebsiteExtensionManifest[]): ReadonlyMap<string, WebsiteExtensionManifest> {
  const registry = new Map<string, WebsiteExtensionManifest>();
  for (const manifest of manifests) {
    if (!/^[a-z][a-zA-Z0-9-]*$/.test(manifest.id) || !/^[a-z][a-zA-Z0-9]*Enabled$/.test(manifest.settingsKey)) throw new Error(`Invalid extension identity: ${manifest.id}`);
    for (const id of [manifest.id, ...manifest.aliases ?? []]) {
      if (registry.has(id)) throw new Error(`Duplicate extension identity: ${id}`);
      registry.set(id, manifest);
    }
  }
  return registry;
}
export function extensionEnabled(registry: ReadonlyMap<string, WebsiteExtensionManifest>, id: string, values: Record<string, boolean | undefined>, seen = new Set<string>()): boolean {
  const manifest = registry.get(id);
  if (!manifest || seen.has(manifest.id)) return false;
  seen.add(manifest.id);
  const canonical = values[manifest.settingsKey];
  const stored = typeof canonical === "boolean" ? canonical : (manifest.legacySettingsKeys ?? []).map(key => values[key]).find(value => typeof value === "boolean");
  if (!(stored ?? manifest.defaultEnabled ?? false)) return false;
  return !manifest.parentId || extensionEnabled(registry, manifest.parentId, values, seen);
}
