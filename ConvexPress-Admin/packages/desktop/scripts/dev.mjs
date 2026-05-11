import { cp, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(__dirname, "..");
const repoRoot = resolve(desktopRoot, "../..");
const webUrl =
	process.env.CONVEXPRESS_DESKTOP_DEV_URL ?? "http://localhost:4105";
const bun = process.platform === "win32" ? "bun.cmd" : "bun";
const shouldStartWeb = !process.env.CONVEXPRESS_DESKTOP_DEV_URL;
const childEnv = { ...process.env };

// Some shells export this globally. If it leaks into Electron, the app starts
// in Node-only mode and the main process never receives the real Electron API.
delete childEnv.ELECTRON_RUN_AS_NODE;

function run(command, args, options = {}) {
	return new Promise((resolveRun, rejectRun) => {
		const child = spawn(command, args, {
			cwd: desktopRoot,
			stdio: "inherit",
			...options,
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

	if (shouldStartWeb && !(await isUrlReady(webUrl))) {
		webDevServer = spawn(bun, ["run", "dev:web"], {
			cwd: repoRoot,
			stdio: "inherit",
			env: childEnv,
		});

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

	const electron = spawn(bun, ["x", "electron", "."], {
		cwd: desktopRoot,
		stdio: "inherit",
		env: {
			...childEnv,
			CONVEXPRESS_DESKTOP_DEV_URL: webUrl,
		},
	});

	const stop = (signal) => {
		if (!electron.killed) electron.kill(signal);
		if (webDevServer && !webDevServer.killed) webDevServer.kill(signal);
	};

	process.on("SIGINT", () => stop("SIGINT"));
	process.on("SIGTERM", () => stop("SIGTERM"));

	webDevServer?.on("exit", (code, signal) => {
		if (electron.killed) return;
		console.error(
			`[desktop:dev] Renderer dev server exited ${
				signal ? `with signal ${signal}` : `with code ${code}`
			}`,
		);
		electron.kill("SIGTERM");
	});

	electron.on("exit", (code) => {
		process.exitCode = code ?? 0;
		if (webDevServer && !webDevServer.killed) webDevServer.kill("SIGTERM");
	});
}

main().catch((error) => {
	console.error(
		`[desktop:dev] ${error instanceof Error ? error.message : error}`,
	);
	process.exitCode = 1;
});
