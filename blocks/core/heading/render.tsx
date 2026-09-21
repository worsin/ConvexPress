import {
	defineBlock,
	useCanonicalHeadingAnchor,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
export default defineBlock("core/heading", ({ attrs, blockId }) => {
	const derivedAnchor = useCanonicalHeadingAnchor(blockId);
	const anchor = attrs.anchor || derivedAnchor;
	const hasText = attrs.text?.content.some(paragraph =>
		paragraph.content?.some(node => node.type === "text" && node.text.trim().length > 0),
	);
	// Preserve explicit link destinations without adding unnamed headings to
	// assistive-technology navigation when an author clears the text.
	if (!hasText) return anchor ? <span id={anchor} aria-hidden="true" /> : null;
	return (
		<P.Heading
			level={attrs.level}
			size={attrs.level === 1 ? "display" : attrs.level === 2 ? "lg" : attrs.level === 3 ? "md" : "sm"}
			anchor={anchor}
		>
			{attrs.text && <P.RichText content={attrs.text} inline />}
		</P.Heading>
	);
});
