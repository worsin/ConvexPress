import { test, expect, spyOn } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference as ref } from "convex/server";
import schema from "../../schema";
import { readSocialFeed } from "../read";
const modules = {
	"./convex/_generated/api.js": () => import("../../_generated/api.js"),
	"./convex/_generated/server.js": () => import("../../_generated/server.js"),
	"./convex/socialFeeds/sources.ts": () => import("../sources"),
	"./convex/socialFeeds/cache.ts": () => import("../cache"),
	"./convex/socialFeeds/actions.ts": () => import("../actions"),
};
const create = ref<"mutation">("socialFeeds/sources:create"),
	list = ref<"query">("socialFeeds/sources:list"),
	enable = ref<"mutation">("socialFeeds/sources:setEnabled"),
	reserve = ref<"mutation">("socialFeeds/cache:reserve"),
	finish = ref<"mutation">("socialFeeds/cache:finish"),
	due = ref<"query">("socialFeeds/cache:due");
const args = {
	provider: "mastodon" as const,
	handle: "Mastodon@mastodon.social",
	limit: 6,
};
const snapshot = {
	profile: {
		handle: "mastodon@mastodon.social",
		name: "Mastodon",
		url: "https://mastodon.social/@Mastodon",
	},
	items: [
		{
			id: "100",
			url: "https://mastodon.social/@Mastodon/100",
			text: "An original synthetic test post.",
			publishedAt: 1,
			image: null,
		},
	],
};
async function fixture() {
	const t = convexTest({ schema, modules });
	const ids = await t.run(async (ctx) => {
		const role = await ctx.db.insert("roles", {
			name: "Moderator",
			slug: "moderator",
			description: "Test",
			level: 10,
			type: "internal",
			isDefault: false,
			isProtected: false,
			capabilities: ["manage_options"],
			pageAccess: [],
			status: "active",
			createdAt: 1,
			updatedAt: 1,
		});
		const user = await ctx.db.insert("users", {
			authSource: "local",
			email: "moderator@example.invalid",
			emailVerified: true,
			status: "active",
			roleId: role,
			createdAt: 1,
			updatedAt: 1,
		});
		const customer = await ctx.db.insert("users", {
			authSource: "clerk",
			clerkUserId: "social-customer",
			email: "customer@example.invalid",
			emailVerified: true,
			status: "active",
			createdAt: 1,
			updatedAt: 1,
		});
		const site = await ctx.db.insert("convexpress_siteIdentity", {
			identityKey: "site-identity",
			websiteKey: "social",
			instanceKey: "staging",
			environmentKind: "staging",
			deploymentOrigin: "https://social.convex.cloud",
			managementOrigin: "https://controller.convex.cloud",
			siteOrigin: "https://social.convex.site",
			siteContractVersion: "1",
			schemaVersion: "1",
			engineVersion: "1",
			managementCapabilities: [],
			initializedAt: 1,
			updatedAt: 1,
		});
		return { user, customer, site };
	});
	const operator = t.withIdentity({
		subject: ids.user,
		tokenIdentifier: `https://convexpress-admin.local|${ids.user}`,
	});
	const customer = t.withIdentity({
		subject: "social-customer",
		tokenIdentifier: "https://clerk.example|social-customer",
	});
	const source = () =>
		operator.mutation(create, {
			provider: args.provider,
			handle: args.handle,
			enabled: true,
		});
	const read = () => t.run((ctx) => readSocialFeed(ctx, args));
	return { t, ids, operator, customer, source, read };
}
test("only an active moderator can configure or manually refresh a source", async () => {
	const { t, operator, customer, source, ids } = await fixture();
	for (const actor of [t, customer]) {
		await expect(
			actor.mutation(create, {
				provider: args.provider,
				handle: args.handle,
				enabled: true,
			}),
		).rejects.toThrow();
		await expect(actor.query(list, {})).rejects.toThrow();
	}
	const sourceId = await source();
	for (const actor of [t, customer])
		await expect(
			actor.mutation(reserve, { sourceId, manual: true }),
		).rejects.toThrow();
	const job = await operator.mutation(reserve, { sourceId, manual: true });
	expect(job).not.toBeNull();
	await t.run((ctx) => ctx.db.patch("users", ids.user, { status: "inactive" }));
	await expect(
		operator.mutation(finish, { job, snapshot, error: null }),
	).rejects.toThrow();
	expect(await t.run((ctx) => ctx.db.query("users").take(10))).toHaveLength(2);
	expect(await t.run((ctx) => ctx.db.query("emailQueue").take(1))).toEqual([]);
});
test("account uniqueness, approved hosts, setup state and source count are enforced", async () => {
	const { operator, source } = await fixture();
	await source();
	await expect(source()).rejects.toThrow();
	for (const handle of [
		"user@127.0.0.1",
		"user@other.example.com",
		"https://mastodon.social/@user",
	])
		await expect(
			operator.mutation(create, {
				provider: "mastodon",
				handle,
				enabled: true,
			}),
		).rejects.toThrow();
	await expect(
		operator.mutation(create, {
			provider: "instagram",
			handle: "studio",
			enabled: true,
		}),
	).rejects.toThrow();
	for (let i = 0; i < 19; i++)
		await operator.mutation(create, {
			provider: "mastodon",
			handle: `user${i}@mastodon.social`,
			enabled: false,
		});
	await expect(
		operator.mutation(create, {
			provider: "mastodon",
			handle: "last@mastodon.social",
			enabled: false,
		}),
	).rejects.toThrow();
	expect((await operator.query(list, {})).sources).toHaveLength(20);
});
test("a refresh atomically publishes only its own bounded cache and cannot be committed twice", async () => {
	const { t, operator, source, read } = await fixture(),
		sourceId = await source();
	expect((await read()).status).toBe("unavailable");
	const job = await operator.mutation(reserve, { sourceId, manual: true });
	expect(
		await operator.mutation(reserve, { sourceId, manual: true }),
	).toBeNull();
	expect(await operator.mutation(finish, { job, snapshot, error: null })).toBe(
		true,
	);
	expect(await operator.mutation(finish, { job, snapshot, error: null })).toBe(
		false,
	);
	const result = await read();
	expect(result.status).toBe("ready");
	expect(result.items).toEqual(snapshot.items);
	expect(result.expiresAt! - result.refreshedAt!).toBe(900000);
	expect(
		await operator.mutation(reserve, { sourceId, manual: true }),
	).toBeNull();
	expect(await t.query(due, {})).toEqual([]);
	const view = (await operator.query(list, {})).sources[0];
	expect(view.status).toBe("ready");
	for (const key of [
		"refreshAttempt",
		"cache",
		"deploymentOrigin",
		"lastError",
	])
		expect(view).not.toHaveProperty(key);
});
test("disable and environment changes fence late refresh results and public data", async () => {
	const { t, operator, source, read, ids } = await fixture(),
		sourceId = await source();
	const job = await operator.mutation(reserve, { sourceId, manual: true });
	await operator.mutation(enable, {
		sourceId,
		expectedRevision: 1,
		enabled: false,
	});
	expect(await operator.mutation(finish, { job, snapshot, error: null })).toBe(
		false,
	);
	expect((await read()).status).toBe("unavailable");
	await expect(
		operator.mutation(enable, { sourceId, expectedRevision: 1, enabled: true }),
	).rejects.toThrow();
	await operator.mutation(enable, {
		sourceId,
		expectedRevision: 2,
		enabled: true,
	});
	const fresh = await t.mutation(reserve, { sourceId, manual: false });
	expect(fresh).not.toBeNull();
	await t.run((ctx) =>
		ctx.db.patch("convexpress_siteIdentity", ids.site, {
			instanceKey: "another",
		}),
	);
	expect(await t.mutation(finish, { job: fresh, snapshot, error: null })).toBe(
		false,
	);
	expect((await read()).status).toBe("unavailable");
	expect((await operator.query(list, {})).sources).toEqual([]);
});
test("expired, failed, replaced and incorrectly bound caches cannot render", async () => {
	const { t, operator, source, read } = await fixture(),
		sourceId = await source();
	let job = await operator.mutation(reserve, { sourceId, manual: true });
	await expect(
		operator.mutation(finish, {
			job,
			snapshot: {
				...snapshot,
				profile: { ...snapshot.profile, handle: "other@mastodon.social" },
			},
			error: null,
		}),
	).rejects.toThrow();
	await operator.mutation(finish, { job, snapshot, error: null });
	const stored = await t.run((ctx) =>
		ctx.db.get("socialFeedSources", sourceId),
	);
	await t.run((ctx) =>
		ctx.db.patch("socialFeedSources", sourceId, {
			cache: { ...stored!.cache!, expiresAt: Date.now() - 1 },
		}),
	);
	expect((await read()).status).toBe("unavailable");
	await t.run((ctx) =>
		ctx.db.patch("socialFeedSources", sourceId, {
			nextRefreshAt: 0,
			lastAttemptAt: 0,
		}),
	);
	job = await t.mutation(reserve, { sourceId, manual: false });
	await t.mutation(finish, { job, snapshot: null, error: "network" });
	expect((await read()).status).toBe("unavailable");
	expect(
		(await t.run((ctx) => ctx.db.get("socialFeedSources", sourceId)))!.cache,
	).toBeUndefined();
	expect((await operator.query(list, {})).sources[0].status).toBe("failed");
});
test("scheduler inventory is bounded and safe before site setup", async () => {
	const { t, operator } = await fixture();
	for (let i = 0; i < 20; i++)
		await operator.mutation(create, {
			provider: "mastodon",
			handle: `user${i}@mastodon.social`,
			enabled: true,
		});
	expect(await t.query(due, {})).toHaveLength(20);
	expect(await convexTest({ schema, modules }).query(due, {})).toEqual([]);
});
test("the public refresh action carries moderator authority and cached reads make no outbound request", async () => {
	const { t, operator, customer, source, read } = await fixture(),
		sourceId = await source();
	const refresh = ref<"action">("socialFeeds/actions:refreshSource");
	let requests = 0;
	const account = {
		id: "13179",
		username: "Mastodon",
		acct: "Mastodon",
		display_name: "Mastodon",
		url: "https://mastodon.social/@Mastodon",
	};
	const fetchMock = spyOn(globalThis, "fetch").mockImplementation(async () => {
		requests++;
		const body =
			requests === 1
				? account
				: [
						{
							id: "100",
							url: "https://mastodon.social/@Mastodon/100",
							content: "<p>Original test post</p>",
							created_at: "2026-09-01T00:00:00Z",
							visibility: "public",
							sensitive: false,
							spoiler_text: "",
							reblog: null,
							in_reply_to_id: null,
							account,
							media_attachments: [],
						},
					];
		return new Response(JSON.stringify(body), {
			headers: { "Content-Type": "application/json" },
		});
	});
	try {
		for (const actor of [t, customer])
			await expect(actor.action(refresh, { sourceId })).rejects.toThrow();
		expect(requests).toBe(0);
		expect(await operator.action(refresh, { sourceId })).toEqual({
			status: "refreshed",
		});
		expect(requests).toBe(2);
		expect((await read()).items[0].text).toBe("Original test post");
		expect(requests).toBe(2);
		expect(await operator.action(refresh, { sourceId })).toEqual({
			status: "skipped",
		});
		expect(requests).toBe(2);
	} finally {
		fetchMock.mockRestore();
	}
});
test("one scheduled sweep refreshes all20 sources with at most four outbound requests in flight", async () => {
	const { t, operator } = await fixture();
	for (let i = 0; i < 20; i++)
		await operator.mutation(create, {
			provider: "mastodon",
			handle: `user${i}@mastodon.social`,
			enabled: true,
		});
	let active = 0,
		peak = 0,
		requests = 0;
	const fetchMock = spyOn(globalThis, "fetch").mockImplementation(
		async (input) => {
			active++;
			requests++;
			peak = Math.max(peak, active);
			const url = new URL(String(input));
			await new Promise((resolve) => setTimeout(resolve, 5));
			active--;
			const username = url.searchParams.get("acct");
			const body = username
				? {
						id: String(100 + Number(username.slice(4))),
						username,
						acct: username,
						display_name: username,
						url: `https://mastodon.social/@${username}`,
					}
				: [];
			return new Response(JSON.stringify(body), {
				headers: { "Content-Type": "application/json" },
			});
		},
	);
	try {
		await t.action(ref<"action">("socialFeeds/actions:refreshDue"), {});
		expect(requests).toBe(40);
		expect(peak).toBeLessThanOrEqual(4);
		expect(peak).toBeGreaterThan(1);
		expect(
			(await operator.query(list, {})).sources.every(
				(source: { status: string }) => source.status === "ready",
			),
		).toBe(true);
	} finally {
		fetchMock.mockRestore();
	}
});

