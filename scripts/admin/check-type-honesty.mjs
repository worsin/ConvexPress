import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const repoRoot = process.cwd();
const allowlistPath = join(repoRoot, "type-honesty-allowlist.txt");

function toPosix(path) {
  return path.split("\\").join("/");
}

function globToRegExp(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::DOUBLE_STAR::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DOUBLE_STAR::/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function loadAllowlist() {
  if (!existsSync(allowlistPath)) return [];
  return readFileSync(allowlistPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((pattern) => ({
      pattern,
      regex: globToRegExp(toPosix(pattern)),
    }));
}

function isAllowlisted(path, allowlist) {
  return allowlist.some(({ regex }) => regex.test(path));
}

const SUPPRESSION_RE = /@ts-(?:nocheck|ignore|expect-error)/;
const SKIP_DIRS = new Set([
  "node_modules",
  ".turbo",
  "dist",
  ".vinxi",
  ".output",
  ".next",
  "dist-electron",
  ".git",
]);
const SCAN_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
]);

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      const dotIndex = entry.name.lastIndexOf(".");
      if (dotIndex === -1) continue;
      const ext = entry.name.slice(dotIndex);
      if (!SCAN_EXTENSIONS.has(ext)) continue;
      yield full;
    }
  }
}

function findSuppressions() {
  const results = [];
  for (const file of walk(repoRoot)) {
    let contents;
    try {
      contents = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!SUPPRESSION_RE.test(contents)) continue;
    const lines = contents.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!SUPPRESSION_RE.test(line)) continue;
      results.push({
        path: toPosix(relative(repoRoot, file)),
        lineNumber: String(i + 1),
        content: line.trim(),
      });
    }
  }
  return results.filter(
    (entry) =>
      entry.path !== "scripts/admin/check-type-honesty.mjs" &&
      entry.path !== "../scripts/admin/check-type-honesty.mjs",
  );
}

function main() {
  const allowlist = loadAllowlist();
  const suppressions = findSuppressions();

  const unexpected = suppressions.filter(
    (entry) => !isAllowlisted(entry.path, allowlist),
  );

  if (unexpected.length === 0) {
    console.log("Type honesty check passed: no unexpected TS suppressions.");
    return;
  }

  console.error("Unexpected TypeScript suppressions found:\n");
  for (const entry of unexpected) {
    console.error(`${entry.path}:${entry.lineNumber} ${entry.content}`);
  }
  console.error(
    `\nFound ${unexpected.length} unexpected suppression(s). ` +
      "Move them behind typed boundaries or add a deliberate allowlist entry.",
  );
  process.exit(1);
}

main();
