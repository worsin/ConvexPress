import { RouterProvider, createRouter } from "@tanstack/react-router";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import ReactDOM from "react-dom/client";

import Loader from "./components/loader";
import { useLocalAuth } from "./hooks/useLocalAuth";
import { LocalAuthProvider } from "./lib/local-auth-context";
import { routeTree } from "./routeTree.gen";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultPendingComponent: () => <Loader />,
  context: {},
  Wrap: function WrapComponent({ children }: { children: React.ReactNode }) {
    const auth = useLocalAuth();

    return (
      <ConvexProviderWithAuth client={convex} useAuth={useLocalAuth}>
        <LocalAuthProvider value={auth}>
          {children}
        </LocalAuthProvider>
      </ConvexProviderWithAuth>
    );
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("app");

if (!rootElement) {
  throw new Error("Root element not found");
}

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<RouterProvider router={router} />);
}
