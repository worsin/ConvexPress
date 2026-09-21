import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

const MAX_DESIGN_BYTES = 32 * 1024;
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

/** Compile pack-owned source; never accept a client-supplied design brief as
 * installed template policy, or read arbitrary files from a server action. */
export async function discoverPackDesign(root, pack, manifest) {
  if (!manifest) return null;
  let design;
  try {
    const file = path.join(root, pack.path, "DESIGN.md"), stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error(`Pack design must be a regular owned file: ${pack.id}`);
    if (stat.size > MAX_DESIGN_BYTES) throw Error(`Oversized pack design: ${pack.id}`);
    design = await readFile(file, "utf8");
    if (!design.trim() || Buffer.byteLength(design) > MAX_DESIGN_BYTES) throw Error(`Invalid pack design: ${pack.id}`);
  } catch (error) {
    // Older packs remain usable without a guide. AI styling explicitly refuses
    // an absent brief rather than silently inventing a template's direction.
    if (error.code === "ENOENT") return null;
    throw error;
  }
  if (manifest.id !== pack.id) throw Error(`Pack identity mismatch: ${pack.id}`);
  for (const [key, max] of [["name", 160], ["version", 80], ["description", 8000]]) {
    if (typeof manifest[key] !== "string" || !manifest[key].trim() || manifest[key].length > max)
      throw Error(`Invalid pack design ${key}: ${pack.id}`);
  }
  return {
    id: pack.id, name: manifest.name, version: manifest.version,
    description: manifest.description, design,
    revision: createHash("sha256").update(JSON.stringify(canonical({ manifest, design }))).digest("hex"),
  };
}
