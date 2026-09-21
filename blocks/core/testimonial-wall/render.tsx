/** Staged canonical Library view; no legacy or provider activation. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import { ResolvedImage } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/editorial.css";
export default defineBlock("core/testimonial-wall", ({ attrs, resources }) => (
	<div className="cp-editorial-quotes cp-editorial-testimonial-wall">
		{attrs.items.map((item, index) => (
			<article key={index}>
				<P.Stack gap="md">
					{item.portrait && (
						<div className="cp-editorial-portrait">
							<ResolvedImage
								id={item.portrait.id}
								alt={item.portrait.alt}
								focalPoint={item.portrait.focalPoint}
								resources={resources}
							/>
						</div>
					)}
					<P.Quote
						quote={item.quote}
						attribution={item.name}
						source={item.context || undefined}
					/>
				</P.Stack>
			</article>
		))}
	</div>
));
