import type { ConvexQueryClient } from "@convex-dev/react-query";
import type { QueryClient } from "@tanstack/react-query";

import { StrictMode } from "react";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { ConvexProviderWithClerk } from "convex/react-clerk";

import { Toaster } from "@/components/ui/sonner";
import { WebsiteNotificationToastProvider } from "@/components/notifications/WebsiteNotificationToastProvider";
import { NotFoundTemplate } from "@/templates/NotFoundTemplate";
import { ErrorTemplate } from "@/templates/ErrorTemplate";
import { SupportWidget } from "@/components/support/widget/SupportWidget";

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
        title: "ConvexPress",
      },
      {
        name: "description",
        content: "ConvexPress - A modern content management system",
      },
      {
        name: "robots",
        content: "index, follow",
      },
      // Open Graph site-wide defaults (overridden by child routes)
      {
        property: "og:site_name",
        content: "ConvexPress",
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
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:wght@400;600;700&display=swap",
      },
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
    <StrictMode>
      <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
        <ConvexProviderWithClerk
          client={convexQueryClient.convexClient}
          useAuth={useAuth}
        >
          <html lang="en" suppressHydrationWarning>
            <head>
              <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}})()` }} />
              <HeadContent />
            </head>
            <body className="min-h-svh" suppressHydrationWarning>
              <WebsiteNotificationToastProvider>
                <Outlet />
              </WebsiteNotificationToastProvider>
              <SupportWidget />
              <Toaster richColors />
              <Scripts />
            </body>
          </html>
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </StrictMode>
  );
}
