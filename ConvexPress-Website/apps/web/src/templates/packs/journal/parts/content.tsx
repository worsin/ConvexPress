/**
 * Journal · content parts — pieces shared by the gallery, recipe and auth
 * surfaces that the base vocabulary in index.tsx does not cover (extra.tsx
 * holds the checkout / receipt vocabulary). Same rules: tokens only, display
 * type for titles, rules instead of boxes.
 */

import { Link } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";

import { MediaImage } from "@/components/media/MediaImage";
import { cn } from "@/lib/utils";

import { SmallCaps, UnderlineInput } from "./index";

/* ───────────────────────── hairline grids ───────────────────────── */

const COLUMN_CLASSES: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-2 md:grid-cols-3 lg:grid-cols-5",
  6: "grid-cols-2 md:grid-cols-3 lg:grid-cols-6",
};

/**
 * A grid whose tiles are separated by hairlines: the border colour shows
 * through 1px gaps. Tiles must paint their own `bg-background`.
 */
export function HairlineGrid({ columns = 3, className, ...props }: ComponentProps<"div"> & { columns?: number }) {
  const clamped = Math.max(1, Math.min(6, Math.round(columns)));
  return <div className={cn("grid gap-px overflow-hidden rounded-2xl border border-border bg-border", COLUMN_CLASSES[clamped], className)} {...props} />;
}

/* ───────────────────────── gallery ───────────────────────── */

export interface AlbumTileData {
  _id: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  itemCount?: number;
  coverMedia?: { _id: string } | null;
  categories?: Array<{ _id: string; name: string }>;
}

/** One album in a HairlineGrid: 3:2 cover, small-caps categories, display title. */
export function AlbumTile({ album }: { album: AlbumTileData }) {
  const categories = album.categories ?? [];
  return (
    <article data-slot="journal-album-tile" className="group flex flex-col bg-background">
      <Link to="/gallery/$slug" params={{ slug: album.slug }} className="block overflow-hidden bg-muted" aria-label={album.title}>
        <div className="aspect-[3/2] w-full">
          {album.coverMedia?._id ? (
            <MediaImage
              mediaId={album.coverMedia._id as any}
              alt={album.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              preferredSize="large"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center font-display text-lg text-muted-foreground">{album.title}</div>
          )}
        </div>
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-5">
        {categories.length > 0 ? (
          <p className="flex flex-wrap gap-x-3 gap-y-1">
            {categories.map((category) => (
              <SmallCaps key={category._id}>{category.name}</SmallCaps>
            ))}
          </p>
        ) : null}
        <h2 className="font-display text-xl leading-snug tracking-tight text-foreground">
          <Link to="/gallery/$slug" params={{ slug: album.slug }} className="transition-colors hover:text-primary">
            {album.title}
          </Link>
        </h2>
        {album.excerpt ? <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">{album.excerpt}</p> : null}
        {typeof album.itemCount === "number" ? (
          <SmallCaps className="mt-auto pt-2 tabular-nums">
            {album.itemCount} {album.itemCount === 1 ? "image" : "images"}
          </SmallCaps>
        ) : null}
      </div>
    </article>
  );
}

/* ───────────────────────── recipes ───────────────────────── */

export interface RecipeCardData {
  _id: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  featuredImageId?: string | null;
  categories?: Array<{ _id: string; name: string; slug: string }>;
  totalMinutes?: number | null;
  servings?: number | string | null;
  difficulty?: string | null;
}

/** A recipe in the three-up list: 3:2 image, small-caps categories, display title, meta line, rule below. */
export function RecipeCard({ recipe, className }: { recipe: RecipeCardData; className?: string }) {
  const categories = recipe.categories ?? [];
  const meta = [recipe.totalMinutes ? `${recipe.totalMinutes} min` : null, recipe.servings ? `${recipe.servings} servings` : null, recipe.difficulty ? recipe.difficulty : null].filter(
    (part): part is string => !!part,
  );
  return (
    <article data-slot="journal-recipe-card" className={cn("group flex flex-col gap-4 border-b border-border pb-8", className)}>
      <Link to="/recipes/$slug" params={{ slug: recipe.slug }} className="block overflow-hidden rounded-2xl bg-muted" tabIndex={-1} aria-hidden="true">
        <div className="aspect-[3/2] w-full">
          {recipe.featuredImageId ? (
            <MediaImage
              mediaId={recipe.featuredImageId as any}
              alt={recipe.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              preferredSize="large"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center font-display text-lg text-muted-foreground">{recipe.title}</div>
          )}
        </div>
      </Link>
      {categories.length > 0 ? (
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          {categories.map((category) => (
            <Link key={category._id} to="/recipes/category/$slug" params={{ slug: category.slug }} className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary hover:underline">
              {category.name}
            </Link>
          ))}
        </p>
      ) : null}
      <h3 className="font-display text-2xl leading-snug tracking-tight text-foreground text-balance">
        <Link to="/recipes/$slug" params={{ slug: recipe.slug }} className="transition-colors hover:text-primary">
          {recipe.title}
        </Link>
      </h3>
      {recipe.excerpt ? <p className="line-clamp-3 text-base leading-7 text-muted-foreground">{recipe.excerpt}</p> : null}
      {meta.length > 0 ? <MetaLine parts={meta} /> : null}
    </article>
  );
}

/** Small-caps parts separated by middle dots. */
export function MetaLine({ parts, className }: { parts: ReactNode[]; className?: string }) {
  const visible = parts.filter((part) => part !== null && part !== undefined && part !== false && part !== "");
  if (visible.length === 0) return null;
  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
      {visible.map((part, index) => (
        <span key={index} className="flex items-center gap-x-2">
          {index > 0 ? (
            <span className="text-muted-foreground/60" aria-hidden="true">
              ·
            </span>
          ) : null}
          <SmallCaps className="tabular-nums">{part}</SmallCaps>
        </span>
      ))}
    </p>
  );
}

/* ───────────────────────── forms ───────────────────────── */

/** A small-caps label above an underline input — one field per row. */
export function FormField({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" aria-live="polite">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Underline search line with a text-link submit. Uncontrolled (`name="q"`) unless `value`/`onChange` are given. */
export function SearchLine({
  id,
  label,
  placeholder,
  defaultValue,
  value,
  onChange,
  autoFocus,
  buttonLabel = "Search",
  className,
}: {
  id: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  autoFocus?: boolean;
  buttonLabel?: string;
  className?: string;
}) {
  const controlled = onChange ? { value: value ?? "", onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value) } : { defaultValue };
  return (
    <div className={cn("flex w-full items-end gap-4", className)}>
      <label htmlFor={id} className="min-w-0 flex-1">
        <span className="sr-only">{label}</span>
        <UnderlineInput id={id} name="q" type="search" placeholder={placeholder} autoFocus={autoFocus} {...controlled} />
      </label>
      <button type="submit" className="h-11 shrink-0 text-sm font-medium text-foreground underline decoration-border underline-offset-[6px] transition-colors hover:decoration-foreground">
        {buttonLabel}
      </button>
    </div>
  );
}
