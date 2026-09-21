import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
export type WebsiteArtifact = { hash: string; worker: string; manifest: Record<string, { hash: string; size: number }>; assets: Map<string, { bytes: Buffer; contentType: string }> };
const sha256 = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
export function assetPath(value: string) {
  if (!value.startsWith("/") || value.length > 512 || /[\\\u0000-\u001f]/.test(value) || value.split("/").slice(1).some(p => !p || p.startsWith(".") || /%2e|%2f|%5c/i.test(p)) || value.endsWith(".map")) throw Error("Invalid storefront asset path");
  return value.slice(1);
}
function read(root: string, relative: string, limit: number) {
  const parts = relative.split("/");
  let target = root;
  for (const part of parts) { target = path.join(target, part); if (lstatSync(target).isSymbolicLink()) throw Error("Storefront artifacts cannot contain symlinks"); }
  const stat = lstatSync(target);
  if (!stat.isFile() || stat.size > limit) throw Error("Storefront artifact exceeds its supported size");
  const resolved = realpathSync(target);
  if (!resolved.startsWith(root + path.sep)) throw Error("Storefront artifact escapes its resource directory");
  return readFileSync(target);
}
const MIME: Record<string, string> = { ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css", ".json": "application/json", ".html": "text/html", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".txt": "text/plain", ".xml": "application/xml", ".mp4": "video/mp4" };
/** Root is selected only by desktop main or the packaging helper, never IPC. */
export function loadWebsiteArtifact(directory: string): WebsiteArtifact {
  if (lstatSync(directory).isSymbolicLink()) throw Error("Storefront resource root cannot be a symlink");
  const root = realpathSync(directory);
  const metadata: unknown = JSON.parse(read(root, "hosting/manifest.json", 2 * 1024 * 1024).toString("utf8"));
  if (!record(metadata) || metadata.version !== 1 || metadata.engine !== "convexpress" || metadata.worker !== "worker.mjs" || !record(metadata.assets)) throw Error("Unsupported storefront artifact manifest");
  const workerBytes = read(root, "hosting/worker.mjs", 10 * 1024 * 1024);
  if (sha256(workerBytes) !== metadata.workerSha256) throw Error("Storefront Worker checksum mismatch");
  const entries = Object.entries(metadata.assets).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length || entries.length > 4000) throw Error("Unsupported storefront asset count");
  const manifest: WebsiteArtifact["manifest"] = {}, assets: WebsiteArtifact["assets"] = new Map();
  const receipt: unknown[] = ["convexpress-website-artifact-v1", sha256(workerBytes)];
  let total = workerBytes.length;
  for (const [pathname, item] of entries) {
    const relative = assetPath(pathname);
    if (!record(item) || typeof item.hash !== "string" || !/^[a-f0-9]{32}$/.test(item.hash) || !Number.isSafeInteger(item.size)) throw Error("Invalid storefront asset identity");
    const bytes = read(root, "client/" + relative, 25 * 1024 * 1024);
    if (bytes.length !== item.size) throw Error("Storefront asset size mismatch");
    total += bytes.length;
    if (total > 250 * 1024 * 1024) throw Error("Storefront release exceeds 250 MiB");
    const contentType = MIME[path.extname(relative).toLowerCase()] ?? "application/octet-stream";
    const prior = assets.get(item.hash);
    if (prior && (!prior.bytes.equals(bytes) || prior.contentType !== contentType)) throw Error("Conflicting storefront asset hashes");
    manifest[pathname] = { hash: item.hash, size: bytes.length };
    assets.set(item.hash, { bytes, contentType });
    receipt.push([pathname, item.hash, bytes.length, sha256(bytes)]);
  }
  return { hash: sha256(JSON.stringify(receipt)), worker: workerBytes.toString("utf8"), manifest, assets };
}
