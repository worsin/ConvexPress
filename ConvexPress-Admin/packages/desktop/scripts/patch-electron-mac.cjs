const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

if (process.platform !== "darwin") process.exit(0);

const APP_NAME = "ConvexPress";
const BUNDLE_PARENT = `${APP_NAME} Desktop Bundle`;
const BUNDLE_ID = "com.convexpress.desktop.dev";
const SOURCE_EXECUTABLE = "Electron";
const APP_EXECUTABLE = APP_NAME;

const desktopRoot = path.resolve(__dirname, "..");
const electronRoot = path.dirname(
  require.resolve("electron/package.json", { paths: [desktopRoot] }),
);
const electronDist = path.join(electronRoot, "dist");
const pathFile = path.join(electronRoot, "path.txt");
const sourceApps = [
  path.join(electronDist, "Electron.app"),
  path.join(electronDist, `${APP_NAME}.app`),
];
const bundleParent = path.join(electronDist, BUNDLE_PARENT);
const targetApp = path.join(bundleParent, `${APP_NAME}.app`);
const iconSource = path.join(desktopRoot, "resources", "icon.icns");

function runPlistBuddy(command, plistPath) {
  execFileSync("/usr/libexec/PlistBuddy", ["-c", command, plistPath], {
    stdio: "ignore",
  });
}

function setOrAddPlistValue(plistPath, key, type, value) {
  try {
    runPlistBuddy(`Set :${key} ${value}`, plistPath);
    return;
  } catch {
    // Fall through to Add when the key is absent.
  }

  runPlistBuddy(`Add :${key} ${type} ${value}`, plistPath);
}

function firstExistingPath(paths) {
  return paths.find((candidate) => fs.existsSync(candidate));
}

const sourceApp = firstExistingPath(sourceApps) ?? targetApp;

if (!fs.existsSync(sourceApp)) {
  throw new Error(`Could not find an Electron .app bundle under ${electronDist}`);
}

if (path.resolve(sourceApp) !== path.resolve(targetApp)) {
  fs.rmSync(bundleParent, { recursive: true, force: true });
  fs.mkdirSync(bundleParent, { recursive: true });
  fs.cpSync(sourceApp, targetApp, {
    recursive: true,
    verbatimSymlinks: true,
  });
}

const macosDir = path.join(targetApp, "Contents", "MacOS");
const sourceExecutablePath = path.join(macosDir, SOURCE_EXECUTABLE);
const executablePath = path.join(macosDir, APP_EXECUTABLE);

if (SOURCE_EXECUTABLE !== APP_EXECUTABLE && fs.existsSync(sourceExecutablePath)) {
  fs.renameSync(sourceExecutablePath, executablePath);
}

if (!fs.existsSync(executablePath)) {
  throw new Error(`Expected executable at ${executablePath}`);
}

const resourcesDir = path.join(targetApp, "Contents", "Resources");
if (fs.existsSync(iconSource)) {
  fs.copyFileSync(iconSource, path.join(resourcesDir, "electron.icns"));
}

const plist = path.join(targetApp, "Contents", "Info.plist");
if (fs.existsSync(plist)) {
  setOrAddPlistValue(plist, "CFBundleName", "string", APP_NAME);
  setOrAddPlistValue(plist, "CFBundleDisplayName", "string", APP_NAME);
  setOrAddPlistValue(plist, "CFBundleExecutable", "string", APP_EXECUTABLE);
  setOrAddPlistValue(plist, "CFBundleIdentifier", "string", BUNDLE_ID);
  setOrAddPlistValue(plist, "CFBundleIconFile", "string", "electron");
}

for (const [helperName, identifier] of [
  ["Electron Helper.app", `${BUNDLE_ID}.helper`],
  ["Electron Helper (GPU).app", `${BUNDLE_ID}.helper.gpu`],
  ["Electron Helper (Plugin).app", `${BUNDLE_ID}.helper.plugin`],
  ["Electron Helper (Renderer).app", `${BUNDLE_ID}.helper.renderer`],
]) {
  const helperPlist = path.join(
    targetApp,
    "Contents",
    "Frameworks",
    helperName,
    "Contents",
    "Info.plist",
  );
  if (!fs.existsSync(helperPlist)) continue;
  try {
    setOrAddPlistValue(helperPlist, "CFBundleIdentifier", "string", identifier);
  } catch {
    // Helper identifiers are cosmetic for dev; do not fail install on variants.
  }
}

// CRITICAL: no trailing newline. Electron's CLI reads this as a literal path.
const electronCliPath = `${BUNDLE_PARENT}/${APP_NAME}.app/Contents/MacOS/${APP_EXECUTABLE}`;
fs.writeFileSync(pathFile, electronCliPath, { encoding: "utf-8" });

console.log(
  `[postinstall] Electron dev bundle prepared at ${path.relative(
    os.homedir(),
    targetApp,
  )}`,
);
