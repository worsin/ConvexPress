import type { BlockRendererProps, WebsiteBlockDefinition } from "@/lib/blocks/types";
import { BlockMedia, CtaLink, RichText } from "../_shared/rendering";
import { pageBannerAttrsSchema, type PageBannerAttrs } from "./schema";

function PageBannerRenderer({ attrs }: BlockRendererProps<PageBannerAttrs>) {
  return (
    <header className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.82fr)] md:items-center">
      <div className="space-y-5">
        {attrs.breadcrumbLabel && (
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {attrs.breadcrumbLabel}
          </p>
        )}
        {attrs.eyebrow && (
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">
            {attrs.eyebrow}
          </p>
        )}
        <div className="space-y-4">
          <h1 className="text-4xl font-semibold leading-tight text-foreground md:text-6xl">
            {attrs.title}
          </h1>
          <RichText text={attrs.subtitle} className="max-w-2xl text-base text-muted-foreground md:text-lg" />
        </div>
        <CtaLink label={attrs.ctaLabel} href={attrs.ctaUrl} primary />
      </div>
      {attrs.mediaId && (
        <div className="overflow-hidden border border-border bg-muted">
          <BlockMedia
            mediaId={attrs.mediaId}
            alt={attrs.mediaAlt || attrs.title}
            className="aspect-[4/3] w-full object-cover"
            sizes="(max-width: 768px) 100vw, 42vw"
          />
        </div>
      )}
    </header>
  );
}

export const definition = {
  name: "blocks/page-banner",
  title: "Page Banner",
  version: 1,
  schema: pageBannerAttrsSchema,
  Renderer: PageBannerRenderer,
  rendererStatus: "ready",
} satisfies WebsiteBlockDefinition;

export default definition;
