import catalog from "../../../../blocks/.generated/catalog.json";
import type { BlockInstance } from "../src/templates/sdk/block-renderer/model";

/** Authored harness composition. The renderer receives ordinary canonical children. */
export function carouselSpecimenChildren(ownerId: string): BlockInstance[] {
	const make = (
		name: string,
		id: string,
		attrs: Record<string, unknown>,
		children?: BlockInstance[],
	): BlockInstance => {
		const spec = catalog.find((item) => item.name === name);
		if (!spec) throw new Error(`Missing canonical specimen contract: ${name}`);
		return {
			name,
			id,
			version: spec.version,
			attrs,
			...(children ? { children } : {}),
		};
	};
	return [
		{
			eyebrow: "01 / In the studio",
			heading: "Clay & light",
			body: "A cobalt glaze. A quiet workbench. An invitation to notice the small details of making.",
			mediaId: "demo-workshop",
			mediaAlt: "Sunlit ceramic studio with cobalt vessels on a workbench",
			ctaLabel: "Explore the composition",
			ctaUrl: "#composition",
		},
		{
			eyebrow: "02 / Out in the field",
			heading: "Room to roam",
			body: "Carry a little space for observation. A notebook turns an ordinary walk into a collection of ideas.",
			mediaId: "demo-image-field-notebook",
			mediaAlt: "Field notebook with a mountain landscape cover",
			ctaLabel: "Browse the studies",
			ctaUrl: "#studies",
		},
	].map((attrs, index) =>
		make("core/group", `${ownerId}-slide-${index + 1}`, {}, [
			make("core/media-text", `${ownerId}-panel-${index + 1}`, attrs),
		]),
	);
}
