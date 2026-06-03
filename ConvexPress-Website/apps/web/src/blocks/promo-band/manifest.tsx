import type { BlockRendererProps, WebsiteBlockDefinition } from "@/lib/blocks/types";
import { BlockMedia, CtaLink, RichText } from "../_shared/rendering";
import { promoBandAttrsSchema, type PromoBandAttrs } from "./schema";

function PromoBandRenderer({ attrs }: BlockRendererProps<PromoBandAttrs>) {
  return (
    <aside className="grid gap-6 border border-border bg-card p-5 md:grid-cols-[minmax(0,1fr)_260px] md:items-center">
      <div className="space-y-4">
        {attrs.eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            {attrs.eyebrow}
          </p>
        )}
        {attrs.heading && (
          <h2 className="text-2xl font-semibold text-foreground">{attrs.heading}</h2>
        )}
        <RichText text={attrs.body} />
        {attrs.details.length > 0 && (
          <dl className="grid gap-3 sm:grid-cols-3">
            {attrs.details.map((detail, index) => (
              <div key={index} className="border border-border bg-background p-3">
                <dt className="text-xs uppercase tracking-widest text-muted-foreground">{detail.label}</dt>
                <dd className="mt-1 text-sm font-semibold text-foreground">{detail.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="flex flex-wrap gap-3">
          <CtaLink label={attrs.primaryCtaLabel} href={attrs.primaryCtaUrl} primary />
          <CtaLink label={attrs.secondaryCtaLabel} href={attrs.secondaryCtaUrl} />
        </div>
      </div>
      {attrs.mediaId && (
        <BlockMedia
          mediaId={attrs.mediaId}
          alt={attrs.mediaAlt || attrs.heading}
          className="aspect-square w-full object-cover"
          sizes="(max-width: 768px) 100vw, 260px"
        />
      )}
    </aside>
  );
}

export const definition = {
  name: "blocks/promo-band",
  title: "Promo Band",
  version: 1,
  schema: promoBandAttrsSchema,
  Renderer: PromoBandRenderer,
  rendererStatus: "ready",
} satisfies WebsiteBlockDefinition;

export default definition;
