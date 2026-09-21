/** Staged canonical Library view; no query/provider or legacy activation. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import {
	Prose,
	ResolvedImage,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/editorial.css";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/media-details.css";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/field-guide-treatment.css";

export default defineBlock(
	"reference/field-guide",
	({ attrs, resources, treatment }) => {
		const view = (
			<P.Stack gap="lg">
				{attrs.heading && <P.Heading>{attrs.heading}</P.Heading>}
				{attrs.mediaId && (
					<ResolvedImage
						id={attrs.mediaId}
						alt={attrs.mediaAlt || undefined}
						resources={resources}
					/>
				)}{" "}
				{attrs.showDetails && (
					<>
						{treatment ? (
							<P.Text>
								<span className="cp-field-guide-original-body">
									{attrs.body}
								</span>
							</P.Text>
						) : (
							attrs.body && <Prose text={attrs.body} />
						)}
						<dl className="cp-editorial-detail-list">
							{attrs.items.slice(0, attrs.count).map((item, index) => (
								<div key={index}>
									<dt>{item.label}</dt>
									<dd>{item.value}</dd>
								</div>
							))}
						</dl>
						{attrs.note !== null && (
							<P.Text size="sm" tone="muted">
								{attrs.note}
							</P.Text>
						)}
					</>
				)}
				{attrs.link.href && (!treatment || attrs.link.label) ? (
					<P.Link {...attrs.link} />
				) : !treatment && attrs.link.label ? (
					<P.Text>{attrs.link.label}</P.Text>
				) : null}
			</P.Stack>
		);
		if (!treatment) return view;
		return (
			<div
				className="cp-field-guide-treatment"
				data-spacing={treatment.values.spacing}
				data-alignment={treatment.values.alignment}
				data-ink={treatment.values.ink}
				data-font={treatment.values.font}
			>
				{view}
			</div>
		);
	},
);
