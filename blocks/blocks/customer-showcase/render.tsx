/** Staged canonical Library view; no legacy or provider activation. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import {
	Intro,
	ResolvedImage,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/editorial.css";
export default defineBlock(
	"blocks/customer-showcase",
	({ attrs, resources }) => (
		<P.Stack gap="lg">
			<Intro heading={attrs.heading} body={attrs.intro} />
			<div className="cp-editorial-quotes">
				{attrs.items.map((item, index) => (
					<article key={index}>
						<P.Stack gap="lg">
							{item.mediaId && (
								<ResolvedImage
									id={item.mediaId}
									alt={item.mediaAlt || undefined}
									resources={resources}
								/>
							)}
							<P.Quote
								quote={item.quote}
								attribution={item.name || undefined}
								source={
									[item.role, item.company].filter(Boolean).join(" · ") ||
									undefined
								}
							/>
							{item.instrumentType && (
								<P.Text size="sm" tone="muted">
									{item.instrumentType}
								</P.Text>
							)}
							{item.url && P.primitiveSchemas.Link.shape.href.safeParse(item.url).success && (
								<P.Link
									href={item.url}
									label={
										item.name ? `View ${item.name}'s project` : "View project"
									}
								/>
							)}
						</P.Stack>
					</article>
				))}
			</div>
		</P.Stack>
	),
);
