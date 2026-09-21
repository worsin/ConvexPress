import { ArchiveContinuation } from "@/components/blog/ArchiveContinuation";
/**
 * Aster · blog.category — small-caps breadcrumbs, the category in display
 * type with its description and count, subcategories as a row of pills, then
 * posts as feature + rule-separated list.
 */
import { Link } from "@tanstack/react-router";

import type { BlogCategorySurfaceData } from "@/templates/packs/core/surfaces/blog.category";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Breadcrumbs, Container, EmptyState, LinkButton, SectionHeading, SmallCaps } from "../parts";
import { ArchivePosts } from "../parts/extra-commerce";

export default function AsterBlogCategory({ data }: SurfaceProps<BlogCategorySurfaceData>) {
  const { category, slug, ancestors, subcategories, posts, pagination } = data;
  return (
    <Container as="section" data-slot="category-archive" className="flex flex-col gap-14 py-6 md:gap-20 md:py-10">
      <header className="flex flex-col gap-8">
        <Breadcrumbs items={[{ label: "Home", to: "/" }, ...ancestors.map((ancestor) => ({ label: ancestor.name, to: "/category/$slug", params: { slug: ancestor.slug } })), { label: category.name }]} />
        <SectionHeading
          level={1}
          eyebrow="Category"
          title={category.name}
          lede={category.description}
          action={category.count===undefined?undefined:
            <SmallCaps className="tabular-nums">
              {category.count} {category.count === 1 ? "post" : "posts"}
            </SmallCaps>
          }
        />
        {subcategories.length > 0 ? (
          <div data-slot="subcategory-list" className="flex flex-col gap-3 border-t border-border pt-6">
            <SmallCaps as="h2">Subcategories</SmallCaps>
            <ul className="flex flex-wrap items-center gap-2">
              {subcategories.map((sub) => (
                <li key={sub._id}>
                  <Link to="/category/$slug" params={{ slug: sub.slug }} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-foreground transition-colors hover:border-foreground/40 hover:text-primary">
                    {sub.name}
                    {sub.count!==undefined&&<span className="text-[10px] tabular-nums text-muted-foreground">{sub.count}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {data.subcategoryContinuation&&<ArchiveContinuation data={data.subcategoryContinuation}/>}
      </header>

      <ArchivePosts
        posts={posts}
        pagination={pagination}
        getLink={(page) => ({ to: "/category/$slug", params: { slug }, search: page > 1 ? { page } : {} })}
        empty={data.continuation?null:
          <EmptyState
            eyebrow="Nothing yet"
            title="No posts in this category yet."
            action={
              <LinkButton to="/blog" variant="ghost">
                Back to the blog
              </LinkButton>
            }
          />
        }
      />
      {data.continuation&&<ArchiveContinuation data={data.continuation}/>}
    </Container>
  );
}
