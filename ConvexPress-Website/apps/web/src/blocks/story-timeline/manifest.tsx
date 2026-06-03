import type { BlockRendererProps, WebsiteBlockDefinition } from "@/lib/blocks/types";
import { BlockMedia, CtaLink, RichText, SectionIntro } from "../_shared/rendering";
import { storyTimelineAttrsSchema, type StoryTimelineAttrs } from "./schema";

function StoryTimelineRenderer({ attrs }: BlockRendererProps<StoryTimelineAttrs>) {
  return (
    <div className="space-y-8">
      <SectionIntro eyebrow={attrs.eyebrow} heading={attrs.heading} body={attrs.intro} />
      <ol className="relative grid gap-6 md:gap-8">
        {attrs.items.map((item, index) => {
          const media = item.mediaId ? (
            <BlockMedia
              mediaId={item.mediaId}
              alt={item.mediaAlt || item.title}
              className="aspect-[4/3] w-full object-cover"
              sizes="(max-width: 768px) 100vw, 38vw"
            />
          ) : null;
          const copy = (
            <div className="space-y-3">
              {item.label && (
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                  {item.label}
                </p>
              )}
              <h3 className="text-xl font-semibold text-foreground">{item.title}</h3>
              <RichText text={item.body} />
              <CtaLink label={item.linkLabel} href={item.linkUrl} />
            </div>
          );
          const mediaFirst = item.side === "left" || (item.side === "auto" && index % 2 === 1);
          return (
            <li key={index} className="grid gap-4 border-l border-border pl-5 md:grid-cols-2 md:border-l-0 md:pl-0">
              <div className={mediaFirst ? "md:order-1" : "md:order-2"}>{media}</div>
              <div className={mediaFirst ? "md:order-2" : "md:order-1"}>{copy}</div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export const definition = {
  name: "blocks/story-timeline",
  title: "Story Timeline",
  version: 1,
  schema: storyTimelineAttrsSchema,
  Renderer: StoryTimelineRenderer,
  rendererStatus: "ready",
} satisfies WebsiteBlockDefinition;

export default definition;
