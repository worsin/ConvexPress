import { createHash } from "node:crypto";

export type VercelArtifactFile = { file: string; sha: string; sha256: string; size: number };
export function vercelArtifactHash(files: VercelArtifactFile[]): string {
  if (!Array.isArray(files) || files.length < 3 || files.length > 10000) throw Error("Invalid Vercel artifact inventory");
  const seen = new Set<string>();
  let total = 0;
  for (const item of files) {
    if (!item || typeof item.file !== "string" || !item.file.startsWith(".vercel/output/") || item.file.length > 512 ||
      /[\\\u0000-\u001f]/.test(item.file) || item.file.slice(".vercel/output/".length).split("/").some(part => !part || part === "." || part === ".." || (part.startsWith(".") && part !== ".vc-config.json")) ||
      /%2e|%2f|%5c/i.test(item.file) || item.file.endsWith(".map") || seen.has(item.file) ||
      !/^[a-f0-9]{40}$/.test(item.sha) || !/^[a-f0-9]{64}$/.test(item.sha256) || !Number.isSafeInteger(item.size) || item.size < 0 || item.size > 25 * 1024 * 1024)
      throw Error("Invalid Vercel artifact descriptor");
    seen.add(item.file); total += item.size;
  }
  if (total > 250 * 1024 * 1024 || !["config.json", "functions/ssr.func/index.mjs", "functions/ssr.func/.vc-config.json"].every(file => seen.has(".vercel/output/" + file)))
    throw Error("Vercel SSR artifact is missing required files or exceeds its size limit");
  const rows = [...files].sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0).map(item => [item.file, item.sha, item.sha256, item.size]);
  return createHash("sha256").update(JSON.stringify(["convexpress-vercel-artifact-v1", rows])).digest("hex");
}
