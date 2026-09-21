/** Staged Library treatment; no legacy activation. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import {
	Intro,
	Prose,
	Action,
	ResolvedImage,
	CardCopy,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import "./bento.css";
export default defineBlock("core/bento-grid", ({ attrs, resources }) => (
	<P.Stack gap="lg">
		<Intro {...attrs} />
		<div className="cp-library-bento-shell">
			<div className="cp-library-bento">
				{attrs.items.map((item, index) => (
					<article key={index} data-has-media={Boolean(item.mediaId)}>
						<P.Card>
							<div className="cp-library-bento-card-layout">
								{item.mediaId && (
									<div className="cp-library-bento-media">
										<ResolvedImage id={item.mediaId} resources={resources} />
									</div>
								)}
								<CardCopy>
									<P.Stack gap="md">
										{item.title && (
											<P.Heading level={3} size="md">
												{item.title}
											</P.Heading>
										)}
										{item.body && <Prose text={item.body} />}
										<Action label={item.ctaLabel} href={item.ctaUrl} />
									</P.Stack>
								</CardCopy>
							</div>
						</P.Card>
					</article>
				))}
			</div>
		</div>
	</P.Stack>
));
