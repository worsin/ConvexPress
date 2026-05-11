import { readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";

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

function findSuppressions() {
  const output = execFileSync(
    "rg",
    [
      "-n",
      "@ts-nocheck|@ts-ignore|@ts-expect-error",
      repoRoot,
      "--glob",
      "!**/node_modules/**",
      "--glob",
      "!**/.turbo/**",
      "--glob",
      "!**/dist/**",
    ],
    { encoding: "utf8" },
  );

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const firstColon = line.indexOf(":");
      const secondColon = line.indexOf(":", firstColon + 1);
      const absolutePath = line.slice(0, firstColon);
      const lineNumber = line.slice(firstColon + 1, secondColon);
      const content = line.slice(secondColon + 1);
      return {
        path: toPosix(relative(repoRoot, absolutePath)),
        lineNumber,
        content,
      };
    })
    .filter((entry) => entry.path !== "scripts/check-type-honesty.mjs");
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
