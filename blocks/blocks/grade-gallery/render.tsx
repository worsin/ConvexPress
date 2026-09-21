/** Staged canonical Library view; no query/provider or legacy activation. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import {
	Intro,
	Prose,
	ResolvedImage,
	CardCopy,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/editorial.css";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/media-details.css";

export default defineBlock("blocks/grade-gallery", ({ attrs, resources }) => (
	<P.Stack gap="lg">
		<Intro heading={attrs.heading} body={attrs.intro} />
		<div className="cp-library-detail-rows">
			{attrs.sections.map((section, index) => (
				<section
					key={index}
					className="cp-library-grade-study"
					data-has-media={section.images.some(
						(image) => image.mediaId || image.caption,
					)}
				>
					<div className="cp-library-grade-layout">
						<CardCopy>
							<P.Stack gap="md">
								<P.Heading level={3} size="md">
									{section.grade}
								</P.Heading>
								{section.description && <Prose text={section.description} />}{" "}
								{section.notes && (
									<P.Text size="sm" tone="muted">
										{section.notes}
									</P.Text>
								)}
							</P.Stack>
						</CardCopy>
						{section.images.some((image) => image.mediaId || image.caption) && (
							<div className="cp-library-grade-images">
								{section.images.map((image, index) =>
									image.mediaId || image.caption ? (
										<div key={index}>
											{image.mediaId ? (
												<ResolvedImage
													id={image.mediaId}
													alt={image.alt || undefined}
													caption={image.caption}
													resources={resources}
												/>
											) : image.caption ? (
												<P.Text>{image.caption}</P.Text>
											) : null}
										</div>
									) : null,
								)}
							</div>
						)}
					</div>
				</section>
			))}
		</div>
	</P.Stack>
));
