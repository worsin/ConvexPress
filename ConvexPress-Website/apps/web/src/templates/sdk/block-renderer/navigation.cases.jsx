import { test, expect } from "bun:test";
import { act } from "react";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { prepareBlocks } from "./model";
import menu from "../../../../../../../blocks/core/menu/render";
import breadcrumbs from "../../../../../../../blocks/core/breadcrumbs/render";
import anchorNav from "../../../../../../../blocks/core/anchor-nav/render";
import toc from "../../../../../../../blocks/core/table-of-contents/render";
import childPages from "../../../../../../../blocks/core/child-pages/render";
import siteInfo from "../../../../../../../blocks/core/site-info/render";
import heading from "../../../../../../../blocks/core/heading/render";
import paragraph from "../../../../../../../blocks/core/paragraph/render";
import {
	navigationSpecimenTree,
	resolveNavigationDemo,
} from "../../../../block-demo/navigation-adapter";
import { createDemoContentPageHost } from "../block-data/demo-channel";
import { navigationTreeIndex } from "../block-data/portable/navigationTree";
const registry = Object.fromEntries(
	[menu, breadcrumbs, anchorNav, toc, siteInfo, childPages, heading, paragraph].map((view) => [
		view.blockName,
		view,
	]),
);
const policy = {
	enabledPlugins: [],
	capabilities: ["tree.children", "reference.targetResolution"],
	disabledBlocks: [],
};
const current = {
	scope: { websiteKey: "fixture", instanceKey: "staging" },
	documentKey: "navigation",
	revision: "1",
	viewerKey: "public-fixture",
};
async function setup(name, attrs = {}, logoSrc) {
	const tree = navigationSpecimenTree({ id: "nav", name, version: 1, attrs });
	const envelope = await resolveNavigationDemo(tree, current.scope, policy, logoSrc);
	const host = createDemoContentPageHost();
	const grant = host.install({ tree, context: current, policy, envelope });
	return {
		host,
		tree,
		envelope,
		grant,
		render: (context = current) =>
			prepareBlocks(
				tree,
				registry,
				policy,
				{ media: {} },
				{ grant, current: context },
			),
	};
}
test("navigation consumes exact bound results and rendered heading IDs preserve authored targets and marks", async () => {
	for (const name of ["core/anchor-nav", "core/table-of-contents"]) {
		const fixture = await setup(name);
		const html = renderToStaticMarkup(fixture.render());
		const doc = new JSDOM(html).window.document;
		const links = [...doc.querySelectorAll("nav a")];
		expect(links.length).toBe(3);
		for (const a of links) {
			const target = doc.getElementById(a.getAttribute("href").slice(1));
			expect(target?.tagName).toMatch(/^H[23]$/);
			expect(target?.textContent).toBe(
				a.querySelector("span:last-child").textContent,
			);
		}
		expect(doc.querySelector("[aria-current]")).toBeNull();
		expect(() => fixture.render({ ...current, viewerKey: "other" })).toThrow(
			"does not match",
		);
		expect(() => fixture.render({ ...current, revision: "2" })).toThrow(
			"does not match",
		);
		expect(() =>
			fixture.render({
				...current,
				scope: { ...current.scope, instanceKey: "production" },
			}),
		).toThrow("does not match");
		expect(() => prepareBlocks(fixture.tree, registry, policy)).toThrow(
			"no authorized",
		);
	}
	const fixture = await setup("core/table-of-contents", { depth: 2 });
	const doc = new JSDOM(renderToStaticMarkup(fixture.render())).window.document;
	expect(doc.querySelectorAll("nav a").length).toBe(2);
	expect(doc.querySelectorAll("h3").length).toBe(1);
});
test("derived heading IDs are identical to the server tree projection; manual broken targets refuse", () => {
	const tree = [
		{
			id: "stable-heading",
			name: "core/heading",
			version: 2,
			attrs: {
				level: 2,
				text: {
					type: "doc",
					content: [
						{
							type: "paragraph",
							content: [
								{
									type: "text",
									text: "Marked title",
									marks: [{ type: "bold" }],
								},
							],
						},
					],
				},
			},
		},
	];
	const index = navigationTreeIndex(tree);
	const doc = new JSDOM(
		renderToStaticMarkup(prepareBlocks(tree, registry, policy)),
	).window.document;
	expect(doc.querySelector("h2").id).toBe(index.headings[0].anchor);
	expect(doc.querySelector("strong").textContent).toBe("Marked title");
	expect(() =>
		navigationTreeIndex([
			{
				id: "nav",
				name: "core/anchor-nav",
				version: 1,
				attrs: {
					source: "manual",
					items: [{ label: "Missing", anchor: "not-there" }],
				},
			},
		]),
	).toThrow("absent");
});
test("breadcrumb current state and site fields come from the filtered DTO; authored absence stays absent", async () => {
	const trail = await setup("core/breadcrumbs");
	const doc = new JSDOM(renderToStaticMarkup(trail.render())).window.document;
	expect(doc.querySelectorAll('[aria-current="page"]').length).toBe(1);
	expect(doc.querySelector("[aria-current]").textContent).toBe(
		"Studio field notes",
	);
	const info = await setup("core/site-info", { show: ["tagline"] });
	const html = renderToStaticMarkup(info.render());
	expect(html).toContain("fictional mountain retreat");
	expect(html).not.toContain("<h2");
	expect(html).not.toContain("<img");
	expect(() =>
		createDemoContentPageHost().install({
			tree: info.tree,
			context: current,
			policy,
			envelope: {
				...info.envelope,
				dataByBlock: {
					...info.envelope.dataByBlock,
					nav: {
						...info.envelope.dataByBlock.nav,
						data: { ...info.envelope.dataByBlock.nav.data, secret: "refused" },
					},
				},
			},
		}),
	).toThrow();
});
test("jump links move keyboard focus with reduced motion, keep actual current state and clear on grant revocation", async () => {
	const fixture = await setup("core/anchor-nav");
	const dom = new JSDOM('<div id="root"></div>', {
		url: "https://example.test/#%bad",
	});
	const previous = {
		window: globalThis.window,
		document: globalThis.document,
		HTMLElement: globalThis.HTMLElement,
		IntersectionObserver: globalThis.IntersectionObserver,
	};
	Object.assign(globalThis, {
		window: dom.window,
		document: dom.window.document,
		HTMLElement: dom.window.HTMLElement,
		IS_REACT_ACT_ENVIRONMENT: true,
	});
	const scrolls = [];
	const frames = new Map();
	let frameId = 0,
		callback,
		disconnected = false;
	window.requestAnimationFrame = (fn) => {
		frames.set(++frameId, fn);
		return frameId;
	};
	window.cancelAnimationFrame = (id) => frames.delete(id);
	const flush = () => {
// eslint-disable-next-line unicorn/no-useless-spread -- Snapshot callbacks so newly scheduled jobs wait for the next simulated tick.
		for (const [id, fn] of [...frames]) {
			frames.delete(id);
			fn(0);
		}
	};
	globalThis.IntersectionObserver = class {
		constructor(fn) {
			callback = fn;
		}
		observe() {}
		disconnect() {
			disconnected = true;
		}
	};
	window.matchMedia = () => ({ matches: true });
	window.HTMLElement.prototype.scrollIntoView = function (options) {
		scrolls.push({ id: this.id, ...options });
	};
	const { createRoot } = await import("react-dom/client");
	const root = createRoot(document.getElementById("root"));
	try {
		await act(async () => root.render(fixture.render()));
		const links = [...document.querySelectorAll("nav a")];
		await act(async () => links[1].click());
		expect(scrolls).toEqual([
			{ id: "study-section-2", behavior: "instant", block: "start" },
		]);
		expect(document.activeElement.id).toBe("study-section-2");
		expect(links[1].getAttribute("aria-current")).toBe("location");
		expect(window.location.hash).toBe("#study-section-2");
		// The real browser reports the later heading in its intersection band after
		// keyboard navigation. This exact callback used to overwrite aria-current.
		await act(async () => {
			callback([
				{
					target: document.getElementById("study-section-3"),
					isIntersecting: true,
					boundingClientRect: { top: 200 },
				},
			]);
			flush();
		});
		expect(links[1].getAttribute("aria-current")).toBe("location");
		document.getElementById("study-section-2").getBoundingClientRect = () => ({
			top: -120,
		});
		document.getElementById("study-section-3").getBoundingClientRect = () => ({
			top: 16,
		});
		await act(async () => {
			window.dispatchEvent(new window.Event("wheel"));
			flush();
		});
		expect(links[2].getAttribute("aria-current")).toBe("location");
		expect(links[1].hasAttribute("aria-current")).toBe(false);
		document.activeElement.blur();
		expect(
			document.getElementById("study-section-2").hasAttribute("tabindex"),
		).toBe(false);
		await act(async () => fixture.host.invalidate());
		expect(document.querySelector("nav")).toBeNull();
		expect(document.body.textContent).toContain("Content unavailable.");
		expect(disconnected).toBe(true);
		expect(frames.size).toBe(0);
	} finally {
		await act(async () => root.unmount());
		dom.window.close();
		Object.assign(globalThis, previous);
	}
});

