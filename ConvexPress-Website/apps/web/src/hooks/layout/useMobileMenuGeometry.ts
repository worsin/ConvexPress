import { useLayoutEffect, useState, type CSSProperties } from "react";
import type { HeaderConfig } from "@/lib/layout/types";
import { cn } from "@/lib/utils";

/** Position dropdowns below the currently visible header, including non-sticky headers. */
export function useMobileMenuGeometry(config: HeaderConfig["mobileMenu"] | undefined, open: boolean, drawerClass = "w-72") {
  const variant = config?.variant ?? "drawer";
  const right = config?.drawerSide === "right";
  const [headerBottom, setHeaderBottom] = useState(0);
  useLayoutEffect(() => {
    if (!open || variant !== "dropdown") return;
    const header = document.querySelector<HTMLElement>('[data-slot="site-header"]');
    const update = () => setHeaderBottom(Math.max(0, Math.min(window.innerHeight, header?.getBoundingClientRect().bottom ?? 0)));
    update();
    const observer = window.ResizeObserver ? new window.ResizeObserver(update) : null;
    if (header) observer?.observe(header);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true });
    return () => { observer?.disconnect(); window.removeEventListener("resize", update); window.removeEventListener("scroll", update); };
  }, [open, variant]);

  const dropdown = variant === "dropdown";
  const fullscreen = variant === "fullscreen";
  const style: CSSProperties | undefined = dropdown
    ? { top: headerBottom, maxHeight: `calc(100dvh - ${headerBottom}px)` }
    : undefined;
  return {
    variant,
    style,
    className: cn(
      dropdown ? "inset-x-0 w-full" : fullscreen ? "inset-0 w-full" : cn("inset-y-0 max-w-[88vw]", drawerClass, right ? "right-0" : "left-0"),
      open ? "translate-x-0 translate-y-0" : dropdown || fullscreen ? "-translate-y-full" : right ? "translate-x-full" : "-translate-x-full",
    ),
  };
}
