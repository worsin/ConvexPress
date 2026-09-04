/**
 * Journal · page — a page from the Pages system. Variants map to measure:
 * default / no-sidebar = centred Prose; full-width = Container; landing = no
 * top padding, blocks own the layout; blank = nothing but blocks; sidebar-* =
 * a 7/5 grid with the child-page list in the narrow column.
 *
 * An explicit template variant wins; otherwise the page's own `template`
 * decides (`sidebar-right` counts as a sidebar layout with the column right).
 */
import { Link } from "@tanstack/react-router";

import { BlockContentRenderer } from "@/components/blog/BlockContentRenderer";
import { BlockListRenderer } from "@/components/blocks/BlockListRenderer";
import { pageSectionsToBlocks } from "@/lib/blocks/page-sections";
import type { PageDetail } from "@/lib/blog/types";
import { cn } from "@/lib/utils";
import type { PageSurfaceData } from "@/templates/packs/core/surfaces/page";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Breadcrumbs, Container, Prose, SmallCaps } from "../parts";

type Layout = "default" | "sidebar-left" | "sidebar-right" | "full-width" | "no-sidebar" | "landing" | "blank";

const LAYOUTS = new Set<Layout>(["default", "sidebar-left", "sidebar-right", "full-width", "no-sidebar", "landing", "blank"]);

const HERO_BLOCKS = new Set(["core/hero", "core/hero-split", "core/hero-text-only", "blocks/page-banner"]);

function opensWithHero(page: PageDetail): boolean {
  if (page.contentMode !== "blocks") return false;
  const first = page.blocks?.[0];
  return !!first && HERO_BLOCKS.has(first.name);
}

export default function JournalPage({ data, variant }: SurfaceProps<PageSurfaceData>) {
  const { page, className } = data;
  const requested = (variant && LAYOUTS.has(variant as Layout) ? variant : page.template ?? "default") as Layout;
  const children = page.children ?? [];
  const hasChildren = children.length > 0;
  const layout: Layout = (requested === "sidebar-left" || requested === "sidebar-right") && !hasChildren ? "default" : requested;

  if (layout === "blank") {
    return (
      <div data-slot="template-blank" className={className}>
        <Blocks page={page} />
      </div>
    );
  }

  if (layout === "landing") {
    return (
      <Container as="main" data-slot="template-landing" className={cn("pb-14 md:pb-20", className)}>
        <Body page={page} />
      </Container>
    );
  }

  if (layout === "full-width") {
    return (
      <Container as="main" data-slot="template-full-width" className={cn("flex flex-col gap-10 py-14 md:py-20", className)}>
        <PageBreadcrumbs page={page} />
        <Body page={page} />
        {hasChildren ? <ChildPages pages={children} /> : null}
      </Container>
    );
  }

  if (layout === "sidebar-left" || layout === "sidebar-right") {
    const aside = (
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <ChildPages pages={children} />
      </aside>
    );
    return (
      <Container as="main" data-slot={`template-${layout}`} className={cn("flex flex-col gap-10 py-14 md:py-20", className)}>
        <PageBreadcrumbs page={page} />
        <div className={cn("grid gap-10 lg:gap-16", layout === "sidebar-left" ? "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" : "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]")}>
          {layout === "sidebar-left" ? aside : null}
          <div className="min-w-0">
            <Body page={page} />
          </div>
          {layout === "sidebar-right" ? aside : null}
        </div>
      </Container>
    );
  }

  // default / no-sidebar: the reading measure, centred.
  return (
    <Container as="main" data-slot={`template-${layout}`} className={cn("py-14 md:py-20", className)}>
      <Prose className="flex flex-col gap-10">
        <PageBreadcrumbs page={page} />
        <Body page={page} />
        {hasChildren ? <ChildPages pages={children} /> : null}
      </Prose>
    </Container>
  );
}

function PageBreadcrumbs({ page }: { page: PageDetail }) {
  if (!page.breadcrumbs || page.breadcrumbs.length <= 1) return null;
  const ancestors = page.breadcrumbs.slice(0, -1);
  return (
    <Breadcrumbs
      items={[{ label: "Home", to: "/" }, ...ancestors.map((ancestor) => ({ label: ancestor.title, to: `/page${ancestor.path}` })), { label: page.title }]}
    />
  );
}

function Body({ page }: { page: PageDetail }) {
  const showTitle = !opensWithHero(page);
  return (
    <article data-slot="page-content" className="flex flex-col gap-8">
      {page.featuredImageUrl ? (
        <figure className="overflow-hidden rounded-2xl bg-muted">
          <img src={page.featuredImageUrl} alt={page.featuredImageAlt ?? page.title} className="aspect-[3/2] w-full object-cover" loading="eager" />
        </figure>
      ) : null}
      {showTitle ? <h1 className="font-display text-4xl leading-[1.02] tracking-tight text-foreground text-balance md:text-6xl">{page.title}</h1> : null}
      <div className="text-base leading-8 text-muted-foreground md:text-[17px]">
        <Blocks page={page} />
      </div>
    </article>
  );
}

function Blocks({ page }: { page: PageDetail }) {
  if (page.contentMode === "blocks") {
    return <BlockListRenderer blocks={page.blocks && page.blocks.length > 0 ? page.blocks : pageSectionsToBlocks(page.pageSections)} />;
  }
  if (page.content) return <BlockContentRenderer content={page.content} />;
  return <p className="py-8 text-center text-sm text-muted-foreground">This page has no content yet.</p>;
}

function ChildPages({ pages }: { pages: NonNullable<PageDetail["children"]> }) {
  if (pages.length === 0) return null;
  return (
    <nav data-slot="page-children-list" aria-label="Pages in this section" className="flex flex-col gap-4">
      <SmallCaps as="h2">In this section</SmallCaps>
      <ul className="flex flex-col divide-y divide-border border-y border-border">
        {pages.map((child) => (
          <li key={child._id}>
            <Link to={`/page${child.path}` as any} className="block py-3 text-base text-foreground transition-colors hover:text-primary">
              {child.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
