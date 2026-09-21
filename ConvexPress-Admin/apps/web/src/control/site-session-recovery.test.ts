import { expect, test } from "bun:test";
import { createSiteSessionRecovery } from "./site-session-recovery";
test("restore-triggered renewal is once per unresolved site/operator chain, not once per replacement client", () => {
	const recovery = createSiteSessionRecovery();
	let exchanges = 0;
	const reconnect = () => exchanges++;
	expect(recovery.request("site-a/operator", reconnect)).toBe(true);
	for (let attempt = 0; attempt < 5; attempt++)
		expect(recovery.request("site-a/operator", reconnect)).toBe(false);
	expect(exchanges).toBe(1);
	recovery.healthy("other-site/operator");
	expect(recovery.request("site-a/operator", reconnect)).toBe(false);
	recovery.healthy("site-a/operator");
	expect(recovery.request("site-a/operator", reconnect)).toBe(true);
	expect(exchanges).toBe(2);
});
test("a genuine denial remains denied after automatic retry, with only explicit manual reconnect permitting another exchange", () => {
	const recovery = createSiteSessionRecovery();
	let exchanges = 0;
	const reconnect = () => exchanges++;
	recovery.request("site/operator", reconnect);
	expect(recovery.request("site/operator", reconnect)).toBe(false);
	expect(recovery.request("site/operator", reconnect, true)).toBe(true);
	expect(recovery.request("site/operator", reconnect)).toBe(false);
	expect(exchanges).toBe(2);
	expect(recovery.request("different-site/operator", reconnect)).toBe(true);
	expect(recovery.request("different-site/other-operator", reconnect)).toBe(
		true,
	);
});
