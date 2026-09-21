import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, readdirSync } from "node:fs";
import path from "node:path";
import { vercelArtifactHash, type VercelArtifactFile } from "@convexpress/runtime-clients/vercel-artifact";

export type VercelArtifact = { hash: string; files: VercelArtifactFile[]; contents: Map<string, Buffer> };
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
/** This directory is chosen by desktop main/packaging, never by an IPC payload.
 * The manifest's historical outputRoot is not used to resolve any file. */
export function loadVercelArtifact(directory: string): VercelArtifact {
  if (lstatSync(directory).isSymbolicLink()) throw Error("Vercel artifact root cannot be a symlink");
  const root = realpathSync(directory), manifestFile = root + ".manifest.json";
  const metadataStat = lstatSync(manifestFile);
  if (!metadataStat.isFile() || metadataStat.isSymbolicLink() || metadataStat.size > 4 * 1024 * 1024) throw Error("Invalid Vercel manifest");
  const metadata: unknown = JSON.parse(readFileSync(manifestFile, "utf8"));
  if (!record(metadata) || metadata.version !== 1 || metadata.provider !== "vercel" || metadata.engine !== "convexpress" || metadata.buildOutputVersion !== 3 || !Array.isArray(metadata.files)) throw Error("Unsupported Vercel artifact manifest");
  const files = metadata.files as VercelArtifactFile[], hash = vercelArtifactHash(files);
  const contents = new Map<string, Buffer>();
  let total = 0;
  for (const file of files) {
    const relative = file.file.slice(".vercel/output/".length);
    let actual = root;
    for (const part of relative.split("/")) {
      actual = path.join(actual, part);
      if (lstatSync(actual).isSymbolicLink()) throw Error("Vercel artifacts cannot contain symlinks");
    }
    const stat = lstatSync(actual);
    if (!stat.isFile() || stat.size !== file.size || !realpathSync(actual).startsWith(root + path.sep)) throw Error("Vercel artifact size or path mismatch");
    const bytes = readFileSync(actual);
    if (bytes.length !== file.size || createHash("sha1").update(bytes).digest("hex") !== file.sha || createHash("sha256").update(bytes).digest("hex") !== file.sha256) throw Error("Vercel artifact checksum mismatch");
    contents.set(file.file, bytes); total += bytes.length;
  }
  if (total !== metadata.totalBytes) throw Error("Vercel artifact total size mismatch");
  function inspect(dir: string, relative = "") {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = path.posix.join(relative, entry.name);
      if (entry.isSymbolicLink()) throw Error("Vercel artifacts cannot contain symlinks");
      if (entry.isDirectory()) inspect(path.join(dir, entry.name), rel);
      else if (!entry.isFile() || !contents.has(".vercel/output/" + rel)) throw Error("Vercel artifact contains unlisted files");
    }
  }
  inspect(root);
  return { hash, files: files.map(file => ({ ...file })), contents };
}
