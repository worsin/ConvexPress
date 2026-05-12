import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "parallel" });

// WEBSITE API — feed/sitemap/robots (status-only check)
test("api-auth-callback returns 200", async ({ request }) => {
	const res = await request.get("/api/auth/callback");
	expect(res.status()).toBe(200);
});

test("api-comments-feed returns 200", async ({ request }) => {
	const res = await request.get("/api/comments/feed");
	expect(res.status()).toBe(200);
});

test("api-comments-feed-atom returns 200", async ({ request }) => {
	const res = await request.get("/api/comments/feed/atom");
	expect(res.status()).toBe(200);
});

test("api-feed returns 200", async ({ request }) => {
	const res = await request.get("/api/feed");
	expect(res.status()).toBe(200);
});

test("api-feed-atom returns 200", async ({ request }) => {
	const res = await request.get("/api/feed/atom");
	expect(res.status()).toBe(200);
});

test("api-feed-rss2 returns 200", async ({ request }) => {
	const res = await request.get("/api/feed/rss2");
	expect(res.status()).toBe(200);
});

test("api-robots returns 200", async ({ request }) => {
	const res = await request.get("/api/robots");
	expect(res.status()).toBe(200);
});

test("api-sitemap-style-xsl returns 200", async ({ request }) => {
	const res = await request.get("/api/sitemap-style/xsl");
	expect(res.status()).toBe(200);
});

test("api-sitemap-xml returns 200", async ({ request }) => {
	const res = await request.get("/api/sitemap/xml");
	expect(res.status()).toBe(200);
});
