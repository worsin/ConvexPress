/**
 * Depot · blog.category — a category archive: breadcrumbs through the
 * ancestors, a title row with the count, subcategories as chips, then the
 * posts as `PostCard` rows in two columns with numbered pagination.
 */
import { Link } from "@tanstack/react-router";

import type { BlogCategorySurfaceData } from "@/templates/packs/core/surfaces/blog.category";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Breadcrumbs, Container, EmptyState, Label, Pagination, Toolbar, buttonClasses } from "../parts";
import { PageHeader, PostRows } from "../parts/extra";

export default function DepotBlogCategory({ data }: SurfaceProps<BlogCategorySurfaceData>) {
  const { category, slug, ancestors, subcategories, posts, pagination } = data;
  return (
    <Container padded={false} data-slot="category-archive" className="flex flex-col gap-4 py-6 md:py-8">
      <Breadcrumbs
        items={[
          { label: "Home", to: "/" },
          ...ancestors.map((ancestor) => ({ label: ancestor.name, to: "/category/$slug", params: { slug: ancestor.slug } })),
          { label: category.name },
        ]}
      />

      <PageHeader label="Category" title={category.name} description={category.description} meta={`${category.count} ${category.count === 1 ? "post" : "posts"}`} />

      {subcategories.length > 0 && (
        <Toolbar label="Subcategories">
          <Label className="mr-1">Subcategories</Label>
          {subcategories.map((sub) => (
            <Link key={sub._id} to="/category/$slug" params={{ slug: sub.slug }} className={buttonClasses("secondary", "sm")}>
              {sub.name} <span className="tabular-nums text-muted-foreground">{sub.count}</span>
            </Link>
          ))}
        </Toolbar>
      )}

      <PostRows posts={posts} empty={<EmptyState title="No posts in this category yet." />} />

      {pagination && pagination.totalPages > 1 && (
        <Pagination page={pagination.currentPage} totalPages={pagination.totalPages} linkFor={(page) => (page === 1 ? { to: `/category/${slug}` } : { to: `/category/${slug}`, search: { page } })} />
      )}
    </Container>
  );
}
