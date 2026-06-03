import type { BlockRendererProps, WebsiteBlockDefinition } from "@/lib/blocks/types";
import { BlockMedia, RichText, SectionIntro } from "../_shared/rendering";
import { aswGradeGalleryAttrsSchema, type AswGradeGalleryAttrs } from "./schema";

function AswGradeGalleryRenderer({ attrs }: BlockRendererProps<AswGradeGalleryAttrs>) {
  return (
    <div className="space-y-8">
      <SectionIntro heading={attrs.heading} body={attrs.intro} />
      <div className="grid gap-6">
        {attrs.sections.map((section, index) => (
          <section key={index} className="grid gap-4 border border-border bg-card p-5">
            <div className="space-y-3">
              <h3 className="text-xl font-semibold text-foreground">{section.grade}</h3>
              <RichText text={section.description} />
              {section.notes && (
                <div className="border-l border-primary pl-4">
                  <RichText text={section.notes} className="text-sm text-foreground" />
                </div>
              )}
            </div>
            {section.images.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {section.images.map((image, imageIndex) => (
                  <figure key={imageIndex} className="space-y-2">
                    <BlockMedia
                      mediaId={image.mediaId}
                      alt={image.alt || section.grade}
                      className="aspect-square w-full object-cover"
                      sizes="(max-width: 768px) 50vw, 25vw"
                    />
                    {image.caption && (
                      <figcaption className="text-xs text-muted-foreground">
                        {image.caption}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

export const definition = {
  name: "asw/grade-gallery",
  title: "ASW Grade Gallery",
  version: 1,
  schema: aswGradeGalleryAttrsSchema,
  Renderer: AswGradeGalleryRenderer,
  rendererStatus: "ready",
} satisfies WebsiteBlockDefinition;

export default definition;