test("canonical cache reads meter complete documents, expire grants and bound UTF-8 output",async()=>{
 const {t,operator,source}=await fixture(),sourceId=await source();
 const job=await operator.mutation(reserve,{sourceId,manual:true});
 const large={...snapshot,items:Array.from({length:48},(_,i)=>({...snapshot.items[0],id:String(100+i),url:`https://mastodon.social/@Mastodon/${100+i}`,text:"雪".repeat(2000)}))};
 expect(await operator.mutation(finish,{job,snapshot:large,error:null})).toBe(true);
 const {RequestReadLedger}=await import("../../helpers/requestReadLedger");
 const budget=new RequestReadLedger();
 const result=await t.run(ctx=>readSocialFeed(ctx,{...args,limit:48},budget));
 expect(result.status).toBe("ready");expect(result.items.length).toBeGreaterThan(0);expect(result.items.length).toBeLessThan(48);
 expect(new TextEncoder().encode(JSON.stringify(result)).length).toBeLessThanOrEqual(60*1024);
 expect(budget.queries).toBe(2);expect(budget.documents).toBe(2);expect(budget.bytes).toBeGreaterThan(48*2000);expect(budget.authorizationRecheckAt).toBe(result.expiresAt);
 await expect(t.run(ctx=>readSocialFeed(ctx,args,new RequestReadLedger({queries:1,documents:10,bytes:1000000,documentBytes:512000})))).rejects.toThrow();
});

