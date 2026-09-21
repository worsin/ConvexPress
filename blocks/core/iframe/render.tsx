import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import { ConsentEmbed } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/consent-embed";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
export default defineBlock("core/iframe", ({ attrs }) =>
	attrs.url ? (
		<ConsentEmbed url={attrs.url.href} title={attrs.title || attrs.url.label} />
	) : (
		<P.Text tone="muted">No embedded content selected.</P.Text>
	),
);