test("child-page directory renders real hierarchy and refuses stale viewer grants", async () => {
 const fixture=await setup("core/child-pages",{depth:3});
 const doc=new JSDOM(renderToStaticMarkup(fixture.render())).window.document;
 expect([...doc.querySelectorAll("nav a")].map(a=>a.textContent)).toEqual(["Materials & care","Living with ceramics","Our considered process","Visit the studio"]);
 expect(doc.querySelectorAll("nav > ul > li").length).toBe(3);
 expect(doc.querySelector("nav li ul a").getAttribute("href")).toBe("/page/journal/materials/ceramics");
 expect(()=>fixture.render({...current,viewerKey:"different-customer"})).toThrow();
 const shallow=await setup("core/child-pages",{depth:1});
 expect(renderToStaticMarkup(shallow.render())).not.toContain("Living with ceramics");
});


test("menu renderer preserves hierarchy, link purpose and new-window safety in a viewer-bound envelope",async()=>{
 const fixture=await setup('core/menu',{source:'menu',menu:'demo-menu'});
 const doc=new JSDOM(renderToStaticMarkup(fixture.render())).window.document;
 expect(doc.querySelector('nav').getAttribute('aria-label')).toBe('Explore Aster House');
 expect(doc.querySelectorAll('nav a').length).toBe(4);
 expect(doc.querySelectorAll('nav li ul a').length).toBe(2);
 const external=doc.querySelector('a[target="_blank"]');
 expect(external.rel).toBe('noopener noreferrer');
 expect(external.textContent).toContain('opens in a new tab');
 expect(()=>fixture.render({...current,viewerKey:'another-user'})).toThrow('does not match');
});

