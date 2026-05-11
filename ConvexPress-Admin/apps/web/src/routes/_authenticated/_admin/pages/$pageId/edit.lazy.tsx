/**
 * Edit Page - Lazy-loaded component
 *
 * Loads an existing page by ID via Convex query and initializes
 * the EditorLayout with the page data.
 */

import { createLazyFileRoute, Link, useParams } from "@tanstack/react-router";
import { EditorLayout } from "@/components/editor/EditorLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { usePage } from "@/hooks/pages/usePage";
import { usePageMutations } from "@/hooks/pages/usePageMutations";
import type { Id } from "@backend/convex/_generated/dataModel";

export const Route = createLazyFileRoute(
  "/_authenticated/_admin/pages/$pageId/edit",
)({
  component: EditPagePage,
});

function EditPagePage() {
  const { pageId } = useParams({
    from: "/_authenticated/_admin/pages/$pageId/edit",
  });

  const { page, isLoading, notFound } = usePage({
    pageId: pageId as Id<"posts">,
  });
  const { restorePage } = usePageMutations();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-6 w-96" />
            <Skeleton className="h-[400px] w-full" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-[200px] w-full" />
            <Skeleton className="h-[100px] w-full" />
            <Skeleton className="h-[100px] w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !page) {
    return (
      <div className="py-12 text-center">
        <h1 className="text-lg font-semibold text-foreground mb-2">
          Page Not Found
        </h1>
        <p className="text-sm text-muted-foreground mb-4">
          The page you are looking for does not exist or has been deleted.
        </p>
        <Link
          to="/pages"
          className="text-sm text-primary hover:underline"
        >
          Back to All Pages
        </Link>
      </div>
    );
  }

  if (page.status === "trash") {
    return (
      <div className="py-12 text-center">
        <h1 className="text-lg font-semibold text-foreground mb-2">
          Page is in Trash
        </h1>
        <p className="text-sm text-muted-foreground mb-4">
          This page has been moved to the trash. Restore it to continue editing.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            type="button"
            onClick={async () => {
              await restorePage(pageId as Id<"posts">, page.title);
            }}
            className="text-sm text-primary hover:underline"
          >
            Restore Page
          </button>
          <Link
            to="/pages"
            className="text-sm text-muted-foreground hover:underline"
          >
            Back to All Pages
          </Link>
        </div>
      </div>
    );
  }

  // Map Convex page data to EditorFormValues shape
  const initialData = {
    title: page.title ?? "",
    slug: page.slug ?? "",
    content: page.content ?? "",
    excerpt: page.excerpt ?? "",
    status: page.status ?? "draft",
    visibility: page.visibility ?? "public",
    password: page.password ?? "",
    commentStatus: (page.commentStatus as "open" | "closed") ?? "closed",
    isSticky: false, // Pages don't support sticky (post-only feature)
    featuredImageId: page.featuredImageId ?? null,
    authorId: page.authorId ?? "",
    scheduledFor: page.scheduledAt ? new Date(page.scheduledAt) : null,
    categoryIds: [] as string[],
    tagIds: [] as string[],
    menuOrder: page.menuOrder ?? 0,
    // Structured content fields
    hero: (page as any).hero
      ? {
          title: (page as any).hero.title ?? "",
          subtitle: (page as any).hero.subtitle ?? "",
          content: (page as any).hero.content ?? "",
          imageId: (page as any).hero.imageId ?? null,
          videoUrl: (page as any).hero.videoUrl ?? "",
          ctaText: (page as any).hero.ctaText ?? "",
          ctaUrl: (page as any).hero.ctaUrl ?? "",
        }
      : { title: "", subtitle: "", content: "", imageId: null, videoUrl: "", ctaText: "", ctaUrl: "" },
    topics: ((page as any).topics ?? []).map((t: any) => ({
      title: t.title ?? "",
      subtitle: t.subtitle ?? "",
      content: t.content ?? "",
      imageId: t.imageId ?? null,
      videoUrl: t.videoUrl ?? "",
    })),
    summary: (page as any).summary
      ? { title: (page as any).summary.title ?? "", content: (page as any).summary.content ?? "" }
      : { title: "", content: "" },
    sources: (page as any).sources ?? "",
    tableOfContents: (page as any).tableOfContents ?? "",
    pagePrompt: (page as any).pagePrompt ?? "",
  };

  return (
    <EditorLayout
      contentType="page"
      mode="edit"
      postId={pageId}
      initialData={initialData}
      publishedAt={(page as { publishedAt?: number }).publishedAt ?? null}
    />
  );
}
