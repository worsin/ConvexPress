import {
	defineBlock,
	useCanonicalHeadingAnchor,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
export default defineBlock("core/heading", ({ attrs, blockId }) => {
	const derivedAnchor = useCanonicalHeadingAnchor(blockId);
	return (
		<P.Heading level={attrs.level} anchor={attrs.anchor || derivedAnchor}>
			{attrs.text && <P.RichText content={attrs.text} inline />}
		</P.Heading>
	);
});
