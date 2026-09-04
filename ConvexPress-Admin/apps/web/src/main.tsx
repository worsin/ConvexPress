import { RouterProvider, createRouter, createHashHistory } from "@tanstack/react-router";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { ConvexQueryCacheProvider } from "convex-helpers/react/cache";
import ReactDOM from "react-dom/client";

import { resolveControlPlaneEndpoints } from "./bootstrap-config";
import { AdminShellErrorBoundary } from "@/components/layout/AdminShellErrorBoundary";
import { AdminGate } from "./components/auth/AdminGate";
import type { AdminGateProps } from "./components/auth/AdminGate";
import Loader from "./components/loader";
import { useLocalAuth, setConvexSiteUrl } from "./hooks/useLocalAuth";
import {
  isPendingAdminCredentialHandoff,
  isPendingLoginCredentialHandoff,
} from "./lib/first-admin-setup";
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
  controlPlaneUrl?: string;
  controlPlaneSiteUrl?: string;
  electronMode?: "server" | "client";
  pendingCredentials?: AdminGateProps["pendingCredentials"];
  pendingLoginCredentials?: AdminGateProps["pendingLoginCredentials"];
}

function deriveConvexSiteUrl(convexUrl: string | undefined): string | undefined {
  if (!convexUrl) return undefined;

  const cleaned = convexUrl.trim().replace(/\/+$/, "");
  try {
    const url = new URL(cleaned);
    if (url.hostname.endsWith(".convex.cloud")) {
      url.hostname = url.hostname.replace(/\.convex\.cloud$/, ".convex.site");
      return url.toString().replace(/\/+$/, "");
    }
  } catch {
    return cleaned;
  }

  return cleaned;
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
    const pending = await bridge.config.get("pendingAdminCredentials");
    const pendingLogin = await bridge.config.get("pendingLoginCredentials");
    const pendingCredentials = isPendingAdminCredentialHandoff(pending)
      ? pending
      : undefined;
    const pendingLoginCredentials =
      isPendingLoginCredentialHandoff(pendingLogin)
        ? pendingLogin
        : undefined;

    if (pending && !pendingCredentials) {
      await bridge.config.set("pendingAdminCredentials", null);
    }
    if (pendingLogin && !pendingLoginCredentials) {
      await bridge.config.set("pendingLoginCredentials", null);
    }

    // In dev mode, the electron-store may be empty (fresh install / no setup
    // wizard completed yet). Fall back to Vite env vars so the app can still
    // boot and render the setup wizard or login screen.
    const resolvedConvexUrl =
      convexUrl || import.meta.env.VITE_CONVEX_URL;
    const resolvedSiteUrl =
      convexSiteUrl ||
      import.meta.env.VITE_CONVEX_SITE_URL ||
      deriveConvexSiteUrl(resolvedConvexUrl) ||
      resolvedConvexUrl;

    const controlPlane = resolveControlPlaneEndpoints({
      isElectron: true,
      standaloneEnabled:
        import.meta.env.VITE_STANDALONE_CONTROL_PLANE === "true",
      configuredConvexUrl: resolvedConvexUrl,
      configuredConvexSiteUrl: resolvedSiteUrl,
      environmentControlPlaneUrl: import.meta.env.VITE_CONTROL_PLANE_URL,
      environmentControlPlaneSiteUrl:
        import.meta.env.VITE_CONTROL_PLANE_SITE_URL,
    });

    return {
      convexUrl: resolvedConvexUrl,
      convexSiteUrl: resolvedSiteUrl,
      ...controlPlane,
      electronMode,
      pendingCredentials,
      pendingLoginCredentials,
    };
  }

  // Web mode -- env vars
  return {
    convexUrl: import.meta.env.VITE_CONVEX_URL,
    convexSiteUrl:
      import.meta.env.VITE_CONVEX_SITE_URL ||
      deriveConvexSiteUrl(import.meta.env.VITE_CONVEX_URL) ||
      import.meta.env.VITE_CONVEX_URL,
    controlPlaneUrl: import.meta.env.VITE_CONTROL_PLANE_URL,
    controlPlaneSiteUrl:
      import.meta.env.VITE_CONTROL_PLANE_SITE_URL ||
      deriveConvexSiteUrl(import.meta.env.VITE_CONTROL_PLANE_URL),
  };
}

async function bootstrap() {
  const config = await resolveConfig();

  const rootElement = document.getElementById("app");
  if (!rootElement) {
    throw new Error("Root element not found");
  }

  if (config.controlPlaneUrl && config.controlPlaneSiteUrl) {
    const { bootstrapStandalone } = await import("./control/standalone-main");
    await bootstrapStandalone({
      controlPlaneUrl: config.controlPlaneUrl,
      controlPlaneSiteUrl: config.controlPlaneSiteUrl,
      rootElement,
    });
    return;
  }

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
      // provider tree. It handles Electron pending credentials and also lets a
      // fresh web install create the first admin account before the login gate.
      const gatedChildren = (
        <AdminGate
          mode={config.electronMode}
          pendingCredentials={config.pendingCredentials}
          pendingLoginCredentials={config.pendingLoginCredentials}
        >
          {children}
        </AdminGate>
      );

      return (
        <ConvexProviderWithAuth client={convex} useAuth={useSharedAuth}>
          <ConvexQueryCacheProvider expiration={300_000} maxIdleEntries={250}>
            <LocalAuthProvider value={auth}>{gatedChildren}</LocalAuthProvider>
          </ConvexQueryCacheProvider>
        </ConvexProviderWithAuth>
      );
    },
  });

  if (!rootElement.innerHTML) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <AdminShellErrorBoundary>
        <RouterProvider router={router} />
      </AdminShellErrorBoundary>,
    );
  }
}

/**
 * A failed boot must never be a blank window. Anything thrown before React
 * renders (config resolution, the standalone bootstrap, a crashed client)
 * is written into the root as a readable error with the controller address.
 */
function renderBootFailure(error: unknown) {
  const rootElement = document.getElementById("app");
  if (!rootElement) return;
  const message = error instanceof Error ? error.message : String(error);
  const controller = import.meta.env.VITE_CONVEX_URL ?? "the configured controller";
  rootElement.innerHTML = "";
  const box = document.createElement("div");
  box.setAttribute("role", "alert");
  box.style.cssText = "max-width:560px;margin:15vh auto;padding:24px 28px;font:14px/1.5 system-ui,sans-serif;color:var(--foreground,#1a1a1a);background:var(--card,#fff);border:1px solid var(--border,#ddd);border-radius:12px";
  const title = document.createElement("h1");
  title.style.cssText = "font-size:18px;margin:0 0 8px";
  title.textContent = "ConvexPress could not start";
  const body = document.createElement("p");
  body.style.margin = "0 0 12px";
  body.textContent = `The admin could not reach ${controller}. Check that the controller is running and that this app is pointed at it, then reopen the app.`;
  const detail = document.createElement("pre");
  detail.style.cssText = "white-space:pre-wrap;font-size:12px;padding:10px 12px;border-radius:8px;background:var(--muted,#f4f4f4);margin:0";
  detail.textContent = message;
  box.append(title, body, detail);
  rootElement.append(box);
}

window.addEventListener("error", (event) => {
  const rootElement = document.getElementById("app");
  if (rootElement && !rootElement.innerHTML.trim()) renderBootFailure(event.error ?? event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  const rootElement = document.getElementById("app");
  if (rootElement && !rootElement.innerHTML.trim()) renderBootFailure(event.reason);
});

bootstrap().catch(renderBootFailure);
