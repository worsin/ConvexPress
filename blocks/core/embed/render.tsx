import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import { ConsentEmbed } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/consent-embed";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
export default defineBlock("core/embed", ({ attrs }) => (
	<P.Stack gap="md">
		{attrs.url ? (
			<ConsentEmbed url={attrs.url} title="Embedded video" kind="video" />
		) : (
			<P.Text tone="muted">No video selected.</P.Text>
		)}
		{attrs.caption && <P.Text>{attrs.caption}</P.Text>}
	</P.Stack>
));
