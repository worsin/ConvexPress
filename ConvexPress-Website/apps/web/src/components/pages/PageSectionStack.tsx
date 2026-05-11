import { MediaImage } from "@/components/media/MediaImage";
import type { PageSection } from "@/lib/page-builder/types";
import {
  buildSecureRel,
  isExternalUrl,
  sanitizeHref,
} from "@/lib/security/url";
import { cn } from "@/lib/utils";

interface PageSectionStackProps {
  sections: PageSection[];
}

export function PageSectionStack({ sections }: PageSectionStackProps) {
  return (
    <div className="flex flex-col gap-6 md:gap-8">
      {sections.map((section) => (
        <PageSectionRenderer key={section.id} section={section} />
      ))}
    </div>
  );
}

function PageSectionRenderer({ section }: { section: PageSection }) {
  const tone = section.shell?.tone ?? "default";
  const padding = section.shell?.padding ?? "normal";
  const container = section.shell?.container ?? "content";

  return (
    <section
      data-slot={`page-section-${section.type}`}
      className={cn(
        "rounded-[2rem] border border-[color:var(--cp-border-soft)] shadow-[var(--cp-shadow-soft)]",
        tone === "default" && "bg-[color:var(--sh-color-surface)]",
        tone === "muted" && "bg-[color:color-mix(in_oklab,var(--accent)_24%,white_76%)]",
        tone === "accent" && "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent)_22%,white_78%),color-mix(in_oklab,var(--background)_82%,white_18%))]",
        tone === "contrast" && "bg-foreground text-background",
        padding === "spacious" ? "px-6 py-8 md:px-10 md:py-12" : "px-5 py-6 md:px-8 md:py-8",
      )}
    >
      <div className={cn(
        "mx-auto w-full",
        container === "wide" ? "max-w-[var(--cp-shell-max-width)]" : "max-w-[var(--cp-content-max-width)]",
      )}>
        {renderSection(section)}
      </div>
    </section>
  );
}

