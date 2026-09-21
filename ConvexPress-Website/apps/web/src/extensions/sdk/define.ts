import { SURFACE_CATALOG } from "../../templates/sdk/catalog";
import type { WebsiteExtensionManifest } from "./types";

/** Existing platform extensions describe their catalog-owned surfaces without copying them. */
export function defineExtension(input: Omit<WebsiteExtensionManifest, "surfaces" | "parts" | "dashboardNav" | "chromeParts"> & Partial<Pick<WebsiteExtensionManifest, "surfaces" | "parts" | "dashboardNav" | "chromeParts">>): WebsiteExtensionManifest {
  const ids = new Set([input.id, ...input.aliases ?? []]);
  const surfaces = input.surfaces ?? SURFACE_CATALOG.filter(surface => input.id === "dashboard" ? surface.id.startsWith("dashboard.") : !!surface.plugin && ids.has(surface.plugin)).map(surface => ({ id: surface.id, title: surface.title, area: surface.area, viewModel: `${surface.id}Data`, ...(surface.plugin ? { gate: surface.plugin } : {}) }));
  return { ...input, surfaces, parts: input.parts ?? [], chromeParts: input.chromeParts ?? [], dashboardNav: input.dashboardNav ?? surfaces.filter(surface => surface.id.startsWith("dashboard.") && surface.id !== "dashboard.shell").map(surface => ({ pageId: surface.id.slice("dashboard.".length) })) };
}
