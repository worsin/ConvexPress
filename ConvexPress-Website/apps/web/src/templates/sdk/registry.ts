/**
 * Pack registry: discovers every template pack in `templates/packs/*` at
 * build time (same pattern as blocks) and resolves which component renders
 * a surface for the active template.
 *
 * Resolution order (WordPress-style hierarchy):
 *   per-surface override → active pack → `core` → the route's own fallback.
 */

import { lazy } from "react";
import type { SurfaceComponent, TemplateConfig, TemplateManifest, TemplatePack } from "./types";

const manifestModules = import.meta.glob("../packs/*/template.json", { eager: true, import: "default" }) as Record<string, TemplateManifest>;
// Stable lazy components preserve SSR/Suspense hydration while loading only
// surfaces that the selected pack actually renders. Metadata discovery stays sync.
const surfaceModules = import.meta.glob<SurfaceComponent<any>>("../packs/*/surfaces/*.tsx", { import: "default" });
const surfaceLoaders = new Map<string, () => Promise<SurfaceComponent<any>>>();

function packIdFromPath(path: string): string {
  const match = path.match(/\/packs\/([^/]+)\//);
  return match ? match[1] : "";
}

function surfaceIdFromPath(path: string): string {
  const match = path.match(/\/surfaces\/([^/]+)\.tsx$/);
  return match ? match[1] : "";
}

function buildRegistry(): Map<string, TemplatePack> {
  const packs = new Map<string, TemplatePack>();
  for (const [path, manifest] of Object.entries(manifestModules)) {
    const id = packIdFromPath(path);
    if (!id || !manifest || manifest.id !== id) continue;
    packs.set(id, { manifest, surfaces: {} });
  }
  for (const [path, load] of Object.entries(surfaceModules)) {
    const pack = packs.get(packIdFromPath(path));
    const surfaceId = surfaceIdFromPath(path);
    if (pack && surfaceId) {
      surfaceLoaders.set(`${pack.manifest.id}/${surfaceId}`, load);
      pack.surfaces[surfaceId] = lazy(async () => ({ default: await load() }));
    }
  }
  return packs;
}

export const TEMPLATE_PACKS: Map<string, TemplatePack> = buildRegistry();

/**
 * Run once before hydrateRoot. Only the surfaces in the server document need
 * synchronous components on the first client render. Otherwise an early live
 * query/context update can discard a still-dehydrated lazy boundary, removing
 * the user's pointer target. Other packs/routes remain lazy.
 * DOM attributes select only build-discovered modules, never import URLs.
 */
export async function prepareTemplateHydration(root: ParentNode): Promise<void> {
  const selected = new Map<string, { packId: string; surfaceId: string }>();
  for (const element of root.querySelectorAll("[data-surface][data-template]")) {
    const packId = element.getAttribute("data-template")!;
    const surfaceId = element.getAttribute("data-surface")!;
    const key = `${packId}/${surfaceId}`;
    if (surfaceLoaders.has(key)) selected.set(key, { packId, surfaceId });
  }
  await Promise.all([...selected].map(async ([key, { packId, surfaceId }]) => {
    const component = await surfaceLoaders.get(key)!();
    TEMPLATE_PACKS.get(packId)!.surfaces[surfaceId] = component;
  }));
}

export const DEFAULT_TEMPLATE_CONFIG: TemplateConfig = { active: "core", overrides: {}, variants: {}, settings: {} };

export function listTemplatePacks(): TemplatePack[] {
  return [...TEMPLATE_PACKS.values()];
}

export function getTemplatePack(id: string): TemplatePack | undefined {
  return TEMPLATE_PACKS.get(id);
}

/** Which pack actually renders `surfaceId` under `config`, and the component if any. */
export function resolveSurface(surfaceId: string, config: TemplateConfig): { packId: string; component: SurfaceComponent<any> | null } {
  const candidates = [config.overrides[surfaceId], config.active, "core"].filter((id): id is string => Boolean(id));
  for (const packId of candidates) {
    const component = TEMPLATE_PACKS.get(packId)?.surfaces[surfaceId];
    if (component) return { packId, component };
  }
  return { packId: "core", component: null };
}

/** The site's explicit variant choice for a surface, if the pack offers it; packs apply their own default otherwise. */
export function resolveVariant(surfaceId: string, config: TemplateConfig, packId: string): string | undefined {
  const chosen = config.variants[surfaceId];
  const offered = TEMPLATE_PACKS.get(packId)?.manifest.variants?.[surfaceId];
  return chosen && (!offered || offered.includes(chosen)) ? chosen : undefined;
}