test("account edits require current moderator scope and revision, withdraw old cache and fence old jobs",async()=>{
 const {t,operator,customer,source,ids}=await fixture(),sourceId=await source(),update=ref<"mutation">("socialFeeds/sources:updateAccount");
 const first=await operator.mutation(reserve,{sourceId,manual:true});await operator.mutation(finish,{job:first,snapshot,error:null});
 await t.run(ctx=>ctx.db.patch("socialFeedSources",sourceId,{lastAttemptAt:0}));
 const inFlight=await operator.mutation(reserve,{sourceId,manual:true});
 for(const actor of [t,customer])await expect(actor.mutation(update,{sourceId,expectedRevision:1,handle:"other@mastodon.social"})).rejects.toThrow();
 await expect(operator.mutation(update,{sourceId,expectedRevision:0,handle:"other@mastodon.social"})).rejects.toThrow();
 await expect(operator.mutation(update,{sourceId,expectedRevision:1,handle:"other@unapproved.example.com"})).rejects.toThrow();
 await operator.mutation(create,{provider:"mastodon",handle:"duplicate@mastodon.social",enabled:false});
 await expect(operator.mutation(update,{sourceId,expectedRevision:1,handle:"duplicate@mastodon.social"})).rejects.toThrow();
 await operator.mutation(update,{sourceId,expectedRevision:1,handle:"other@mastodon.social"});
 expect((await t.run(ctx=>readSocialFeed(ctx,args))).status).toBe("unavailable");
 expect((await t.run(ctx=>readSocialFeed(ctx,{...args,handle:"other@mastodon.social"}))).status).toBe("unavailable");
 expect(await operator.mutation(finish,{job:inFlight,snapshot,error:null})).toBe(false);
 const changed=(await operator.query(list,{})).sources.find((s:{id:string})=>s.id===sourceId);expect(changed.handle).toBe("other@mastodon.social");expect(changed.revision).toBe(2);
 await t.run(ctx=>ctx.db.patch("convexpress_siteIdentity",ids.site,{deploymentOrigin:"https://other.convex.cloud"}));
 await expect(operator.mutation(update,{sourceId,expectedRevision:2,handle:"third@mastodon.social"})).rejects.toThrow();
});

