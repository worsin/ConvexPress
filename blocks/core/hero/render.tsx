import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import {
	Prose,
	Action,
	ResolvedImage,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import "./hero.css";
export default defineBlock("core/hero", ({ attrs, resources }) => (
	<P.Stack gap="lg">
		<div className="cp-library-editorial-hero">
			<P.Stack gap="lg">
				{attrs.eyebrow && <P.Eyebrow>{attrs.eyebrow}</P.Eyebrow>}
				{attrs.title && (
					<P.Heading level={1} size="display">
						{attrs.title}
					</P.Heading>
				)}
				{attrs.body && <Prose text={attrs.body} />}
				<P.Stack direction="horizontal" gap="md" wrap>
					<Action label={attrs.primaryCtaLabel} href={attrs.primaryCtaUrl} />
					<Action
						variant="outline" label={attrs.secondaryCtaLabel}
						href={attrs.secondaryCtaUrl}
					/>
				</P.Stack>
			</P.Stack>
		</div>
		<ResolvedImage id={attrs.mediaId} resources={resources} />
	</P.Stack>
));
