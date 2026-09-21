import { lstat, mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeBlockPromotion, PROMOTION_PACKAGE_BYTES } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/blockPromotion";
import { discoverBlocks } from "./discovery.mjs";
import { promotionSourceFiles } from "./promotion-source.mjs";

const repository = fileURLToPath(new URL("../../", import.meta.url));
async function directory(folder: string) {
  try { await mkdir(folder); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  const entry = await lstat(folder);
  if (!entry.isDirectory() || entry.isSymbolicLink()) throw Error("Promotion destination must contain real directories.");
}

/** Writes a reviewed package to a new Library folder. It never mutates the
 * source website, registers a deployment, or silently overwrites a retry. */
export async function promoteBlock({ root = repository, packageJson, write = false }: { root?: string; packageJson: string; write?: boolean }) {
  const promotion = decodeBlockPromotion(packageJson), name = promotion.bundle.targetName;
  const discovered = await discoverBlocks(root);
  if (discovered.blocks.some(block => block.spec.name === name)) throw Error(`Block already exists: ${name}`);
  for (const pack of Object.keys(promotion.definition.packTreatments ?? {})) if (!discovered.packs.some(item => item.id === pack)) throw Error(`Install the ${pack} template before promoting its treatment.`);
  const folder = path.join(root, "blocks", ...name.split("/"));
  try { await lstat(folder); throw Error("Promotion destination already exists; inspect it before retrying."); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const files = promotionSourceFiles(promotion.bundle, promotion.targetSpec);
  const result = { name, folder: path.relative(root, folder), sourceDigest: promotion.bundle.sourceDigest, packageDigest: promotion.bundle.packageDigest, files: Object.keys(files), write };
  if (!write) return result;
  await directory(root);await directory(path.join(root, "blocks"));await directory(path.dirname(folder));
  await mkdir(folder); // Exclusive reservation: another writer cannot replace it.
  const marker = path.join(folder, ".promotion-pending.json");
  await writeFile(marker, JSON.stringify(result) + "\n", { flag: "wx" });
  // block.json is last; discovery also rejects the pending marker. Interrupted
  // output remains inspectable and is never silently retried or removed.
  for (const [file, contents] of Object.entries(files)) await writeFile(path.join(folder, file), contents, { flag: "wx" });
  await rename(marker, path.join(folder, "promotion-build.json"));
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === "--help") console.log("Usage: bun run promote:block --file reviewed-promotion.json [--write]. Default: validate and show the file plan.");
    else {
      let file: string | undefined, write = false;
      const seen = new Set<string>();
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];if (seen.has(arg)) throw Error(`Repeated option ${arg}`);seen.add(arg);
        if (arg === "--write") write = true;
        else if (arg === "--file" && args[i + 1] && !args[i + 1].startsWith("--")) file = args[++i];
        else throw Error(`Unknown or incomplete option ${arg}`);
      }
      if (!file) throw Error("Supply a reviewed promotion package with --file.");
      const entry = await lstat(file);
      if (!entry.isFile() || entry.isSymbolicLink() || entry.size > PROMOTION_PACKAGE_BYTES) throw Error("The package must be a regular file no larger than 768KiB.");
      console.log(JSON.stringify(await promoteBlock({ packageJson: await readFile(file, "utf8"), write }), null, 2));
      console.log("Run canonical sync, contract/render acceptance and deployment before confirming promotion in the source website. Existing page instances keep their original versions.");
    }
  } catch (error) { console.error(error instanceof Error ? error.message : "Promotion failed");process.exitCode = 1; }
}
