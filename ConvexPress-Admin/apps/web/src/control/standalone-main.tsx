import {
  ConvexBetterAuthProvider,
  type AuthClient,
} from "@convex-dev/better-auth/react";
import {
  createHashHistory,
  createRouter,
} from "@tanstack/react-router";
import { ConvexReactClient } from "convex/react";
import ReactDOM from "react-dom/client";

import "../index.css";
import { routeTree } from "../routeTree.gen";
import Loader from "../components/loader";
import { ThemeProvider } from "../components/theme-provider";
import { isElectron } from "../lib/electron";
import { StandaloneApp } from "./StandaloneApp";
import { createControlAuthClient } from "./auth-client";
import { initializeControlAuthStorage } from "./auth-storage";

export async function bootstrapStandalone(input: {
  controlPlaneUrl: string;
  controlPlaneSiteUrl: string;
  rootElement: HTMLElement;
}) {
  await initializeControlAuthStorage();
  const controlClient = new ConvexReactClient(input.controlPlaneUrl);
  const authClient = createControlAuthClient(input.controlPlaneSiteUrl);
  const router = createRouter({
    routeTree,
    history: isElectron() ? createHashHistory() : undefined,
    defaultPreload: "intent",
    defaultPendingComponent: () => <Loader />,
    context: {},
  });
  const root = ReactDOM.createRoot(input.rootElement);
  root.render(
    // The theme must exist before the router mounts so the operator login and
    // the loading states render in the viewer's chosen mode, not a flash.
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      disableTransitionOnChange
      storageKey="vite-ui-theme"
    >
      <ConvexBetterAuthProvider
        client={controlClient}
        authClient={authClient as unknown as AuthClient}
      >
        <StandaloneApp authClient={authClient} router={router} />
      </ConvexBetterAuthProvider>
    </ThemeProvider>,
  );
}
