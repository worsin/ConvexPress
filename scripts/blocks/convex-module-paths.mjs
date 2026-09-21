import { readFile, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
/** Convex function-module segments permit ASCII letters, digits and underscores. */
export function convexModuleName(name) {
  const normalized = name.replaceAll("-", "_");
  if (!normalized.split("/").every(segment => /^[A-Za-z0-9_]+(?:\.(?:d\.)?(?:ts|mts|mjs))?$/.test(segment))) throw Error(`Invalid Convex module path: ${name}`);
  return normalized;
}
export function convexModuleBody(body) {
  return body.replace(/((?:from\s+|import\s*)["'])([^"']+)(["'])/g, (all, before, target, after) => target.startsWith(".") ? before + target.replaceAll("-", "_") + after : all);
}
/** Apply the identical filename/import transform to an immutable deployment copy.
 * Only files explicitly owned by its existing manifest are rewritten. */
export async function normalizeDeployedFoundationDirectory(directory) {
  const manifestPath = path.join(directory,"manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath,"utf8"));
  const files = {};
  for (const name of Object.keys(manifest.files)) {
    const next = convexModuleName(name);
    if (Object.prototype.hasOwnProperty.call(files,next)) throw Error(`Convex module name collision: ${name}`);
    const body = convexModuleBody(await readFile(path.join(directory,name),"utf8"));
    await writeFile(path.join(directory,name),body);
    if (next !== name) await rename(path.join(directory,name),path.join(directory,next));
    files[next] = createHash("sha256").update(body).digest("hex");
  }
  await writeFile(manifestPath,JSON.stringify({...manifest,files},null,2)+"\n");
}
