import { test, expect } from "bun:test";
import { fetchMastodonFeed, socialPlainText } from "../mastodon";
import { createSocialTransport } from "../transport";
import {
	socialAccount,
	socialFeedArgsSchema,
	socialFeedResultSchema,
	socialFeedMatchesArgs,
} from "../../canonicalDocuments/foundation/socialFeedContracts";
const origin = "https://mastodon.social",
	mediaOrigin = "https://files.mastodon.social";
const account = {
	id: "13179",
	username: "Mastodon",
	acct: "Mastodon",
	display_name: "Mastodon",
	url: origin + "/@Mastodon",
};
const options = {
	handle: "Mastodon@mastodon.social",
	limit: 6,
	approvedOrigins: new Set([origin]),
	approvedMediaOrigins: new Set([mediaOrigin]),
};
const status = (id = "100") => ({
	id,
	url: origin + "/@Mastodon/" + id,
	content: "<p>Small &amp; considered.</p>",
	created_at: "2026-09-01T12:00:00.000Z",
	visibility: "public",
	sensitive: false,
	spoiler_text: "",
	reblog: null,
	in_reply_to_id: null,
	account,
	media_attachments: [
		{
			type: "image",
			preview_url: mediaOrigin + "/sample.png",
			description: "A sample <b>image</b>",
			meta: { small: { width: 640, height: 480 } },
		},
	],
});
test("account normalization rejects paths, origins, private endpoints and malformed handles", () => {
	expect(socialAccount("mastodon", " @Mastodon@mastodon.social ")?.handle).toBe(
		"mastodon@mastodon.social",
	);
	expect(socialAccount("instagram", " @Studio.Name ")?.handle).toBe(
		"studio.name",
	);
	for (const handle of [
		"https://mastodon.social/@user",
		"user@127.0.0.1",
		"user@localhost",
		"user@private.local",
		"user@mastodon.social:443",
		"user@mastodon.social/a",
		"user@mastodon.social?x=y",
		"user@@mastodon.social",
		"user@mastodon..social",
		"user@mastodon.social.",
		"user@-mastodon.social",
	]) {
		expect(socialAccount("mastodon", handle)).toBeNull();
	}
	for (const handle of ["a/b", "a?x=y", "a@b", "a b", "x".repeat(31)])
		expect(socialAccount("instagram", handle)).toBeNull();
	for (const limit of [0, 49, 1.5])
		expect(
			socialFeedArgsSchema.safeParse({
				provider: "mastodon",
				handle: "a@mastodon.social",
				limit,
			}).success,
		).toBe(false);
});
test("verified account yields only closed display data and safe preview images", async () => {
	const calls: string[] = [];
	const result = await fetchMastodonFeed(options, async (url) => {
		calls.push(url.href);
		return calls.length === 1
			? { ...account, token: "NEVER_RETURN", private_metadata: "NEVER_RETURN" }
			: [status()];
	});
	expect(calls).toHaveLength(2);
	expect(calls[0]).toBe(origin + "/api/v1/accounts/lookup?acct=mastodon");
	expect(calls[1]).toContain("exclude_reblogs=true&exclude_replies=true");
	expect(result.profile.handle).toBe("mastodon@mastodon.social");
	expect(result.items[0]).toMatchObject({
		text: "Small & considered.",
		image: { alt: "A sample image", width: 640, height: 480 },
	});
	expect(JSON.stringify(result)).not.toContain("NEVER_RETURN");
	expect(JSON.stringify(result)).not.toContain("<p>");
});
test("private, unlisted, reply, boosted and sensitive content is excluded even if provider filters fail", async () => {
	const patches = [
		{ visibility: "private" },
		{ visibility: "direct" },
		{ visibility: "unlisted" },
		{ sensitive: true },
		{ spoiler_text: "CW" },
		{ in_reply_to_id: "8" },
		{ reblog: { content: "boost" } },
	];
	const posts = patches.map((patch, i) => ({
		...status(String(i + 1)),
		...patch,
	}));
	let calls = 0;
	expect(
		(
			await fetchMastodonFeed(options, async () =>
				++calls === 1 ? account : posts,
			)
		).items,
	).toEqual([]);
});
test("foreign, moved, suspended and mismatched accounts fail instead of publishing another account's posts", async () => {
	for (const patch of [
		{ id: "999", username: "other" },
		{ acct: "Mastodon@remote.example.com" },
		{ url: "https://evil.example.com/@Mastodon" },
		{ url: origin + "/@other" },
		{ suspended: true },
		{ moved: { id: "elsewhere" } },
	])
		await expect(
			fetchMastodonFeed(options, async () => ({ ...account, ...patch })),
		).rejects.toThrow();
	let calls = 0;
	await expect(
		fetchMastodonFeed(options, async () =>
			++calls === 1
				? account
				: [{ ...status(), account: { ...account, id: "999" } }],
		),
	).rejects.toThrow();
});
test("post URLs and images cannot escape the approved account or image origin", async () => {
	const posts = [
		{ ...status("1"), url: "https://evil.example.com/post" },
		{ ...status("2"), url: origin + "/@other/2" },
		{ ...status("3"), url: origin + "/@Mastodon/3?access_token=secret" },
		{
			...status("4"),
			media_attachments: [
				{
					type: "image",
					preview_url: "https://evil.example.com/track",
					description: "unsafe",
				},
			],
		},
	];
	let calls = 0;
	const result = await fetchMastodonFeed(options, async () =>
		++calls === 1 ? account : posts,
	);
	expect(result.items).toHaveLength(1);
	expect(result.items[0].id).toBe("4");
	expect(result.items[0].image).toBeNull();
});
test("48 items use at most two status pages with a server-derived max_id", async () => {
	const calls: URL[] = [];
	const result = await fetchMastodonFeed(
		{ ...options, limit: 48 },
		async (url) => {
			calls.push(url);
			if (calls.length === 1) return account;
			return Array.from({ length: 40 }, (_, i) =>
				status(String((calls.length === 2 ? 100 : 60) - i)),
			);
		},
	);
	expect(result.items).toHaveLength(48);
	expect(calls).toHaveLength(3);
	expect(calls[2].searchParams.get("max_id")).toBe("61");
	expect(new Set(result.items.map((x) => x.id)).size).toBe(48);
});
test("oversized pages, malformed entries, duplicates and looping continuation fail closed", async () => {
	for (const posts of [
		Array.from({ length: 41 }, (_, i) => status(String(i + 1))),
		[{}],
		[status(), status()],
	]) {
		let calls = 0;
		await expect(
			fetchMastodonFeed(options, async () => (++calls === 1 ? account : posts)),
		).rejects.toThrow();
	}
	let calls = 0;
	await expect(
		fetchMastodonFeed({ ...options, limit: 48 }, async () =>
			++calls === 1
				? account
				: Array.from({ length: 40 }, (_, i) => status(String(100 - i))),
		),
	).rejects.toThrow();
});
test("no provider request is made for an unapproved handle origin", async () => {
	let reads = 0;
	await expect(
		fetchMastodonFeed(
			{ ...options, handle: "user@other.example.com" },
			async () => {
				reads++;
				return account;
			},
		),
	).rejects.toThrow();
	expect(reads).toBe(0);
});
test("HTML is converted to bounded plain text, with one entity decode and no control bytes", () => {
	expect(
		socialPlainText("<script>alert(1)</script><p>A &amp; B<br>C &#x1f331;</p>"),
	).toBe("A & B\nC 🌱");
	expect(socialPlainText("&lt;img src=x onerror=alert(1)&gt;")).toBe(
		"<img src=x onerror=alert(1)>",
	); // literal text, never innerHTML
	expect(socialPlainText("&#0; &#xD800; &#99999999;")).toBe("� � �");
	expect(socialPlainText("abcdef", 3)).toBe("abc");
});
test("display envelope enforces exact account, count, duplicate and lifetime boundaries", async () => {
	let calls = 0;
	const snapshot = await fetchMastodonFeed(options, async () =>
		++calls === 1 ? account : [status()],
	);
	const value = {
		provider: "mastodon" as const,
		handle: options.handle,
		status: "ready" as const,
		...snapshot,
		refreshedAt: 1000,
		expiresAt: 601000,
	};
	expect(socialFeedResultSchema.parse(value)).toEqual(value);
	expect(
		socialFeedMatchesArgs({ ...options, provider: "mastodon" }, value),
	).toBe(true);
	expect(
		socialFeedMatchesArgs(
			{ provider: "mastodon", handle: "other@mastodon.social", limit: 6 },
			value,
		),
	).toBe(false);
	for (const patch of [
		{ expiresAt: 901001 },
		{ profile: null },
		{ items: [status()] },
		{ items: [...value.items, ...value.items] },
		{ secret: "not allowed" },
		{ status: "unavailable" },
	])
		expect(
			socialFeedResultSchema.safeParse({ ...value, ...patch }).success,
		).toBe(false);
	expect(
		socialFeedResultSchema.safeParse({
			...value,
			items: [
				{
					...value.items[0],
					image: { ...value.items[0].image, url: "https://127.0.0.1/a" },
				},
			],
		}).success,
	).toBe(false);
});
test("transport has exact origin authority, no redirects, bounded body and generic errors", async () => {
	const calls: Array<{ url: string; init?: RequestInit }> = [];
	const fetcher = (async (url: URL, init?: RequestInit) => {
		calls.push({ url: url.href, init });
		return new Response('{"ok":true}', {
			headers: { "Content-Type": "application/json" },
		});
	}) as typeof fetch;
	const transport = createSocialTransport(new Set([origin]), fetcher);
	expect(
		await transport(new URL(origin + "/api/v1/accounts/lookup?acct=mastodon")),
	).toEqual({ ok: true });
	expect(calls[0].init).toMatchObject({
		method: "GET",
		redirect: "error",
		credentials: "omit",
	});
	for (const url of [
		"http://mastodon.social/api",
		origin + ".evil.example.com/api",
		origin + "/api?access_token=SECRET",
		"https://127.0.0.1/api",
	])
		await expect(transport(new URL(url))).rejects.toThrow("configuration");
	expect(calls).toHaveLength(1);
	for (const response of [
		new Response("", {
			status: 302,
			headers: { location: "http://127.0.0.1" },
		}),
		new Response('{"secret":"NEVER_DISPLAY"}', {
			status: 401,
			headers: { "Content-Type": "application/json" },
		}),
		new Response("x".repeat(1048577), {
			headers: { "Content-Type": "application/json" },
		}),
		new Response("{}", { headers: { "Content-Type": "text/html" } }),
		new Response("invalid", {
			headers: { "Content-Type": "application/json" },
		}),
	])
		await expect(
			createSocialTransport(
				new Set([origin]),
				(async () => response) as typeof fetch,
			)(new URL(origin + "/api")),
		).rejects.toThrow("Social provider response");
	await expect(
		createSocialTransport(new Set([origin]), (async () => {
			throw Error("provider secret NEVER_DISPLAY");
		}) as typeof fetch)(new URL(origin + "/api")),
	).rejects.toThrow("Social provider network");
});
