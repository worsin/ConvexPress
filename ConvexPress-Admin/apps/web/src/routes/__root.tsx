import { HeadContent, Outlet, createRootRouteWithContext } from "@tanstack/react-router";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { NotificationToastProvider } from "@/components/notifications/notification-toast-provider";
import { NotFoundTemplate } from "@/templates/NotFoundTemplate";
import { ErrorTemplate } from "@/templates/ErrorTemplate";

import "../index.css";

/**
 * Router context for the Admin SPA.
 *
 * This interface is intentionally empty because:
 * 1. Auth requires Convex queries (useQuery) which need React context
 * 2. beforeLoad runs during routing phase, before React renders
 * 3. Therefore, auth cannot be passed through router context
 *
 * Auth is provided via AuthProvider in the _admin.tsx layout instead.
 * Route-level permission checks use the RoutePermissionGuard component
 * which accesses auth via React context (useAuth hook).
 *
 * @see lib/auth-context.tsx - AuthProvider and useAuth hook
 * @see lib/route-permission-guard.tsx - Component-level permission guard
 */
export interface RouterAppContext {}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  notFoundComponent: NotFoundTemplate,
  errorComponent: ErrorTemplate,
  head: () => ({
    meta: [
      {
        title: "SmithHarper Admin",
      },
      {
        name: "description",
        content: "SmithHarper CMS Admin Panel",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
  }),
});

function RootComponent() {
  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        <NotificationToastProvider>
          <Outlet />
        </NotificationToastProvider>
        <Toaster richColors position="top-right" />
      </ThemeProvider>
    </>
  );
}
