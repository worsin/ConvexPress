#!/usr/bin/env node
/**
 * One command for every repository quality gate: `bun run verify`.
 *
 * Runs each gate in sequence and stops at the first failure with that gate's
 * exit code. Run it from a checkout with dependencies installed (root,
 * ConvexPress-Admin and ConvexPress-Website `bun install`). `--list` prints the
 * plan without running it.
 *
 * Every root `check:*` script is a gate automatically, so a new drift check
 * cannot be forgotten here. The only exclusions are listed with their reason.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const admin = "ConvexPress-Admin", backend = `${admin}/packages/backend`, website = "ConvexPress-Website", websiteApp = `${website}/apps/web`;

/** Root check:* scripts that are deliberately not pass/fail gates. */
const notGates = {
	"check:blocks-migration":
		"a legacy-block retirement gate that exits 1 by design until the legacy block layer is retired; see blocks/README.md and block-kit/references/content-migration.md",
};

const rootScripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts;
const checks = Object.keys(rootScripts).filter((name) => name.startsWith("check:") && !(name in notGates));
for (const name of Object.keys(notGates))
	if (!(name in rootScripts)) throw new Error(`verify: ${name} is excluded but no longer exists; remove it from notGates`);

const extensionIndex = `${backend}/convex/schema/_pluginIndex.generated.ts`;
const run = (cwd, ...args) => ({ cwd, command: "bun", args: ["run", ...args] });
const steps = [
	// Gitignored codegen the Admin type-check and tests import. The generator
	// also rewrites one tracked file, which must not change.
	{ label: "Admin extension index codegen", cwd: ".", command: process.execPath, args: [`${backend}/scripts/generate-extension-index.mjs`], tracked: extensionIndex },
	...checks.map((name) => ({ label: `root ${name}`, ...run(".", name) })),
	{ label: "root sync:blocks:all --check", ...run(".", "sync:blocks:all", "--check") },
	{ label: "root test:blocks", ...run(".", "test:blocks") },
	...["check-types", "test:web", "test:backend", "test:control", "test:desktop", "test:contracts", "test:tooling"].map((name) => ({ label: `Admin ${name}`, ...run(admin, name) })),
	{ label: "Admin backend check:typing", ...run(backend, "check:typing") },
	{ label: "Website check-types", ...run(website, "check-types") },
	{ label: "Website test", ...run(website, "test") },
	{ label: "Website lint", ...run(websiteApp, "lint") },
	{ label: "Website check:templates", ...run(websiteApp, "check:templates") },
];

for (const [name, reason] of Object.entries(notGates)) console.log(`verify: not a gate: ${name} (${reason})`);
if (process.argv.includes("--list")) {
	steps.forEach((step, index) => console.log(`${index + 1}. ${step.label}: (in ${step.cwd}) ${step.command === "bun" ? "bun" : "node"} ${step.args.join(" ")}`));
	process.exit(0);
}

const started = Date.now();
const timings = [];
for (const [index, step] of steps.entries()) {
	console.log(`\n==> [${index + 1}/${steps.length}] ${step.label}`);
	const before = step.tracked ? readFileSync(join(root, step.tracked), "utf8") : null;
	const began = Date.now();
	const result = spawnSync(step.command, step.args, { cwd: join(root, step.cwd), stdio: "inherit" });
	timings.push([step.label, Date.now() - began]);
	let code = result.status ?? 1;
	if (result.error) console.error(`verify: could not start ${step.command}: ${result.error.message}`);
	if (code === 0 && step.tracked && readFileSync(join(root, step.tracked), "utf8") !== before) {
		console.error(`verify: ${step.tracked} was stale; the regenerated file is now in your working tree`);
		code = 1;
	}
	if (code !== 0) {
		console.error(`\nverify: FAILED at [${index + 1}/${steps.length}] ${step.label} (exit ${code})`);
		process.exit(code);
	}
}
console.log("\nverify: all gates passed");
for (const [label, ms] of timings) console.log(`  ${(ms / 1000).toFixed(1).padStart(7)}s  ${label}`);
console.log(`  ${((Date.now() - started) / 1000).toFixed(1).padStart(7)}s  total`);