test('TOC empty and maximum title/depth plus all site-info field subsets retain useful output', async()=>{
 const empty=await setup('core/table-of-contents',{title:'',depth:1});
 const doc=new JSDOM(renderToStaticMarkup(empty.render())).window.document;
 expect(doc.querySelector('nav h2').textContent).toBe('On this page');
 expect(doc.querySelector('nav').textContent).toContain('No sections to navigate.');
 expect(doc.querySelectorAll('nav a')).toHaveLength(0);
 const long=await setup('core/table-of-contents',{title:'Navigation '.repeat(16).slice(0,160),depth:6});
 const longDoc=new JSDOM(renderToStaticMarkup(long.render())).window.document;
 expect(longDoc.querySelector('nav h2').textContent).toBe('Navigation '.repeat(16).slice(0,160));
 expect(longDoc.querySelectorAll('nav a')).toHaveLength(3);
 for(const show of [[],['name'],['tagline'],['logo'],['name','tagline'],['logo','name'],['logo','tagline'],['logo','name','tagline']]){
  const f=await setup('core/site-info',{show},'https://example.test/logo.png');const d=new JSDOM(renderToStaticMarkup(f.render())).window.document;
  expect(d.querySelectorAll('.cp-site-info h2')).toHaveLength(show.includes('name')?1:0);
  expect(d.querySelectorAll('.cp-site-info img')).toHaveLength(show.includes('logo')?1:0);
  expect(d.body.textContent.includes('fictional mountain retreat')).toBe(show.includes('tagline'));
  if(!show.length)expect(d.body.textContent).toContain('No site details selected or available.');
 }
 await expect(setup('core/table-of-contents',{title:'x'.repeat(161)})).rejects.toThrow();
 await expect(setup('core/table-of-contents',{depth:7})).rejects.toThrow();
 const items=Array.from({length:30},(_,i)=>({label:(`Section ${i} `+'detail '.repeat(25)).slice(0,160),anchor:`study-section-${i%3+1}`}));
 const manual=await setup('core/anchor-nav',{source:'manual',items});
 const manualDoc=new JSDOM(renderToStaticMarkup(manual.render())).window.document;
 expect(manualDoc.querySelectorAll('nav a')).toHaveLength(30);
 expect([...manualDoc.querySelectorAll('nav a span:last-child')].map(n=>n.textContent)).toEqual(items.map(i=>i.label));
 await expect(setup('core/anchor-nav',{source:'manual',items:[...items,items[0]]})).rejects.toThrow();
 const absentLogo=await setup('core/site-info',{show:['logo']});
 expect(renderToStaticMarkup(absentLogo.render())).toContain('No site details selected or available.');
});
