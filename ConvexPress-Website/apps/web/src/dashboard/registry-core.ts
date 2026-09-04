/**
 * Module scanner core (pure). `registry.ts` feeds it the `import.meta.glob`
 * records; tests feed it plain objects.
 *
 * Folder name = module id. A module's manifest may also declare `id`; when it
 * disagrees with the folder the folder wins and the mismatch is reported so
 * the developer notices (the backend registry keys everything by folder id).
 * Local modules (`pages.local`, `widgets.local`) override official ones with
 * the same id, mirroring blocks.local.
 */

export interface ScannedModule<T> {
  id: string;
  source: "official" | "local";
  module: T;
}

export interface ScanResult<T> {
  modules: Map<string, ScannedModule<T>>;
  warnings: string[];
}

type GlobRecord<T> = Record<string, { default?: T } | undefined>;

/** Extracts the folder name from a glob key like "./pages/orders/manifest.tsx". */
export function moduleIdFromPath(path: string): string | null {
  const match = /\/([^/]+)\/manifest\.tsx?$/u.exec(path);
  return match?.[1] ?? null;
}

export function scanModules<T extends { id?: string }>(
  official: GlobRecord<T>,
  local: GlobRecord<T> = {},
): ScanResult<T> {
  const modules = new Map<string, ScannedModule<T>>();
  const warnings: string[] = [];
  const ingest = (record: GlobRecord<T>, source: "official" | "local") => {
    for (const [path, entry] of Object.entries(record)) {
      const id = moduleIdFromPath(path);
      if (!id) {
        warnings.push(`Ignored ${path}: not a <id>/manifest.tsx file`);
        continue;
      }
      const module = entry?.default;
      if (!module) {
        warnings.push(`Ignored ${path}: manifest has no default export`);
        continue;
      }
      if (module.id && module.id !== id) {
        warnings.push(`${path}: manifest id "${module.id}" differs from folder "${id}"; using "${id}"`);
      }
      if (source === "local" && modules.has(id)) {
        warnings.push(`Local module "${id}" overrides the official module`);
      }
      modules.set(id, { id, source, module: { ...module, id } });
    }
  };
  ingest(official, "official");
  ingest(local, "local");
  return { modules, warnings };
}
