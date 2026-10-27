import { ConvexQueryClient } from "@convex-dev/react-query";
import { QueryClient } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { ConvexHttpClient } from "convex/browser";

import Loader from "./components/loader";
import { getRequestConvexUrl, getSiteRuntime } from "./lib/site-runtime";
import { ErrorTemplate } from "./templates/packs/core/parts/runtime-error";
import CoreNotFound from "./templates/packs/core/surfaces/system.notFound";
import { Surface } from "./templates/sdk/Surface";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const { convexUrl } = getSiteRuntime();
  if (!convexUrl) {
    throw new Error(
      "No Convex deployment configured. Set CONVEXPRESS_CONVEX_URL (or VITE_CONVEX_URL) for this storefront process.",
    );
  }

  const convexQueryClient = new ConvexQueryClient(convexUrl);
  // A server render reads the backend at its private address when one is set
  // (lib/site-runtime.ts); the browser keeps the public one.
  const serverUrl = getRequestConvexUrl();
  if (typeof window === "undefined" && serverUrl && serverUrl !== convexUrl) {
    convexQueryClient.serverHttpClient = new ConvexHttpClient(serverUrl);
  }

  const queryClient: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
      },
    },
  });
  convexQueryClient.connect(queryClient);

  const router = createTanStackRouter({
    routeTree,
    defaultPreload: "intent",
    // Avoid forcing slash normalization redirects that can loop with stale browser redirect cache.
    trailingSlash: "preserve",
    defaultPendingComponent: () => <Loader />,
    defaultErrorComponent: ({ error, reset }) => <ErrorTemplate error={error} reset={reset} />,
    // A route whose loader found nothing (notFound()) shows the active pack's
    // in-layout 404, with search, which also logs the hit for the 404 report.
    defaultNotFoundComponent: () => <Surface name="system.notFound" data={{ kind: "page" }} fallback={CoreNotFound} />,
    context: { queryClient, convexQueryClient },
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
