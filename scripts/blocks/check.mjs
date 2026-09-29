import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { syncBlocks } from "./generator.mjs";
import { syncDeployedFoundation } from "./deployed-foundation.mjs";
import { syncPortableData } from "./portable-data.mjs";
import { discoverBlocks } from "./discovery.mjs";
import { pullTracker, readTrackerFile, reconcileTracker } from "./tracker.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url));
const args = process.argv.slice(2);
let trackerFile, rendererEvidenceFile, tracker = false;
for (let index = 0; index < args.length; index++) {
  if (args[index] === "--tracker") tracker = true;
  else if (args[index] === "--renderer-evidence" && args[index + 1]) rendererEvidenceFile = args[++index];
  else if (args[index] === "--tracker-file" && args[index + 1]) trackerFile = args[++index];
  else throw new Error("Usage: bun run check:blocks [--tracker | --tracker-file path] [--renderer-evidence path]");
}
if (rendererEvidenceFile && !tracker && !trackerFile) throw new Error("Renderer evidence requires tracker reconciliation");
if (tracker && trackerFile) throw new Error("Choose live tracker or an explicit snapshot, not both");
try {
  const result = await syncBlocks({ root, check: true });
  console.log(`Block foundation: ${result.blocks} specifications, ${result.packs} packs; generated output is current.`);
  execFileSync("bun", ["scripts/blocks/generate-legacy-compatibility.ts", "--check"], { cwd: root, stdio: "inherit", timeout: 30000 });
  await syncPortableData({root,check:true});
  await syncDeployedFoundation({root,check:true});
  execFileSync("bun", ["scripts/blocks/generate-transport-validators.ts", "--check"], { cwd: root, stdio: "inherit", timeout: 30000 });
  execFileSync("bun", ["test", fileURLToPath(new URL("../plugins/defaults.test.ts", import.meta.url))], { cwd: new URL("../../ConvexPress-Admin/packages/backend/", import.meta.url), stdio: "inherit", timeout: 30000 });
  if (tracker || trackerFile) {
    const rows = tracker ? await pullTracker() : await readTrackerFile(trackerFile);
    const checked = await reconcileTracker({ root, discovered: await discoverBlocks(root), rows, rendererEvidence: rendererEvidenceFile ? JSON.parse(await readFile(rendererEvidenceFile, "utf8")) : undefined });
    console.log(`Standalone tracker ${tracker ? "live" : "snapshot"}: ${checked.inventory} inventory rows, ${checked.specifications} repository specs, ${checked.verified} verified rows checked.`);
  }
  // Preserve the existing runtime gate until both apps and the backend consume
  // generated contracts. The schema foundation does not replace that coverage.
  for (const script of ["check-block-catalog.mjs", "sync-block-contracts.mjs"]) {
    execFileSync(process.execPath, [`../scripts/admin/${script}`, ...(script.startsWith("sync-") ? ["--check"] : [])], { cwd: new URL("../../ConvexPress-Admin/", import.meta.url), stdio: "inherit", timeout: 30000 });
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
