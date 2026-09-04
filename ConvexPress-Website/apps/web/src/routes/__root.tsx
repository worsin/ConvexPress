import { convexQuery, type ConvexQueryClient } from "@convex-dev/react-query";
import type { QueryClient } from "@tanstack/react-query";

import { StrictMode } from "react";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  type ErrorComponentProps,
  type NotFoundRouteProps,
} from "@tanstack/react-router";
import { ClerkProvider, useAuth } from "@/lib/auth/clerk";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { AuthConfigProvider } from "@/contexts/AuthConfigContext";
import { coerceAuthConfig, defaultWebsiteAuthConfig, type WebsiteAuthConfig } from "@/lib/auth/capabilities";

import { Toaster } from "@/components/ui/sonner";
import { WebsiteNotificationToastProvider } from "@/components/notifications/WebsiteNotificationToastProvider";
import CoreError from "@/templates/packs/core/surfaces/system.error";
import CoreNotFound from "@/templates/packs/core/surfaces/system.notFound";
import { Surface } from "@/templates/sdk/Surface";
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

/** Bare 404 outside the marketing chrome; the active template pack may restyle it. */
function RootNotFound(props: NotFoundRouteProps) {
  return <Surface name="system.notFound" data={{ kind: "root", data: props.data }} fallback={CoreNotFound} />;
}

/** Runtime error screen; the active template pack may restyle it. */
function RootError({ error, reset }: ErrorComponentProps) {
  return <Surface name="system.error" data={{ error, reset }} fallback={CoreError} />;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  notFoundComponent: RootNotFound,
  errorComponent: RootError,
  // Learn the site's name and its sign-in provider before anything renders on
  // the server: the Clerk publishable key comes from the site database first,
  // so one build serves every site (env vars stay as fallbacks).
  loader: async ({ context: { queryClient } }): Promise<{ authConfig: WebsiteAuthConfig }> => {
    try {
      const settings = (await queryClient.ensureQueryData(
        convexQuery(api.settings.queries.getPublic, {}),
      )) as { siteTitle?: string } | null;
      rememberSiteName(settings?.siteTitle);
    } catch {
      // Settings unavailable: titles fall back to the generic name.
    }
    let authConfig = defaultWebsiteAuthConfig();
    try {
      authConfig = coerceAuthConfig(
        await queryClient.ensureQueryData(
          convexQuery((api as any).auth.clerkPublic.getWebsiteAuthConfig, {}),
        ),
      );
    } catch {
      // Older backends: fall back to environment-provided keys.
    }
    return { authConfig };
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
  const loaderData = Route.useLoaderData() as { authConfig?: WebsiteAuthConfig } | undefined;
  const authConfig = loaderData?.authConfig ?? defaultWebsiteAuthConfig();
  const processRuntime = getSiteRuntime();
  // Site database → process env → build-time env.
  const clerkPublishableKey =
    authConfig.publishableKey ??
    processRuntime.clerkPublishableKey ??
    (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined);
  const siteRuntime = { ...processRuntime, clerkPublishableKey };
  return (
    <StrictMode>
      <ClerkProvider
        publishableKey={clerkPublishableKey}
        signInUrl="/login"
        signUpUrl="/register"
        signInFallbackRedirectUrl="/dashboard"
        signUpFallbackRedirectUrl="/dashboard"
        afterSignOutUrl="/"
      >
        <AuthConfigProvider value={authConfig}>
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
        </AuthConfigProvider>
      </ClerkProvider>
    </StrictMode>
  );
}
