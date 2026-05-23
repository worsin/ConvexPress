/**
 * Home Page Route - /_marketing/
 *
 * Supports two modes based on Reading Settings:
 *   1. Static Front Page: If settings have `showOnFront: "page"` and a designated
 *      `pageOnFront`, renders that page using the Page System's template renderer.
 *   2. Default: Shows the development/health check page (to be replaced with
 *      a blog index or custom home when fully configured).
 *
 * The `getFrontPage` query handles all settings lookup internally.
 */

import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { useQuery } from "convex/react";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import type { PageDetail, BlockDocument } from "@/lib/blog/types";
import { PageRenderer } from "@/components/pages/PageRenderer";
import { Skeleton } from "@/components/ui/skeleton";
import { buildIndexablePageHead } from "@/lib/seo/head";

export const Route = createFileRoute("/_marketing/")({
  loader: async ({ context: { queryClient } }) => {
    const frontPage = await queryClient.ensureQueryData(
      convexQuery(api.pages.queries.getFrontPage, {}),
    );

    return {
      seoHead: buildIndexablePageHead({
        title: frontPage?.title
          ? `${frontPage.title} - ConvexPress`
          : "ConvexPress",
        description: frontPage?.excerpt ?? "ConvexPress website.",
        path: "/",
      }),
    };
  },
  head: ({ loaderData }) => loaderData?.seoHead ?? {},
  component: HomeComponent,
});

const TITLE_TEXT = `
 ██████╗ ███████╗████████╗████████╗███████╗██████╗
 ██╔══██╗██╔════╝╚══██╔══╝╚══██╔══╝██╔════╝██╔══██╗
 ██████╔╝█████╗     ██║      ██║   █████╗  ██████╔╝
 ██╔══██╗██╔══╝     ██║      ██║   ██╔══╝  ██╔══██╗
 ██████╔╝███████╗   ██║      ██║   ███████╗██║  ██║
 ╚═════╝ ╚══════╝   ╚═╝      ╚═╝   ╚══════╝╚═╝  ╚═╝

 ████████╗    ███████╗████████╗ █████╗  ██████╗██╗  ██╗
 ╚══██╔══╝    ██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║ ██╔╝
    ██║       ███████╗   ██║   ███████║██║     █████╔╝
    ██║       ╚════██║   ██║   ██╔══██║██║     ██╔═██╗
    ██║       ███████║   ██║   ██║  ██║╚██████╗██║  ██╗
    ╚═╝       ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝
 `;

function HomeComponent() {
  const healthCheck = useTanStackQuery(convexQuery(api.healthCheck.get, {}));

  // Check if a static front page is configured
  const frontPage = useQuery(api.pages.queries.getFrontPage);

  // If front page query is still loading, show skeleton
  if (frontPage === undefined) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        <Skeleton className="h-8 w-3/4" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    );
  }

  // If a front page is configured and found, render it with the Page System
  if (frontPage) {
    const page: PageDetail = {
      _id: frontPage._id,
      title: frontPage.title,
      slug: frontPage.slug,
      path: frontPage.path ?? "/",
      content: frontPage.content ? (frontPage.content as BlockDocument) : null,
      template: (frontPage.pageTemplate as PageDetail["template"]) ?? "full-width",
      contentMode: (frontPage as { contentMode?: PageDetail["contentMode"] }).contentMode,
      blocks: (frontPage as { blocks?: PageDetail["blocks"] }).blocks,
      blocksVersion: (frontPage as { blocksVersion?: number }).blocksVersion,
      blocksRevision: (frontPage as { blocksRevision?: number }).blocksRevision,
      parentId: frontPage.parentId as string | undefined,
      isPasswordProtected: false,
    };

    return <PageRenderer page={page} />;
  }

  // No static front page configured: show default dev/health check page
  return (
    <div className="container mx-auto max-w-3xl px-4 py-2">
      <pre className="overflow-x-auto font-mono text-sm">{TITLE_TEXT}</pre>
      <div className="grid gap-6">
        <section className="border p-4">
          <h2 className="mb-2 font-medium">API Status</h2>
          <div className="flex items-center gap-2">
            <div
              className={`h-2 w-2 ${healthCheck.data === "OK" ? "bg-accent" : healthCheck.isLoading ? "bg-muted-foreground" : "bg-destructive"}`}
            />
            <span className="text-muted-foreground text-sm">
              {healthCheck.isLoading
                ? "Checking..."
                : healthCheck.data === "OK"
                  ? "Connected"
                  : "Error"}
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
