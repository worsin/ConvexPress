import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import { Prose, ResolvedImage } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import { resolvedAsset } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/media";
import { VideoCover } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/video-cover";
export default defineBlock("core/hero-video", ({ attrs, resources }) => {
 const video = attrs.video ? resolvedAsset(attrs.video.id, resources, "video") : undefined;
 const poster = attrs.poster ? resolvedAsset(attrs.poster.id, resources, "image") : undefined;
 const focalPoint = attrs.video?.focalPoint ?? attrs.poster?.focalPoint;
 const hasTitle = !!attrs.title.replace(/[\s\p{Default_Ignorable_Code_Point}]/gu, "");
 const hasSubtitle = !!attrs.subtitle.replace(/[\s\p{Default_Ignorable_Code_Point}]/gu, "");
 const hasCopy = hasTitle || hasSubtitle || !!attrs.cta;
 return <div className="cp-video-hero"><div className="cp-video-hero-cover" data-has-media={!!(video || poster)} style={{ objectPosition: focalPoint ? `${focalPoint.x * 100}% ${focalPoint.y * 100}%` : undefined }}>
  {(video || poster) && <div className="cp-video-hero-backdrop">
   {video ? <VideoCover media={video} poster={poster?.src} title={(hasTitle ? attrs.title : undefined) || attrs.video?.alt || video.alt || "Featured video"} /> : attrs.poster && <ResolvedImage {...attrs.poster} resources={resources} />}
  </div>}
  {hasCopy && <div className="cp-video-hero-copy"><P.Stack gap="md">
   {hasTitle && <P.Heading level={1} size="display">{attrs.title}</P.Heading>}
   {hasSubtitle && <Prose text={attrs.subtitle} />}
   {attrs.cta && <P.Button {...attrs.cta} />}
  </P.Stack></div>}
 </div></div>;
});
