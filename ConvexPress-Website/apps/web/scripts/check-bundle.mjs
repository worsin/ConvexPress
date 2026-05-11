import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const clientAssetsDir = path.resolve("dist/client/assets");
const maxChunkBytes = Number.parseInt(process.env.BUNDLE_MAX_CHUNK_BYTES ?? "550000", 10);
const maxMainBytes = Number.parseInt(process.env.BUNDLE_MAX_MAIN_BYTES ?? "300000", 10);

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(2)} kB`;
}

const assets = await readdir(clientAssetsDir);
const jsAssets = await Promise.all(
  assets
    .filter((file) => file.endsWith(".js"))
    .map(async (file) => {
      const filePath = path.join(clientAssetsDir, file);
      const details = await stat(filePath);
      return { file, size: details.size };
    }),
);

jsAssets.sort((a, b) => b.size - a.size);

const largestChunk = jsAssets[0];
const mainChunk = jsAssets.find(({ file }) => file.startsWith("main-"));
const failures = [];

if (!largestChunk) {
  failures.push("No client JavaScript chunks were found in dist/client/assets.");
}

if (largestChunk && largestChunk.size > maxChunkBytes) {
  failures.push(
    `Largest client chunk ${largestChunk.file} is ${formatBytes(largestChunk.size)}; limit is ${formatBytes(maxChunkBytes)}.`,
  );
}

if (mainChunk && mainChunk.size > maxMainBytes) {
  failures.push(
    `Main client chunk ${mainChunk.file} is ${formatBytes(mainChunk.size)}; limit is ${formatBytes(maxMainBytes)}.`,
  );
}

console.log("Client chunk summary:");
for (const asset of jsAssets.slice(0, 10)) {
  console.log(`- ${asset.file}: ${formatBytes(asset.size)}`);
}

if (failures.length > 0) {
  console.error("\nBundle budget check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `\nBundle budget check passed. Largest chunk: ${largestChunk.file} (${formatBytes(largestChunk.size)}).`,
);
