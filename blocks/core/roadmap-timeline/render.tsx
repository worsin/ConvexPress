/** Staged Library treatment; no legacy activation. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import {
	Intro,
	Prose,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import "./roadmap.css";
export default defineBlock("core/roadmap-timeline", ({ attrs }) => (
	<P.Stack gap="lg">
		<Intro {...attrs} />
		<ol className="cp-library-roadmap">
			{attrs.items.map((item, index) => (
				<li key={index} data-status={item.status}>
					<div className="cp-library-roadmap-date">
						<P.Eyebrow>{item.label}</P.Eyebrow>
						<P.Badge label={item.status.replaceAll("_", " ")} />
					</div>
					<P.Stack gap="md">
						{item.title && (
							<P.Heading level={3} size="lg">
								{item.title}
							</P.Heading>
						)}
						{item.body && <Prose text={item.body} />}
					</P.Stack>
				</li>
			))}
		</ol>
	</P.Stack>
));
