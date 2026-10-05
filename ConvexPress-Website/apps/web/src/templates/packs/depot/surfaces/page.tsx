import { PublicCanonicalBody } from "@/templates/sdk/block-public/PublicCanonicalBody";
/**
 * Depot · page — a page laid out by measure.
 *
 * `default` / `no-sidebar` = Prose; `full-width` / `landing` / `blank` =
 * Container; `sidebar-left` / `sidebar-right` = 9/3 grid with the children
 * list in the narrow column. Variant selection matches Core: an explicit
 * template variant wins, otherwise the page's own `template` field.
 */
import { Link } from "@tanstack/react-router";

import { PageBreadcrumbs } from "@/components/pages/PageBreadcrumbs";
import type { PageDetail } from "@/lib/blog/types";
import { cn } from "@/lib/utils";
import type { PageSurfaceData } from "@/templates/packs/core/surfaces/page";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Card, Container, Label, Prose } from "../parts";

const VARIANTS = ["default", "sidebar-right", "sidebar-left", "full-width", "no-sidebar", "landing", "blank"] as const;
type PageVariant = (typeof VARIANTS)[number];

export default function DepotPage({ data, variant }: SurfaceProps<PageSurfaceData>) {
  const { page, className } = data;
  const requested = variant && (VARIANTS as readonly string[]).includes(variant) ? variant : (page.template ?? "default");
  const id = ((VARIANTS as readonly string[]).includes(requested) ? requested : "default") as PageVariant;
  const crumbs = page.breadcrumbs && page.breadcrumbs.length > 1 ? <PageBreadcrumbs breadcrumbs={page.breadcrumbs} currentTitle={page.title} /> : null;
  const children = page.children && page.children.length > 0 ? page.children : null;

  if (id === "blank") {
    return (
      <div data-slot="template-blank" data-pack="depot" className={className}>
        <PageBody page={page} title={false} />
      </div>
    );
  }

  if (id === "landing") {
    return (
      <Container padded={false} className={cn("py-6 md:py-8", className)} data-slot="template-landing">
        <PageBody page={page} />
      </Container>
    );
  }

  if (id === "full-width") {
    return (
      <Container padded={false} className={cn("flex flex-col gap-4 py-6 md:py-8", className)} data-slot="template-full-width">
        {crumbs}
        <PageBody page={page} />
        {children && <ChildrenList items={children} />}
      </Container>
    );
  }

  if (id === "sidebar-left" || id === "sidebar-right") {
    const left = id === "sidebar-left";
    const aside = (
      <aside className="flex flex-col gap-3 lg:col-span-3">
        {children ? <ChildrenList items={children} /> : null}
      </aside>
    );
    return (
      <Container padded={false} className={cn("flex flex-col gap-4 py-6 md:py-8", className)} data-slot={`template-${id}`}>
        {crumbs}
        <div className="grid gap-6 lg:grid-cols-12">
          {left && aside}
          <div className="min-w-0 lg:col-span-9">
            <PageBody page={page} />
          </div>
          {!left && aside}
        </div>
      </Container>
    );
  }

  // default / no-sidebar: reading measure, children below
  return (
    <Prose className={cn("flex flex-col gap-4 py-6 md:py-8", className)} data-slot={id === "no-sidebar" ? "template-no-sidebar" : "template-default"}>
      {crumbs}
      <PageBody page={page} />
      {children && <ChildrenList items={children} />}
    </Prose>
  );
}

/** Featured image, title (unless a hero block carries it) and the blocks / TipTap body. */
function PageBody({ page, title = true }: { page: PageDetail; title?: boolean }) {
  return (
    <article data-slot="page-content" className="flex flex-col gap-4">
      {page.featuredImageUrl && (
        <figure className="overflow-hidden rounded-md border border-border bg-muted">
          <img src={page.featuredImageUrl} alt={page.featuredImageAlt ?? page.title} className="aspect-video w-full object-cover" loading="eager" />
        </figure>
      )}
        <PublicCanonicalBody documentId={page._id} renderLayout={(body, hasHero) => <>
          {title && !hasHero && <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{page.title}</h1>}
          {body}
        </>} />
    </article>
  );
}

function ChildrenList({ items }: { items: NonNullable<PageDetail["children"]> }) {
  return (
    <Card as="nav" data-slot="page-children-list" className="flex flex-col gap-2 p-3">
      <Label as="h2">Pages in this section</Label>
      <ul className="flex flex-col divide-y divide-border">
        {items.map((child) => (
          <li key={child._id}>
            <Link to={`/page${child.path}`} className="block py-2 text-[13px] text-foreground transition-colors hover:text-primary">
              {child.title}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
