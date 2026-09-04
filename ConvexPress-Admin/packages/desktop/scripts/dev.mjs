import { cp, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
	ownedSpawnOptions,
	terminateOwnedProcess,
} from "./lib/process-lifecycle.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(__dirname, "..");
const repoRoot = resolve(desktopRoot, "../..");
const webUrl =
	process.env.CONVEXPRESS_DESKTOP_DEV_URL ?? "http://localhost:4105";
const bun = process.platform === "win32" ? "bun.cmd" : "bun";
const shouldStartWeb = !process.env.CONVEXPRESS_DESKTOP_DEV_URL;
const childEnv = { ...process.env };
// The desktop always talks to a standalone control plane (build:web hardcodes
// this for packaged builds). Without it the dev renderer boots the single-site
// login flow against the control plane, its first query fails, and the window
// stays blank.
childEnv.VITE_STANDALONE_CONTROL_PLANE ??= "true";

// Some shells export this globally. If it leaks into Electron, the app starts
// in Node-only mode and the main process never receives the real Electron API.
delete childEnv.ELECTRON_RUN_AS_NODE;

function run(command, args, options = {}) {
	return new Promise((resolveRun, rejectRun) => {
		const child = spawn(command, args, {
			cwd: desktopRoot,
			stdio: "inherit",
			...options,
			...ownedSpawnOptions(options),
		});

		child.on("error", rejectRun);
		child.on("exit", (code, signal) => {
			if (code === 0) {
				resolveRun();
				return;
			}
			rejectRun(
				new Error(
					`${command} ${args.join(" ")} exited with ${
						signal ? `signal ${signal}` : `code ${code}`
					}`,
				),
			);
		});
	});
}

async function waitForUrl(url, timeoutMs = 120_000) {
	const startedAt = Date.now();
	let lastLogAt = 0;
	let lastError = "";

	while (Date.now() - startedAt < timeoutMs) {
		try {
			const response = await fetch(url, { cache: "no-store" });
			if (response.ok) return;
			lastError = `HTTP ${response.status}`;
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
		}

		if (Date.now() - lastLogAt > 2_000) {
			console.log(`[desktop:dev] Waiting for ${url} (${lastError})`);
			lastLogAt = Date.now();
		}

		await new Promise((resolveTimeout) => setTimeout(resolveTimeout, 500));
	}

	throw new Error(`Timed out waiting for ${url}. Last error: ${lastError}`);
}

async function isUrlReady(url) {
	try {
		const response = await fetch(url, { cache: "no-store" });
		return response.ok;
	} catch {
		return false;
	}
}

async function main() {
	let webDevServer;
	let electron;
	let requestedSignal;

	try {
		if (shouldStartWeb && !(await isUrlReady(webUrl))) {
			webDevServer = spawn(
				bun,
				["run", "dev:web"],
				ownedSpawnOptions({
					cwd: repoRoot,
					stdio: "inherit",
					env: childEnv,
				}),
			);

			webDevServer.on("error", (error) => {
				console.error(
					`[desktop:dev] Failed to start renderer dev server: ${error.message}`,
				);
			});
		}

		await run(bun, [
		"x",
		"tsup",
		"electron/main.ts",
		"--format",
		"cjs",
		"--outDir",
		"dist-electron",
		"--external",
		"electron",
		"--external",
		"electron-updater",
		"--external",
		"fix-path",
		]);

		await run(bun, [
		"x",
		"tsup",
		"electron/preload.ts",
		"--format",
		"cjs",
		"--outDir",
		"dist-electron",
		"--external",
		"electron",
		]);

		const wizardOutputPath = resolve(desktopRoot, "dist-electron/wizard");
		await rm(wizardOutputPath, { recursive: true, force: true });
		await cp(resolve(desktopRoot, "electron/wizard"), wizardOutputPath, {
			recursive: true,
		});

		await waitForUrl(webUrl);

		electron = spawn(
			bun,
			["x", "electron", "."],
			ownedSpawnOptions({
				cwd: desktopRoot,
				stdio: "inherit",
				env: {
					...childEnv,
					CONVEXPRESS_DESKTOP_DEV: "1",
					CONVEXPRESS_DESKTOP_DEV_URL: webUrl,
				},
			}),
		);

		const stop = (signal) => {
			requestedSignal = signal;
			void terminateOwnedProcess(electron, {
				label: "ConvexPress Electron development process",
				groupOwned: true,
			});
		};

		process.once("SIGINT", () => stop("SIGINT"));
		process.once("SIGTERM", () => stop("SIGTERM"));

		webDevServer?.on("exit", (code, signal) => {
			if (!electron || electron.exitCode !== null || electron.signalCode !== null) return;
			console.error(
				`[desktop:dev] Renderer dev server exited ${
					signal ? `with signal ${signal}` : `with code ${code}`
				}`,
			);
			void terminateOwnedProcess(electron, {
				label: "ConvexPress Electron after renderer exit",
				groupOwned: true,
			});
		});

		const exitCode = await new Promise((resolveExit) =>
			electron.once("exit", (code) => resolveExit(code ?? 0)),
		);
		process.exitCode = requestedSignal ? 128 : exitCode;
	} finally {
		await terminateOwnedProcess(electron, {
			label: "ConvexPress Electron development process",
			groupOwned: true,
		}).catch((error) => console.error(`[desktop:dev] ${error.message}`));
		await terminateOwnedProcess(webDevServer, {
			label: "ConvexPress renderer development process",
			groupOwned: true,
		}).catch((error) => console.error(`[desktop:dev] ${error.message}`));
	}
}

main().catch((error) => {
	console.error(
		`[desktop:dev] ${error instanceof Error ? error.message : error}`,
	);
	process.exitCode = 1;
});
