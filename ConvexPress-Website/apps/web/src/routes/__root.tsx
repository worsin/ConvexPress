import type { ConvexQueryClient } from "@convex-dev/react-query";
import type { QueryClient } from "@tanstack/react-query";

import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { ConvexProviderWithClerk } from "convex/react-clerk";

import { Toaster } from "@/components/ui/sonner";
import { NotFoundTemplate } from "@/templates/NotFoundTemplate";
import { ErrorTemplate } from "@/templates/ErrorTemplate";

import appCss from "../index.css?url";

export interface RouterAppContext {
  queryClient: QueryClient;
  convexQueryClient: ConvexQueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  notFoundComponent: NotFoundTemplate,
  errorComponent: ErrorTemplate,
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "SmithHarper",
      },
      {
        name: "description",
        content: "SmithHarper - A modern content management system",
      },
      {
        name: "robots",
        content: "index, follow",
      },
      // Open Graph site-wide defaults (overridden by child routes)
      {
        property: "og:site_name",
        content: "SmithHarper",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        property: "og:locale",
        content: "en_US",
      },
      // Twitter Card defaults
      {
        name: "twitter:card",
        content: "summary_large_image",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "alternate",
        type: "application/rss+xml",
        title: "RSS Feed",
        href: "/api/feed",
      },
      {
        rel: "alternate",
        type: "application/atom+xml",
        title: "Atom Feed",
        href: "/api/feed/atom",
      },
      {
        rel: "alternate",
        type: "application/rss+xml",
        title: "Comments RSS Feed",
        href: "/api/comments/feed",
      },
    ],
  }),

  component: RootDocument,
});

function RootDocument() {
  const { convexQueryClient } = Route.useRouteContext();
  return (
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
      <ConvexProviderWithClerk
        client={convexQueryClient.convexClient}
        useAuth={useAuth}
      >
        <html lang="en" className="dark" suppressHydrationWarning>
          <head>
            <HeadContent />
          </head>
          <body className="min-h-svh" suppressHydrationWarning>
            <Outlet />
            <Toaster richColors />
            <Scripts />
          </body>
        </html>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
