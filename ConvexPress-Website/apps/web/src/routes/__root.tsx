import { convexQuery, type ConvexQueryClient } from "@convex-dev/react-query";
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
import { api } from "@convexpress-website/backend/generated/api";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { getSiteRuntime, siteRuntimeBootstrapScript } from "@/lib/site-runtime";

import appCss from "../index.css?url";
import { resolveSiteName, rememberSiteName } from "@/lib/seo/head";

export interface RouterAppContext {
  queryClient: QueryClient;
  convexQueryClient: ConvexQueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  notFoundComponent: NotFoundTemplate,
  errorComponent: ErrorTemplate,
  // Learn the site's name before any route head is rendered on the server.
  loader: async ({ context: { queryClient } }) => {
    try {
      const settings = (await queryClient.ensureQueryData(
        convexQuery(api.settings.queries.getPublic, {}),
      )) as { siteTitle?: string } | null;
      rememberSiteName(settings?.siteTitle);
    } catch {
      // Settings unavailable: titles fall back to the generic name.
    }
  },
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
        title: resolveSiteName(),
      },
      {
        name: "description",
        content: `${resolveSiteName()} website`,
      },
      {
        name: "robots",
        content: "index, follow",
      },
      // Open Graph site-wide defaults (overridden by child routes)
      {
        property: "og:site_name",
        content: resolveSiteName(),
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
  const siteRuntime = getSiteRuntime();
  const clerkPublishableKey =
    siteRuntime.clerkPublishableKey ?? import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  return (
    <StrictMode>
      <ClerkProvider publishableKey={clerkPublishableKey}>
        <ConvexProviderWithClerk
          client={convexQueryClient.convexClient}
          useAuth={useAuth}
        >
          <html lang="en" suppressHydrationWarning>
            <head>
              {/* Site identity for this process; read by getSiteRuntime() on the client. */}
              <script
                dangerouslySetInnerHTML={{ __html: siteRuntimeBootstrapScript(siteRuntime) }}
              />
              <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}})()` }} />
              <HeadContent />
            </head>
            <body className="min-h-svh" suppressHydrationWarning>
              <SettingsProvider>
                <WebsiteNotificationToastProvider>
                  <Outlet />
                </WebsiteNotificationToastProvider>
                <SupportWidget />
              </SettingsProvider>
              <Toaster richColors />
              <Scripts />
            </body>
          </html>
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </StrictMode>
  );
}
