import { ConvexQueryClient } from "@convex-dev/react-query";
import { QueryClient } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { env } from "@convexpress-website/env/web";

import Loader from "./components/loader";
import { ErrorTemplate } from "./templates/ErrorTemplate";
import { NotFoundTemplate } from "./templates/NotFoundTemplate";
import "./index.css";
import { routeTree } from "./routeTree.gen";

export function getRouter(): any {
  const convexUrl = env.VITE_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("VITE_CONVEX_URL is not set");
  }

  const convexQueryClient = new ConvexQueryClient(convexUrl);

  const queryClient: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
      },
    },
  });
  convexQueryClient.connect(queryClient);

  const router: any = createTanStackRouter({
    routeTree,
    defaultPreload: "intent",
    // Avoid forcing slash normalization redirects that can loop with stale browser redirect cache.
    trailingSlash: "preserve",
    defaultPendingComponent: () => <Loader />,
    defaultErrorComponent: ({ error, reset }) => <ErrorTemplate error={error} reset={reset} />,
    defaultNotFoundComponent: () => <NotFoundTemplate />,
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
