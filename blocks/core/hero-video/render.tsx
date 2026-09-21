/** Staged canonical Library view. Native controls and owned media only; no autoplay. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import {
	Intro,
	ResolvedImage,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import { resolvedAsset } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/media";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/media-details.css";
export default defineBlock("core/hero-video", ({ attrs, resources }) => {
	const video = attrs.video
		? resolvedAsset(attrs.video.id, resources, "video")
		: undefined;
	const poster = attrs.poster
		? resolvedAsset(attrs.poster.id, resources, "image")
		: undefined;
	const focalPoint = attrs.video?.focalPoint ?? attrs.poster?.focalPoint;
	return (
		<P.Stack gap="lg">
			<Intro heading={attrs.title} body={attrs.subtitle} />
			{video ? (
				<div
					className="cp-library-video-hero"
					style={{
						width: "100%",
						objectPosition: focalPoint
							? `${focalPoint.x * 100}% ${focalPoint.y * 100}%`
							: undefined,
					}}
				>
					<P.Video
						src={video.src}
						poster={poster?.src}
						title={
							attrs.title.trim() ||
							attrs.video?.alt ||
							video.alt ||
							"Featured video"
						}
						captions={video.captions}
					/>
				</div>
			) : attrs.poster ? (
				<ResolvedImage {...attrs.poster} resources={resources} />
			) : (
				<P.Text tone="muted">Choose a video to display.</P.Text>
			)}
			{attrs.cta && <P.Link {...attrs.cta} />}
		</P.Stack>
	);
});
