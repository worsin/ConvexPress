import { RouterProvider, createRouter, createHashHistory } from "@tanstack/react-router";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import ReactDOM from "react-dom/client";

import { AdminGate } from "./components/auth/AdminGate";
import type { AdminGateProps } from "./components/auth/AdminGate";
import Loader from "./components/loader";
import { useLocalAuth, setConvexSiteUrl } from "./hooks/useLocalAuth";
import { isElectron, getElectronBridge } from "./lib/electron";
import { LocalAuthProvider } from "./lib/local-auth-context";
import { routeTree } from "./routeTree.gen";

// ---- Electron-specific: use hash-based routing for file:// protocol ---------

const history = isElectron() ? createHashHistory() : undefined;

// ---- Async bootstrap --------------------------------------------------------
// In Electron, config values live in electron-store (IPC, async).
// In web mode, everything comes from import.meta.env (sync).

interface BootstrapConfig {
  convexUrl: string;
  convexSiteUrl: string;
  electronMode?: "server" | "client";
  pendingCredentials?: AdminGateProps["pendingCredentials"];
}

async function resolveConfig(): Promise<BootstrapConfig> {
  if (isElectron()) {
    const bridge = getElectronBridge()!;
    const convexUrl = (await bridge.config.get("convexUrl")) as string;
    const convexSiteUrl = (await bridge.config.get("convexSiteUrl")) as
      | string
      | undefined;
    const electronMode = (await bridge.config.get("mode")) as
      | "server"
      | "client"
      | undefined;
    const pending = (await bridge.config.get("pendingAdminCredentials")) as
      | AdminGateProps["pendingCredentials"]
      | null;

    // In dev mode, the electron-store may be empty (fresh install / no setup
    // wizard completed yet). Fall back to Vite env vars so the app can still
    // boot and render the setup wizard or login screen.
    const resolvedConvexUrl =
      convexUrl || import.meta.env.VITE_CONVEX_URL;
    const resolvedSiteUrl =
      convexSiteUrl || import.meta.env.VITE_CONVEX_SITE_URL || resolvedConvexUrl;

    return {
      convexUrl: resolvedConvexUrl,
      convexSiteUrl: resolvedSiteUrl,
      electronMode,
      pendingCredentials: pending ?? undefined,
    };
  }

  // Web mode -- env vars
  return {
    convexUrl: import.meta.env.VITE_CONVEX_URL,
    convexSiteUrl: import.meta.env.VITE_CONVEX_SITE_URL,
  };
}

async function bootstrap() {
  const config = await resolveConfig();

  // Set the site URL before any React rendering so the useLocalAuth hook
  // can use it for HTTP auth endpoints (login, refresh, logout).
  setConvexSiteUrl(config.convexSiteUrl);

  const convex = new ConvexReactClient(config.convexUrl);

  const router = createRouter({
    routeTree,
    history,
    defaultPreload: "intent",
    defaultPendingComponent: () => <Loader />,
    context: {},
    Wrap: function WrapComponent({ children }: { children: React.ReactNode }) {
      const auth = useLocalAuth();
      const useSharedAuth = () => auth;

      // AdminGate needs LocalAuthProvider context, so it must be INSIDE the
      // provider tree, not wrapping it.
      const gatedChildren = isElectron() ? (
        <AdminGate
          mode={config.electronMode}
          pendingCredentials={config.pendingCredentials}
        >
          {children}
        </AdminGate>
      ) : (
        children
      );

      return (
        <ConvexProviderWithAuth client={convex} useAuth={useSharedAuth}>
          <LocalAuthProvider value={auth}>{gatedChildren}</LocalAuthProvider>
        </ConvexProviderWithAuth>
      );
    },
  });

  const rootElement = document.getElementById("app");
  if (!rootElement) {
    throw new Error("Root element not found");
  }

  if (!rootElement.innerHTML) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(<RouterProvider router={router} />);
  }
}

bootstrap();
