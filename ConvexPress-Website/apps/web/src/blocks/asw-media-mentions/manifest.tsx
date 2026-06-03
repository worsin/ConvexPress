import type { BlockRendererProps, WebsiteBlockDefinition } from "@/lib/blocks/types";
import { BlockMedia, CtaLink, RichText, SectionIntro } from "../_shared/rendering";
import { aswMediaMentionsAttrsSchema, type AswMediaMentionsAttrs } from "./schema";

function AswMediaMentionsRenderer({ attrs }: BlockRendererProps<AswMediaMentionsAttrs>) {
  return (
    <div className="space-y-6">
      <SectionIntro heading={attrs.heading} body={attrs.intro} />
      <div className="grid gap-4 md:grid-cols-2">
        {attrs.items.map((item, index) => (
          <article key={index} className="grid gap-4 border border-border bg-card p-4 sm:grid-cols-[140px_minmax(0,1fr)]">
            {item.mediaId && (
              <BlockMedia
                mediaId={item.mediaId}
                alt={item.mediaAlt || item.title}
                className="aspect-[4/3] w-full object-cover"
                sizes="(max-width: 768px) 100vw, 140px"
              />
            )}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                <span>{item.kind}</span>
                {item.source && <span>{item.source}</span>}
              </div>
              <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
              {item.byline && <p className="text-xs text-muted-foreground">{item.byline}</p>}
              <RichText text={item.summary} className="text-sm text-muted-foreground" />
              <CtaLink label={item.ctaLabel} href={item.ctaUrl} />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export const definition = {
  name: "asw/media-mentions",
  title: "ASW Media Mentions",
  version: 1,
  schema: aswMediaMentionsAttrsSchema,
  Renderer: AswMediaMentionsRenderer,
  rendererStatus: "ready",
} satisfies WebsiteBlockDefinition;

export default definition;
