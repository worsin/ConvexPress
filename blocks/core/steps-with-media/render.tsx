/** Staged canonical Library view; no query/provider or legacy activation. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import {
	ResolvedImage,
	CardCopy,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/editorial.css";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/media-details.css";

export default defineBlock("core/steps-with-media", ({ attrs, resources }) => (
	<ol className="cp-library-detail-rows">
		{attrs.steps.map((step, index) => (
			<li key={index}>
				<div className="cp-editorial-pair" data-media={Boolean(step.media)}>
					<CardCopy>
						<P.Stack gap="md">
							<P.Eyebrow>{String(index + 1).padStart(2, "0")}</P.Eyebrow>
							<P.Heading level={3} size="md">
								{step.title}
							</P.Heading>
							{step.body && <P.RichText content={step.body} />}
						</P.Stack>
					</CardCopy>
					{step.media && (
						<ResolvedImage {...step.media} resources={resources} />
					)}
				</div>
			</li>
		))}
	</ol>
));
