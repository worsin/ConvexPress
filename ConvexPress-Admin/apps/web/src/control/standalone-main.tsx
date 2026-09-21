import {
  ConvexBetterAuthProvider,
  type AuthClient,
} from "@convex-dev/better-auth/react";
import {
  createHashHistory,
  createRouter,
} from "@tanstack/react-router";
import { ConvexReactClient } from "convex/react";

import { AdminShellErrorBoundary } from "@/components/layout/AdminShellErrorBoundary";
import ReactDOM from "react-dom/client";

import "../index.css";
import { routeTree } from "../routeTree.gen";
import Loader from "../components/loader";
import { ThemeProvider } from "../components/theme-provider";
import { getElectronBridge, isElectron } from "../lib/electron";
import { ControlClientProvider } from "./ControlShellContext";
import { StandaloneApp } from "./StandaloneApp";
import { createControlAuthClient, signInControlOperator } from "./auth-client";
import { initializeControlAuthStorage } from "./auth-storage";
import { completeControlSetupLogin } from "./setup-login";

export async function bootstrapStandalone(input: {
  controlPlaneUrl: string;
  controlPlaneSiteUrl: string;
  rootElement: HTMLElement;
  pendingLoginCredentials?: unknown;
}) {
  await initializeControlAuthStorage();
  const controlClient = new ConvexReactClient(input.controlPlaneUrl);
  const authClient = createControlAuthClient(input.controlPlaneSiteUrl);
  const setupLoginError = await completeControlSetupLogin({
    credentials: input.pendingLoginCredentials,
    clear: async () => {
      const bridge = getElectronBridge();
      if (!bridge) throw new Error("Native setup storage is unavailable.");
      await bridge.config.set("pendingLoginCredentials", null);
    },
    signIn: (email, password) => signInControlOperator(authClient, email, password),
  });
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
    <AdminShellErrorBoundary>
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
        <ControlClientProvider client={controlClient}>
          <StandaloneApp authClient={authClient} router={router} setupLoginError={setupLoginError} />
        </ControlClientProvider>
      </ConvexBetterAuthProvider>
    </ThemeProvider>
    </AdminShellErrorBoundary>,
  );
}
