import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import featured from "../../../../../../../blocks/core/featured-page/render";
import { prepareBlocks } from "./model";
import {
	createDemoContentPageHost,
	type DemoDataContext,
} from "../block-data/demo-channel";
import { resolveCanonicalData } from "../block-data/portable/resolve";
export const featuredPolicy = {
	enabledPlugins: [],
	capabilities: ["reference.targetResolution"],
	disabledBlocks: [],
};
export const featuredContext: DemoDataContext = {
	scope: { websiteKey: "synthetic-site", instanceKey: "synthetic-stage" },
	documentKey: "synthetic-document",
	revision: "1",
	viewerKey: "anonymous-demo",
};
export const featuredTree = [
	{
		id: "featured",
		name: "core/featured-page",
		version: 1,
		attrs: { page: "synthetic-page", ctaLabel: "Read the study" },
	},
];
export const featuredPage = {
	page: {
		id: "synthetic-page",
		title: "A fictional field study",
		href: "/study",
		excerpt: "Authored **details** remain.",
		image: { src: "/studio.png", alt: "A sample studio" },
	},
};
export async function installedFeatured(
	tree: unknown = featuredTree,
	data: unknown = featuredPage,
) {
	const host = createDemoContentPageHost();
	const envelope = await resolveCanonicalData(
		tree,
		featuredContext.scope,
		featuredPolicy,
		async () => data,
	);
	const grant = host.install({
		tree,
		policy: featuredPolicy,
		context: featuredContext,
		envelope,
	});
	return {
		host,
		grant,
		envelope,
		render: (current = featuredContext) =>
			prepareBlocks(
				tree,
				{ "core/featured-page": featured },
				featuredPolicy,
				{ media: {} },
				{ grant, current },
			),
	};
}
test("featured page requires the host grant and renders only the exact closed bound page result", async () => {
	expect(() =>
		prepareBlocks(
			featuredTree,
			{ "core/featured-page": featured },
			featuredPolicy,
		),
	).toThrow("no authorized");
	const installed = await installedFeatured();
	const html = renderToStaticMarkup(installed.render());
	for (const value of [
		"A fictional field study",
		'href="/study"',
		'src="/studio.png"',
		"<strong>details</strong>",
	])
		expect(html).toContain(value);
	expect(html).not.toContain("synthetic-page");
	expect(() =>
		prepareBlocks(
			featuredTree,
			{ "core/featured-page": featured },
			featuredPolicy,
			{ media: {} },
			{
				grant: JSON.parse(JSON.stringify(installed.grant)),
				current: featuredContext,
			},
		),
	).toThrow("stored JSON");
	for (const context of [
		{ ...featuredContext, viewerKey: "different-viewer" },
		{ ...featuredContext, revision: "2" },
		{ ...featuredContext, documentKey: "another-document" },
		{
			...featuredContext,
			scope: { ...featuredContext.scope, instanceKey: "other" },
		},
	])
		expect(() => installed.render(context)).toThrow("current viewer");
});
test("null and absent-image states retain authored values without exposing previous or restricted data", async () => {
	const none = await installedFeatured(featuredTree, { page: null });
	const empty = renderToStaticMarkup(none.render());
	expect(empty).toContain("Featured page unavailable.");
	expect(empty).not.toContain("<a");
	expect(empty).not.toContain("<img");
	const text = await installedFeatured(featuredTree, {
		page: {
			...featuredPage.page,
			image: null,
			excerpt: "Long authored prose. ".repeat(200),
		},
	});
	const html = renderToStaticMarkup(text.render());
	expect(html).toContain("Long authored prose. ".repeat(200));
	expect(html).not.toContain("<img");
	expect(html).toContain('data-media="false"');
});
test("changed bindings, unsafe or leaking DTOs, budget overflow and revoked grants refuse before a view runs", async () => {
	const installed = await installedFeatured();
	for (const data of [
		{ page: { ...featuredPage.page, id: "foreign" } },
		{ page: { ...featuredPage.page, href: "javascript:alert(1)" } },
		{ page: { ...featuredPage.page, password: "secret" } },
		{ page: { ...featuredPage.page, excerpt: "x".repeat(9000) } },
	])
		expect(
			await installedFeatured(featuredTree, data).then(
				() => false,
				() => true,
			),
		).toBe(true);
	const changed = [{ ...featuredTree[0], attrs: { page: "another-page" } }];
	expect(() =>
		prepareBlocks(
			changed,
			{ "core/featured-page": featured },
			featuredPolicy,
			{ media: {} },
			{ grant: installed.grant, current: featuredContext },
		),
	).toThrow("current viewer");
	installed.host.invalidate();
	expect(() => installed.render()).toThrow("invalidated");
});
test("deduplicated target lookups keep separate placements and invalid new installations revoke old grants", async () => {
	const tree = [featuredTree[0], { ...featuredTree[0], id: "second" }];
	let calls = 0;
	const envelope = await resolveCanonicalData(
		tree,
		featuredContext.scope,
		featuredPolicy,
		async () => {
			calls++;
			return featuredPage;
		},
	);
	expect(calls).toBe(1);
	const host = createDemoContentPageHost();
	const grant = host.install({
		tree,
		policy: featuredPolicy,
		context: featuredContext,
		envelope,
	});
	const html = renderToStaticMarkup(
		prepareBlocks(
			tree,
			{ "core/featured-page": featured },
			featuredPolicy,
			{ media: {} },
			{ grant, current: featuredContext },
		),
	);
	expect(html.match(/A fictional field study/g)?.length).toBe(2);
	expect(() =>
		host.install({
			tree,
			policy: featuredPolicy,
			context: featuredContext,
			envelope: {},
		}),
	).toThrow();
	expect(() =>
		prepareBlocks(
			tree,
			{ "core/featured-page": featured },
			featuredPolicy,
			{ media: {} },
			{ grant, current: featuredContext },
		),
	).toThrow("invalidated");
});
test("installed data does not bypass anchor, layout, capability, policy or unrelated resolver checks", async () => {
	const installed = await installedFeatured();
	for (const policy of [
		{ ...featuredPolicy, disabledBlocks: ["core/featured-page"] },
		{ ...featuredPolicy, capabilities: [] },
	])
		expect(() =>
			prepareBlocks(
				featuredTree,
				{ "core/featured-page": featured },
				policy,
				{ media: {} },
				{ grant: installed.grant, current: featuredContext },
			),
		).toThrow();
	for (const value of [
		{ ...featuredTree[0], demoAdapter: installed.grant },
		{
			...featuredTree[0],
			attrs: { ...featuredTree[0].attrs, data: { page: featuredPage.page } },
		},
	])
		expect(() =>
			prepareBlocks(
				[value],
				{ "core/featured-page": featured },
				featuredPolicy,
			),
		).toThrow();
	const invalid = [
		{ ...featuredTree[0], anchor: "same" },
		{ ...featuredTree[0], id: "another", anchor: "same" },
	];
	// Shared canonical planning now rejects malformed trees before a host grant
	// can be installed. The already-installed valid grant must also refuse a changed invalid tree.
	expect(
		await installedFeatured(invalid).then(
			() => false,
			() => true,
		),
	).toBe(true);
	expect(() =>
		prepareBlocks(
			invalid,
			{ "core/featured-page": featured },
			featuredPolicy,
			{ media: {} },
			{ grant: installed.grant, current: featuredContext },
		),
	).toThrow("Data does not match");
	const layout = [{ ...featuredTree[0], layout: { width: "999px" } }];
	expect(
		await installedFeatured(layout).then(
			() => false,
			() => true,
		),
	).toBe(true);
	expect(() =>
		prepareBlocks(
			layout,
			{ "core/featured-page": featured },
			featuredPolicy,
			{ media: {} },
			{ grant: installed.grant, current: featuredContext },
		),
	).toThrow();
	const unknown = [
		{ id: "posts", name: "core/post-grid", version: 1, attrs: {} },
	];
	expect(
		await installedFeatured(unknown).then(
			() => false,
			() => true,
		),
	).toBe(true);
});