test("removal requires disable, current revision and moderator authority, and frees source capacity",async()=>{
 const {t,operator,customer,source,ids}=await fixture(),sourceId=await source(),remove=ref<"mutation">("socialFeeds/sources:remove");
 for(const actor of [t,customer])await expect(actor.mutation(remove,{sourceId,expectedRevision:1})).rejects.toThrow();
 await expect(operator.mutation(remove,{sourceId,expectedRevision:1})).rejects.toThrow("Disable");
 const job=await operator.mutation(reserve,{sourceId,manual:true});
 await operator.mutation(enable,{sourceId,expectedRevision:1,enabled:false});
 await expect(operator.mutation(remove,{sourceId,expectedRevision:1})).rejects.toThrow();
 await t.run(ctx=>ctx.db.patch("convexpress_siteIdentity",ids.site,{deploymentOrigin:"https://other.convex.cloud"}));
 await expect(operator.mutation(remove,{sourceId,expectedRevision:2})).rejects.toThrow();
 await t.run(ctx=>ctx.db.patch("convexpress_siteIdentity",ids.site,{deploymentOrigin:"https://social.convex.cloud"}));
 await operator.mutation(remove,{sourceId,expectedRevision:2});
 expect(await operator.mutation(finish,{job,snapshot,error:null})).toBe(false);
 expect((await operator.query(list,{})).sources).toHaveLength(0);
 expect(await source()).not.toBe(sourceId);
});

