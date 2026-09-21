import type {
	BlockInstance,
	RenderResources,
} from "../src/templates/sdk/block-renderer/model";
import { demoProducts } from "./products-adapter";
import { demoStories } from "./post-grid-adapter";
import workshop from "./assets/ceramic-workshop-editorial.png";
import retreat from "./assets/aster-house-retreat.png";

export const demoPages = ["studio", "journal", "shop"] as const;
export type DemoRoute = {
	page: "studio" | "journal" | "shop" | "story" | "product";
	item?: string;
};
export function readDemoRoute(search: string, pathname = "/"): DemoRoute {
	const params = new URLSearchParams(search),
		page = params.get("demoPage"),
		item = params.get("demoItem") ?? "";
	const product = demoProducts.find(
		(value) => pathname === `/products/${value.id}`,
	);
	if (product && !page) return { page: "product", item: product.id };
	if (page === "product" && demoProducts.some((product) => product.id === item))
		return { page, item };
	if (
		page === "story" &&
		demoStories.some((_, index) => String(index) === item)
	)
		return { page, item };
	return { page: demoPages.find((value) => value === page) ?? "studio" };
}
export function demoHref(route: DemoRoute, search = ""): string {
	const params = new URLSearchParams(search);
	params.set("demoPage", route.page);
	if (route.item) params.set("demoItem", route.item);
	else params.delete("demoItem");
	return `/?${params}#composed-pages`;
}
const rich = (text: string) => ({
	type: "doc",
	content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const relative = (src: string) => (src.startsWith("/") ? src : `/${src}`);

/** Internal authored pages, deliberately independent of the selected pack.
 * Every visible section goes through canonical validation and the real renderer. */
export function composeDemo(route: DemoRoute, search: string) {
	let sequence = 0;
	const block = (
		name: string,
		attrs: unknown,
		children?: BlockInstance[],
		version = 2,
	): BlockInstance => ({
		id: `fieldwork-${route.page}-${++sequence}`,
		name,
		version,
		attrs,
		...(children ? { children } : {}),
		layout: { width: "contained", spacing: "default" },
	});
	const section = (...children: BlockInstance[]) =>
		block("core/section", {}, children, 1);
	const heading = (text: string) =>
		block("core/heading", { text: rich(text), level: 2 });
	const paragraph = (text: string) =>
		block("core/paragraph", { body: rich(text) });
	const link = (page: DemoRoute["page"]) => demoHref({ page }, search);
	const media: Record<string, RenderResources["media"][string]> = {
		"fieldwork-studio": {
			src: relative(workshop),
			alt: "Sunlight falling across handmade vessels in a ceramic workshop",
		},
		"fieldwork-retreat": {
			src: relative(retreat),
			alt: "A timber and stone retreat beneath a forested mountain",
		},
	};
	const resources: RenderResources = { media };
	const invitation = block("core/cta-band", {
		eyebrow: "A little room for the everyday",
		heading: "Bring something considered into your day.",
		body: "Objects to use. Stories to return to. Made with attention, shared with care.",
		primaryCtaLabel: "Explore the collection",
		primaryCtaUrl: link("shop"),
		secondaryCtaLabel: "Read the journal",
		secondaryCtaUrl: link("journal"),
	});
	let blocks: BlockInstance[];
	let title: string;
	if (route.page === "studio") {
		title = "The studio";
		blocks = [
			block("core/hero-split", {
				eyebrow: "Fieldwork / Objects & observations",
				title: "A little less. A little better.",
				body: "A small independent studio making space for useful objects, patient work, and the details that make a day.",
				mediaId: "fieldwork-studio",
				mediaAlt: resources.media["fieldwork-studio"].alt,
				primaryCtaLabel: "Meet the collection",
				primaryCtaUrl: link("shop"),
				secondaryCtaLabel: "Our field notes",
				secondaryCtaUrl: link("journal"),
			}),
			block("core/feature-grid", {
				eyebrow: "Our way of working",
				heading: "Good things begin with attention.",
				body: "Three simple principles guide what we make and what we choose to keep.",
				items: [
					{
						title: "Useful, first",
						description:
							"A comfortable handle. A page that opens flat. We start with how something feels to use.",
					},
					{
						title: "Honest materials",
						description:
							"Clay, paper, timber. Familiar materials with their own character, given room to speak.",
					},
					{
						title: "Made for living",
						description:
							"Pieces that settle into a room and become part of the ordinary rituals you look forward to.",
					},
				],
			}),
			block("core/media-text", {
				eyebrow: "Somewhere to slow down",
				heading: "The view from here.",
				body: "Our imagined home is a workshop at the edge of the trees. There is a long table, a shelf of imperfect pots, and always another idea taking shape.",
				mediaId: "fieldwork-retreat",
				mediaAlt: resources.media["fieldwork-retreat"].alt,
				ctaLabel: "Notes from the studio",
				ctaUrl: link("journal"),
			}),
			section(
				block("core/quote", {
					text: "Make fewer things. Give each one a little more of your attention.",
					cite: "The Fieldwork notebook",
					source: "",
				}),
			),
			block("core/faq", {
				eyebrow: "Before you explore",
				heading: "A few useful details.",
				items: [
					{
						question: "What is Fieldwork?",
						answer:
							"A fictional studio created for BlockDemo. Every section you see is an editable ConvexPress block.",
					},
					{
						question: "Can I buy these objects?",
						answer:
							"This is a demonstration collection with synthetic products. No orders or payments are taken here.",
					},
					{
						question: "What changes when I switch templates?",
						answer:
							"The presentation changes. These same words, images, and blocks stay in place.",
					},
				],
			}),
			invitation,
		];
	} else if (route.page === "journal") {
		title = "The journal";
		blocks = [
			block("core/hero", {
				eyebrow: "Field notes / Volume 01",
				title: "The things we notice.",
				body: "Stories from the workbench, observations from the everyday, and a few ideas worth carrying with you.",
			}),
			section(
				heading("From the studio, and beyond."),
				paragraph(
					"A collection of fictional stories about materials, places, and the quiet pleasure of making.",
				),
			),
			block("core/post-grid", { limit: 9, showExcerpt: true }, undefined, 1),
			invitation,
		];
	} else if (route.page === "shop") {
		title = "The collection";
		blocks = [
			block("core/hero", {
				eyebrow: "The Fieldwork collection",
				title: "Everyday objects. Lasting company.",
				body: "For a first cup, a fresh page, or a thoughtful gift. A small collection of things we would like to live with.",
			}),
			block("commerce/product-showcase", {
				eyebrow: "A considered edit",
				heading: "Find your everyday companion.",
				intro:
					"Explore the sample pieces. Product details are previews; checkout is not enabled in this demonstration.",
				source: "newest",
				count: 4,
				showAddToCart: false,
			}),
			block("core/media-text", {
				eyebrow: "A note on materials",
				heading: "Good company for years to come.",
				body: "The things we use each day become a record of our lives. A pencil mark, a worn edge, the cup you always reach for. That is where the beauty begins.",
				mediaId: "fieldwork-studio",
				mediaAlt: resources.media["fieldwork-studio"].alt,
				ctaLabel: "Step inside the studio",
				ctaUrl: link("studio"),
			}),
			block("core/faq", {
				eyebrow: "Collection notes",
				heading: "A considered choice.",
				items: [
					{
						question: "Is this a live store?",
						answer:
							"No. These are synthetic products for template acceptance. Prices are examples and no purchase is submitted.",
					},
					{
						question: "Where can I see the individual pieces?",
						answer:
							"Select a product above to open its demonstration detail page.",
					},
				],
			}),
		];
	} else if (route.page === "story") {
		const [storyTitle, excerpt, src, alt] = demoStories[Number(route.item)];
		title = storyTitle;
		media["fieldwork-story"] = { src: relative(src), alt };
		blocks = [
			block("core/hero", {
				eyebrow: "Field notes / An imagined story",
				title,
				body: excerpt,
			}),
			block("core/image", {
				mediaId: "fieldwork-story",
				alt,
				caption: "A scene from our fictional Fieldwork studio.",
			}),
			section(
				heading("Paying attention is a practice."),
				paragraph(
					"Start with something familiar. The weight of a cup in your hand. The way morning light moves across a table. An empty page that asks for nothing more than a first line.",
				),
				paragraph(
					"In the studio, we return to these small observations. They remind us that a useful object does not need to announce itself. It simply needs to feel right, day after day.",
				),
				block("core/quote", {
					text: "There is always another detail worth paying attention to.",
					cite: "Fieldwork",
					source: "",
				}),
				heading("Leave a little room."),
				paragraph(
					"For the imperfect pot. For a different route home. For a thought you have not quite finished. Good work often begins in the spaces we leave open.",
				),
			),
			block("core/cta-band", {
				heading: "More from the notebook.",
				body: "Return to the collection of stories and observations.",
				primaryCtaLabel: "Back to the journal",
				primaryCtaUrl: link("journal"),
			}),
		];
	} else {
		const product = demoProducts.find((item) => item.id === route.item)!;
		title = product.title;
		media["fieldwork-product"] = {
			src: relative(product.src),
			alt: product.alt,
		};
		blocks = [
			block("core/hero-split", {
				eyebrow: "Fieldwork / Sample product",
				title,
				body: product.excerpt,
				mediaId: "fieldwork-product",
				mediaAlt: product.alt,
				primaryCtaLabel: "Back to the collection",
				primaryCtaUrl: link("shop"),
			}),
			section(
				heading("A closer look."),
				paragraph(
					"This fictional product page demonstrates how the same blocks form a complete detail layout. The collection uses synthetic pricing and imagery; no order is created here.",
				),
			),
			block("core/feature-grid", {
				heading: "The everyday, considered.",
				items: [
					{
						title: "A useful shape",
						description:
							"Designed around an ordinary ritual, with attention to the way it feels.",
					},
					{
						title: "A quiet presence",
						description: "A simple companion for the spaces you spend time in.",
					},
					{
						title: "Room to make it yours",
						description:
							"An object becomes meaningful through the life you bring to it.",
					},
				],
			}),
			invitation,
		];
	}
	return { title, blocks, resources };
}
