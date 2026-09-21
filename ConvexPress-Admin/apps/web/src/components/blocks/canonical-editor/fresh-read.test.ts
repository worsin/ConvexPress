import { expect, test } from "bun:test";
import { freshCanonicalRead } from "./fresh-read";
test("fresh native reads cannot reuse an earlier authorized cache key after permission changes", async () => {
	const cache = new Map<string, string>(),
		keys: string[] = [];
	let allowed = true,
		executions = 0;
	const query = async (args: { postId: string; refreshKey?: string }) => {
		const key = JSON.stringify(args);
		if (cache.has(key)) return cache.get(key)!;
		executions++;
		if (!allowed) throw new Error("FORBIDDEN");
		cache.set(key, "authorized document");
		return "authorized document";
	};
	expect(await query({ postId: "draft" })).toBe("authorized document");
	await freshCanonicalRead("draft", (args) => {
		keys.push(args.refreshKey);
		return query(args);
	});
	allowed = false;
	// This models the installed client's documented localQueryResult fast path.
	expect(await query({ postId: "draft" })).toBe("authorized document");
	let denied = false;
	try {
		await freshCanonicalRead("draft", (args) => {
			keys.push(args.refreshKey);
			return query(args);
		});
	} catch (error) {
		denied = error instanceof Error && error.message === "FORBIDDEN";
	}
	expect(denied).toBe(true);
	expect(keys[0]).not.toBe(keys[1]);
	expect(executions).toBe(3);
});
