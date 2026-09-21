/** Staged Library treatment; no legacy activation. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import {
	CardCopy,
	Intro,
	Prose,
	Action,
	ResolvedImage,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import "./alternating.css";
export default defineBlock(
	"core/feature-list-alternating",
	({ attrs, resources }) => (
		<P.Stack gap="lg">
			<Intro {...attrs} />
			<div className="cp-library-alternating">
				{attrs.items.map((item, index) => (
					<article key={index} data-has-media={Boolean(item.mediaId)}>
						<div className="cp-library-alternating-copy">
							<CardCopy>
								<P.Stack gap="md">
									<P.Eyebrow>{String(index + 1).padStart(2, "0")}</P.Eyebrow>
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
						{item.mediaId && (
							<div className="cp-library-alternating-media">
								<ResolvedImage
									id={item.mediaId}
									alt={item.mediaAlt || undefined}
									resources={resources}
								/>
							</div>
						)}
					</article>
				))}
			</div>
		</P.Stack>
	),
);
