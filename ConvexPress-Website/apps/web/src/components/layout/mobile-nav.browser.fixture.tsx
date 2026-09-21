/** Offline acceptance harness: the real Core drawer and layout state. */
import { createRoot } from "react-dom/client";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { LayoutShellProvider, getBackgroundInertProps } from "./LayoutShellProvider";
import { useLayoutShell } from "@/hooks/layout/useLayoutShell";
import { MobileNav } from "./MobileNav";

function Fixture() {
  const shell = useLayoutShell();
  return <>
    <main {...getBackgroundInertProps(shell.mobileNavOpen)}>
      <button onClick={shell.toggleMobileNav}>Open navigation menu</button>
      <a href="#after">Background link</a>
    </main>
    <MobileNav siteIdentity={{title: "Navigation fixture", tagline: ""}} menu={{id: "fixture", name: "Fixture", slug: "fixture", items: [
      {id: "first", label: "First destination", url: "#first", type: "custom", depth: 0, children: []},
      {id: "last", label: "Last destination", url: "#last", type: "custom", depth: 0, children: []},
    ]}} />
  </>;
}
const routeTree = createRootRoute({component: () => <LayoutShellProvider><Fixture /></LayoutShellProvider>});
const router = createRouter({routeTree, history: createMemoryHistory({initialEntries: ["/"]})});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