function renderSection(section: PageSection) {
  const data = (section.data ?? {}) as Record<string, unknown>;

  switch (section.type) {
    case "hero":
      return (
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-5">
            <SectionEyebrow value={stringValue(data.eyebrow)} />
            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.02] tracking-[-0.03em] md:text-5xl lg:text-6xl">
              {stringValue(data.title)}
            </h1>
            <SectionBody value={stringValue(data.body)} />
            <div className="flex flex-wrap gap-3">
              <SectionLink label={stringValue(data.primaryCtaLabel)} href={stringValue(data.primaryCtaUrl)} primary />
              <SectionLink label={stringValue(data.secondaryCtaLabel)} href={stringValue(data.secondaryCtaUrl)} />
            </div>
          </div>
          <MediaPanel mediaId={stringValue(data.mediaId)} alt={stringValue(data.title) || "Hero image"} />
        </div>
      );
    case "feature-grid": {
      const items = arrayValue<Record<string, unknown>>(data.items);
      return (
        <div className="space-y-6">
          <SectionEyebrow value={stringValue(data.eyebrow)} />
          <div className="space-y-3">
            <h2 className="text-3xl font-semibold leading-[1.08] tracking-[-0.025em] md:text-4xl">
              {stringValue(data.heading)}
            </h2>
            <SectionBody value={stringValue(data.body)} />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item, index) => (
              <article key={index} className="rounded-[1.5rem] border border-[color:var(--cp-border-soft)] bg-background/70 p-5">
                <h3 className="text-xl font-semibold leading-tight">{stringValue(item.title)}</h3>
                <p className="mt-3 text-base leading-7 text-foreground/78">{stringValue(item.description)}</p>
              </article>
            ))}
          </div>
        </div>
      );
    }
    case "story-split":
      return (
        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <MediaPanel mediaId={stringValue(data.mediaId)} alt={stringValue(data.heading) || "Section image"} />
          <div className="space-y-4">
            <SectionEyebrow value={stringValue(data.eyebrow)} />
            <h2 className="text-3xl font-semibold leading-[1.08] tracking-[-0.025em] md:text-4xl">
              {stringValue(data.heading)}
            </h2>
            <SectionBody value={stringValue(data.body)} />
            <SectionLink label={stringValue(data.ctaLabel)} href={stringValue(data.ctaUrl)} primary />
          </div>
        </div>
      );
    case "pricing-cards": {
      const plans = arrayValue<Record<string, unknown>>(data.plans);
      return (
        <div className="space-y-6">
          <SectionEyebrow value={stringValue(data.eyebrow)} />
          <div className="space-y-3">
            <h2 className="text-3xl font-semibold leading-[1.08] tracking-[-0.025em] md:text-4xl">
              {stringValue(data.heading)}
            </h2>
            <SectionBody value={stringValue(data.body)} />
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            {plans.map((plan, index) => {
              const featured = Boolean(plan.featured);
              return (
                <article
                  key={index}
                  className={cn(
                    "rounded-[1.75rem] border p-6",
                    featured
                      ? "border-primary bg-background shadow-[var(--cp-shadow-soft)]"
                      : "border-[color:var(--cp-border-soft)] bg-background/70",
                  )}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xl font-semibold">{stringValue(plan.name)}</h3>
                      {featured && (
                        <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                          Featured
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-foreground/70">{stringValue(plan.description)}</p>
                    <div className="flex items-end gap-2">
                      <span className="text-4xl font-semibold tracking-[-0.03em]">{stringValue(plan.price)}</span>
                      <span className="pb-1 text-sm text-foreground/60">{stringValue(plan.period)}</span>
                    </div>
                    <ul className="space-y-2 pt-2 text-sm leading-6 text-foreground/78">
                      {splitLines(stringValue(plan.features)).map((feature, featureIndex) => (
                        <li key={featureIndex}>• {feature}</li>
                      ))}
                    </ul>
                    <div className="pt-3">
                      <SectionLink label={stringValue(plan.ctaLabel)} href={stringValue(plan.ctaUrl)} primary={featured} />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      );
    }
    case "testimonial-band": {
      const testimonials = arrayValue<Record<string, unknown>>(data.testimonials);
      return (
        <div className="space-y-6">
          <SectionEyebrow value={stringValue(data.eyebrow)} />
          <div className="space-y-3">
            <h2 className="text-3xl font-semibold leading-[1.08] tracking-[-0.025em] md:text-4xl">
              {stringValue(data.heading)}
            </h2>
            <SectionBody value={stringValue(data.body)} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {testimonials.map((testimonial, index) => (
              <article key={index} className="rounded-[1.5rem] border border-[color:var(--cp-border-soft)] bg-background/75 p-5">
                <p className="text-lg leading-8 text-foreground/86">“{stringValue(testimonial.quote)}”</p>
                <div className="mt-4">
                  <p className="text-sm font-semibold">{stringValue(testimonial.name)}</p>
                  <p className="text-sm text-foreground/60">{stringValue(testimonial.role)}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      );
    }
    case "cta-band":
      return (
        <div className="space-y-5 text-center">
          <SectionEyebrow value={stringValue(data.eyebrow)} centered />
          <h2 className="mx-auto max-w-3xl text-3xl font-semibold leading-[1.08] tracking-[-0.025em] md:text-4xl">
            {stringValue(data.heading)}
          </h2>
          <p className="mx-auto max-w-2xl text-base leading-8 text-current/80 md:text-lg">
            {stringValue(data.body)}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <SectionLink label={stringValue(data.primaryCtaLabel)} href={stringValue(data.primaryCtaUrl)} primary />
            <SectionLink label={stringValue(data.secondaryCtaLabel)} href={stringValue(data.secondaryCtaUrl)} />
          </div>
        </div>
      );
    case "rich-text":
      return (
        <div className="space-y-4">
          <SectionEyebrow value={stringValue(data.eyebrow)} />
          <h2 className="text-3xl font-semibold leading-[1.08] tracking-[-0.025em] md:text-4xl">
            {stringValue(data.heading)}
          </h2>
          <SectionBody value={stringValue(data.body)} />
        </div>
      );
  }
}

function MediaPanel({ mediaId, alt }: { mediaId: string; alt: string }) {
  if (!mediaId) {
    return (
      <div className="aspect-[4/3] rounded-[1.75rem] border border-dashed border-[color:var(--cp-border-soft)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--accent)_18%,white_82%),color-mix(in_oklab,var(--background)_75%,white_25%))]" />
    );
  }

  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-[color:var(--cp-border-soft)] bg-card shadow-[var(--cp-shadow-soft)]">
      <MediaImage
        mediaId={mediaId as never}
        alt={alt}
        className="aspect-[4/3] w-full object-cover"
        sizes="(max-width: 1024px) 100vw, 50vw"
      />
    </div>
  );
}

function SectionEyebrow({ value, centered = false }: { value: string; centered?: boolean }) {
  if (!value) return null;
  return (
    <p className={cn(
      "text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--sh-color-text-muted)]",
      centered && "text-center",
    )}>
      {value}
    </p>
  );
}

function SectionBody({ value }: { value: string }) {
  return (
    <div className="space-y-3">
      {splitParagraphs(value).map((paragraph, index) => (
        <p key={index} className="text-base leading-8 text-foreground/78 md:text-lg">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

function SectionLink({
  label,
  href,
  primary = false,
}: {
  label: string;
  href: string;
  primary?: boolean;
}) {
  const safeHref = sanitizeHref(href);
  if (!label || !safeHref) return null;

  const target = isExternalUrl(safeHref) ? "_blank" : undefined;

  return (
    <a
      href={safeHref}
      target={target}
      rel={buildSecureRel(undefined, target)}
      className={cn(
        "inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition-colors",
        primary
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "border border-[color:var(--cp-border-soft)] bg-background/70 text-foreground hover:bg-muted",
      )}
    >
      {label}
    </a>
  );
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function arrayValue<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function splitParagraphs(value: string) {
  return value
    .split(/\n\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function splitLines(value: string) {
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}
