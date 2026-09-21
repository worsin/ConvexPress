const fs = require("node:fs");
const path = require("node:path");
module.exports = async function checkProvisioning(context) {
  const hostingRoot = path.join(context.packager.info.appDir, "resources/website-hosting");
  const hosting = JSON.parse(fs.readFileSync(path.join(hostingRoot, "ready.json"), "utf8"));
  for (const [relative, expected] of Object.entries(hosting.checksums ?? {})) {
    if (relative.split("/").some(part => !part || part === "..") || path.isAbsolute(relative)) throw Error("Invalid storefront resource checksum path");
    const actual = require("node:crypto").createHash("sha256").update(fs.readFileSync(path.join(hostingRoot, relative))).digest("hex");
    if (actual !== expected) throw Error("Storefront resource changed after preparation");
  }
  if (!hosting.checksums?.["hosting/worker.mjs"]) throw Error("Storefront resource is not prepared");
  const vercelRoot = path.join(context.packager.info.appDir, "resources/website-vercel");
  const vercel = JSON.parse(fs.readFileSync(path.join(vercelRoot, "ready.json"), "utf8"));
  if (vercel.version !== 1 || !/^[a-f0-9]{64}$/.test(vercel.artifactHash) || !vercel.checksums?.["output/functions/ssr.func/index.mjs"] || !vercel.checksums?.["output.manifest.json"]) throw Error("Vercel storefront resource is not prepared");
  for (const [relative, expected] of Object.entries(vercel.checksums)) {
    if (relative.split("/").some(part => !part || part === "..") || path.isAbsolute(relative)) throw Error("Invalid Vercel checksum path");
    const actual = require("node:crypto").createHash("sha256").update(fs.readFileSync(path.join(vercelRoot, relative))).digest("hex");
    if (actual !== expected) throw Error("Vercel storefront resource changed after preparation");
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(context.packager.info.appDir, "resources/provisioning/manifest.json"), "utf8"));
  const arch = ["ia32", "x64", "armv7l", "arm64", "universal"][context.arch];
  if (manifest.platform !== context.electronPlatformName || manifest.arch !== arch) {
    throw new Error(`Provisioning payload ${manifest.platform}/${manifest.arch} does not match installer ${context.electronPlatformName}/${arch}. Build on the target OS and architecture.`);
  }
  if (!fs.existsSync(path.join(context.packager.info.appDir, "resources/provisioning/ready.json"))) throw new Error("Provisioning payload has not passed preparation checks.");
};
