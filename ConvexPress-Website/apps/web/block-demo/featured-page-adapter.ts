import { resolveCanonicalData } from "../src/templates/sdk/block-data/portable/resolve";
import type {
	DataScope,
	ResolverPolicy,
	PageResult,
} from "../src/templates/sdk/block-data/portable/contracts";

/** Synthetic, read-only fixtures. This module has no live client or network transport. */
export function resolveFeaturedDemo(
	tree: unknown,
	scope: DataScope,
	policy: ResolverPolicy,
	studioSrc: string,
	viewer = "demo-anonymous",
) {
	return resolveCanonicalData(
		tree,
		scope,
		policy,
		async (args): Promise<PageResult> => {
			if (viewer !== "demo-anonymous") return { page: null };
			switch (args.page) {
				case "demo-featured-studio":
					return {
						page: {
							id: args.page,
							title: "A quieter kind of making",
							href: "/#composition",
							excerpt:
								"A fictional studio journal about clay, cobalt and the useful objects we choose to keep. Start with the light. Stay for the details.",
							image: {
								src: studioSrc,
								alt: "A sunlit ceramic workbench with cobalt vessels",
							},
						},
					};
				case "demo-featured-notes":
					return {
						page: {
							id: args.page,
							title: "Make room for observation",
							href: "/#studies",
							excerpt:
								"A fictional notebook page about slowing down and paying attention. This authored page intentionally has no featured image.",
							image: null,
						},
					};
				case "demo-featured-long":
					return {
						page: {
							id: args.page,
							title:
								"The small observations that turn an ordinary afternoon into a practice worth returning to",
							href: "/#details",
							excerpt:
								"This fictional editorial page explores the texture of everyday work: the rim of a cup, a pencilled margin, the sound of rain against a studio window. Nothing here needs to become a grand gesture.\n\nA useful practice leaves enough room for an unexpected detail. Begin with one object and describe what you can actually see. Notice the changing light, the weight in your hand and the evidence of making.\n\nReturn tomorrow. The object may be the same; your attention will have changed. Keep the notes, including the unfinished thoughts, and let them become a record of how you look.",
							image: null,
						},
					};
				default:
					return { page: null };
			}
		},
	);
}
