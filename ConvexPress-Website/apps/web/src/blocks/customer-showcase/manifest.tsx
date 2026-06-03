import type { BlockRendererProps, WebsiteBlockDefinition } from "@/lib/blocks/types";
import { BlockMedia, RichText, SectionIntro } from "../_shared/rendering";
import { customerShowcaseAttrsSchema, type CustomerShowcaseAttrs } from "./schema";

function CustomerShowcaseRenderer({ attrs }: BlockRendererProps<CustomerShowcaseAttrs>) {
  return (
    <div className="space-y-6">
      <SectionIntro heading={attrs.heading} body={attrs.intro} />
      <div className="grid gap-4 md:grid-cols-3">
        {attrs.items.map((item, index) => {
          const card = (
            <article className="grid h-full gap-4 border border-border bg-card p-4">
              {item.mediaId && (
                <BlockMedia
                  mediaId={item.mediaId}
                  alt={item.mediaAlt || item.name || item.instrumentType}
                  className="aspect-[4/3] w-full object-cover"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
              )}
              <div className="space-y-3">
                {item.instrumentType && (
                  <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                    {item.instrumentType}
                  </p>
                )}
                <RichText text={item.quote} className="text-sm text-foreground" />
                <div className="text-sm text-muted-foreground">
                  {item.name && <p className="font-semibold text-foreground">{item.name}</p>}
                  {(item.role || item.company) && (
                    <p>{[item.role, item.company].filter(Boolean).join(", ")}</p>
                  )}
                </div>
              </div>
            </article>
          );
          if (!item.url) return <div key={index}>{card}</div>;
          return (
            <a key={index} href={item.url} className="block h-full hover:opacity-95">
              {card}
            </a>
          );
        })}
      </div>
    </div>
  );
}

export const definition = {
  name: "blocks/customer-showcase",
  title: "Customer Showcase",
  version: 1,
  schema: customerShowcaseAttrsSchema,
  Renderer: CustomerShowcaseRenderer,
  rendererStatus: "ready",
} satisfies WebsiteBlockDefinition;

export default definition;
