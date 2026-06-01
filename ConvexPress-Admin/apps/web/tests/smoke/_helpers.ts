import { type Page, expect } from "@playwright/test";

const DEFAULT_IGNORE_CONSOLE = [
	/\[vite\]/i,
	/\[HMR\]/i,
	/Download the React DevTools/i,
	/React Router Devtools/i,
	// Expected 401 when an unauthenticated visitor hits the app — the refresh
	// endpoint correctly returns 401 with no cookie. The auth context handles
	// this and renders the login form; the console error is cosmetic.
	/Failed to load resource: the server responded with a status of 401/i,
];

const DEFAULT_IGNORE_NETWORK = [
	/\/favicon\.ico$/,
	/\/\.well-known\/appspecific\/com\.chrome\.devtools/,
];

export interface SmokeOptions {
	expectHeading?: RegExp;
	expectSelector?: string;
	ignoreConsoleErrors?: RegExp[];
	ignoreNetworkUrls?: RegExp[];
	settleTimeoutMs?: number;
}

export async function smokeRoute(
	page: Page,
	path: string,
	opts: SmokeOptions = {},
) {
	const consoleErrors: string[] = [];
	const networkFailures: string[] = [];

	const ignoreConsole = [
		...DEFAULT_IGNORE_CONSOLE,
		...(opts.ignoreConsoleErrors ?? []),
	];
	const ignoreNetwork = [
		...DEFAULT_IGNORE_NETWORK,
		...(opts.ignoreNetworkUrls ?? []),
	];

	page.on("console", (msg) => {
		if (msg.type() !== "error") return;
		const text = msg.text();
		if (ignoreConsole.some((re) => re.test(text))) return;
		consoleErrors.push(text);
	});

	page.on("requestfailed", (req) => {
		const url = req.url();
		if (ignoreNetwork.some((re) => re.test(url))) return;
		const failure = req.failure();
		if (failure?.errorText === "net::ERR_ABORTED") return;
		networkFailures.push(`${req.method()} ${url} :: ${failure?.errorText ?? "failed"}`);
	});

	page.on("response", (resp) => {
		const url = resp.url();
		if (ignoreNetwork.some((re) => re.test(url))) return;
		if (resp.status() >= 500) {
			networkFailures.push(`${resp.status()} ${url}`);
		}
	});

	const response = await page.goto(path, { waitUntil: "domcontentloaded" });
	expect(response?.status(), `initial response status for ${path}`).toBeLessThan(400);

	if (opts.expectSelector) {
		await expect(page.locator(opts.expectSelector)).toBeVisible({
			timeout: 20_000,
		});
	}

	if (opts.expectHeading) {
		await expect(page.getByRole("heading").first()).toContainText(
			opts.expectHeading,
			{ timeout: 20_000 },
		);
	}

	await page
		.waitForLoadState("networkidle", { timeout: opts.settleTimeoutMs ?? 10_000 })
		.catch(() => {});

	expect(consoleErrors, `console errors on ${path}`).toEqual([]);
	expect(networkFailures, `network failures on ${path}`).toEqual([]);
}
