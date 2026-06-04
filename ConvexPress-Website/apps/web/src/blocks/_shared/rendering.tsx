import { MediaImage } from "@/components/media/MediaImage";
import type { Id } from "@convexpress-website/backend/generated/dataModel";

export function SectionIntro({
  eyebrow,
  heading,
  body,
}: {
  eyebrow?: string;
  heading?: string;
  body?: string;
}) {
  if (!eyebrow && !heading && !body) return null;
  return (
    <div className="mx-auto max-w-3xl space-y-4 text-center">
      {eyebrow && (
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          {eyebrow}
        </p>
      )}
      {heading && (
        <h2 className="text-3xl font-semibold leading-tight text-foreground md:text-4xl">
          {heading}
        </h2>
      )}
      {body && (
        <RichText
          text={body}
          className="mx-auto max-w-2xl text-muted-foreground"
        />
      )}
    </div>
  );
}

export function RichText({
  text,
  className = "text-muted-foreground",
}: {
  text: string;
  className?: string;
}) {
  if (!text) return null;
  return (
    <div className={`space-y-3 text-sm leading-7 md:text-base ${className}`}>
      {text.split(/\n{2,}/).map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  );
}

export function BlockMedia({
  mediaId,
  alt,
  className = "h-full w-full object-cover",
  sizes = "100vw",
  preferredSize = "large",
}: {
  mediaId: string;
  alt?: string;
  className?: string;
  sizes?: string;
  preferredSize?: "thumbnail" | "medium" | "medium_large" | "large";
}) {
  if (!mediaId) return null;
  return (
    <MediaImage
      mediaId={mediaId as Id<"media">}
      alt={alt}
      className={className}
      sizes={sizes}
      preferredSize={preferredSize}
    />
  );
}

export function CtaLink({
  label,
  href,
  primary = false,
}: {
  label?: string;
  href?: string;
  primary?: boolean;
}) {
  if (!label || !href) return null;
  return (
    <a
      href={href}
      className={
        primary
          ? "inline-flex min-h-11 items-center rounded-md border border-primary bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          : "inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-semibold text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      }
    >
      {label}
    </a>
  );
}

export function productGridClass(columns: number) {
  if (columns <= 2) return "grid gap-4 md:grid-cols-2";
  if (columns === 3) return "grid gap-4 md:grid-cols-3";
  return "grid gap-4 md:grid-cols-2 lg:grid-cols-4";
}