test("authorized Instagram refresh publishes bounded posts and honors media, account and site withdrawal", async () => {
 const oldAccounts=process.env.CONVEXPRESS_INSTAGRAM_ACCOUNTS,oldMedia=process.env.CONVEXPRESS_INSTAGRAM_MEDIA_ORIGINS;
 const token="synthetic-instagram-test-token";
 process.env.CONVEXPRESS_INSTAGRAM_ACCOUNTS=JSON.stringify([{handle:"studio.name",userId:"123456",accessToken:token,apiVersion:"v25.0"}]);
 process.env.CONVEXPRESS_INSTAGRAM_MEDIA_ORIGINS=JSON.stringify(["https://images.example.com"]);
 const requests:string[]=[];
 const fetchMock=spyOn(globalThis,"fetch").mockImplementation(async (input,init)=>{
  const url=new URL(String(input));requests.push(url.href);
  expect(url.origin).toBe("https://graph.facebook.com");expect(url.href).not.toContain(token);
  expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${token}`);
  const body=url.pathname.endsWith("/media")?{data:[{id:"987",username:"studio.name",caption:"A studio update",media_type:"IMAGE",media_url:"https://images.example.com/post.jpg",permalink:"https://www.instagram.com/p/Studio987/",timestamp:"2026-09-01T00:00:00Z"}]}:{id:"123456",username:"studio.name",name:"Studio"};
  return new Response(JSON.stringify(body),{headers:{"Content-Type":"application/json"}});
 });
 try {
  const {t,operator,customer,ids}=await fixture(),refresh=ref<"action">("socialFeeds/actions:refreshSource");
  const config={provider:"instagram" as const,handle:"@Studio.Name",enabled:true};
  for(const actor of [t,customer])await expect(actor.mutation(create,config)).rejects.toThrow();
  const sourceId=await operator.mutation(create,config);
  for(const actor of [t,customer])await expect(actor.action(refresh,{sourceId})).rejects.toThrow();
  expect(requests).toHaveLength(0);
  expect(await operator.action(refresh,{sourceId})).toEqual({status:"refreshed"});expect(requests).toHaveLength(2);
  const read=()=>t.run(ctx=>readSocialFeed(ctx,{provider:"instagram",handle:"studio.name",limit:6}));
  const result=await read();expect(result.status).toBe("ready");expect(result.items[0].image?.url).toBe("https://images.example.com/post.jpg");
  expect(JSON.stringify(result)).not.toContain(token);expect(JSON.stringify(await operator.query(list,{}))).not.toContain(token);
  expect(JSON.stringify(await t.run(ctx=>ctx.db.get("socialFeedSources",sourceId)))).not.toContain(token);
  process.env.CONVEXPRESS_INSTAGRAM_MEDIA_ORIGINS="[]";expect((await read()).items[0].image).toBeNull();
  process.env.CONVEXPRESS_INSTAGRAM_ACCOUNTS="[]";expect((await read()).status).toBe("unavailable");
  process.env.CONVEXPRESS_INSTAGRAM_ACCOUNTS=JSON.stringify([{handle:"studio.name",userId:"123456",accessToken:token,apiVersion:"v25.0"}]);
  await t.run(ctx=>ctx.db.patch("convexpress_siteIdentity",ids.site,{deploymentOrigin:"https://other.convex.cloud"}));expect((await read()).status).toBe("unavailable");
  await t.run(ctx=>ctx.db.patch("convexpress_siteIdentity",ids.site,{deploymentOrigin:"https://social.convex.cloud"}));
  await operator.mutation(enable,{sourceId,expectedRevision:1,enabled:false});expect((await read()).status).toBe("unavailable");
  expect(requests).toHaveLength(2);
 } finally {
  fetchMock.mockRestore();
  if(oldAccounts===undefined)delete process.env.CONVEXPRESS_INSTAGRAM_ACCOUNTS;else process.env.CONVEXPRESS_INSTAGRAM_ACCOUNTS=oldAccounts;
  if(oldMedia===undefined)delete process.env.CONVEXPRESS_INSTAGRAM_MEDIA_ORIGINS;else process.env.CONVEXPRESS_INSTAGRAM_MEDIA_ORIGINS=oldMedia;
 }
});
