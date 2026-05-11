import { cp, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(__dirname, "..");
const wizardOutputPath = resolve(desktopRoot, "dist-electron/wizard");

await rm(wizardOutputPath, { recursive: true, force: true });
await cp(resolve(desktopRoot, "electron/wizard"), wizardOutputPath, {
  recursive: true,
});
