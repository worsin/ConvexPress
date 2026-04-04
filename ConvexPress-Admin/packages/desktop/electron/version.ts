import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface ConvexpressVersionManifest {
  commitSha: string;
  version: string;
  repo: string;
  branch: string;
  builtAt: string;
  installedAt: string;
}

const MANIFEST_FILENAME = ".convexpress-version.json";

export function getManifestPath(installPath: string): string {
  return join(installPath, MANIFEST_FILENAME);
}

export function readManifest(
  installPath: string
): ConvexpressVersionManifest | null {
  const manifestPath = getManifestPath(installPath);
  if (!existsSync(manifestPath)) return null;
  try {
    return JSON.parse(readFileSync(manifestPath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Write the version manifest atomically.
 * Writes to a temp file first, then renames to avoid partial writes
 * on crash or power loss.
 */
export function writeManifest(
  installPath: string,
  manifest: ConvexpressVersionManifest
): void {
  const targetPath = getManifestPath(installPath);
  const tempPath = join(
    tmpdir(),
    `convexpress-manifest-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );

  writeFileSync(tempPath, JSON.stringify(manifest, null, 2));
  renameSync(tempPath, targetPath);
}
