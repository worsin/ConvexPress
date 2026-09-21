import {
	defineBlock,
	BlockRenderError,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import { ResolvedImage } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/utilities.css";
export default defineBlock("core/trust-badges", ({ attrs, resources }) => (
	<ul className="cp-library-trust-badges">
		{attrs.items.map((item, index) => {
			const icon = item.icon
				? P.primitiveSchemas.Icon.shape.name.safeParse(item.icon)
				: null;
			if (icon && !icon.success)
				throw new BlockRenderError(
					"UNSUPPORTED_ICON",
					"core/trust-badges",
					`The template SDK does not provide the requested icon: ${item.icon}. Choose a supported icon or an owned media asset.`,
				);
			return (
				<li key={index}>
					{icon?.success && <P.Icon name={icon.data} size="lg" />}
					{item.media && (
						<div className="cp-library-trust-media">
							<ResolvedImage {...item.media} resources={resources} />
						</div>
					)}
					<P.Text>{item.label}</P.Text>
				</li>
			);
		})}
	</ul>
));
