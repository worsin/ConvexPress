import { useEffect, useRef } from "react";

export const HEADER_OFFSET_PROPERTY = "--site-header-offset";

/** Shared by pack headers: includes optional bars, wrapped text and responsive height. */
export function observeStickyHeaderOffset(
  header: HTMLElement,
  sticky: boolean,
  mode: "always" | "scroll-up" | "none" = "always",
): () => void {
  const root = header.ownerDocument.documentElement;
  const view = header.ownerDocument.defaultView;
  const previous = root.style.getPropertyValue(HEADER_OFFSET_PROPERTY);
  const directional = sticky && mode === "scroll-up";
  const previousTop = header.style.top;
  let lastY = Math.max(0, view?.scrollY ?? 0);
  let hidden = false;
  const update = () => {
    if (directional) {
      header.style.top = hidden ? `-${header.getBoundingClientRect().height}px` : previousTop || "0px";
    }
    const top = view ? Number.parseFloat(view.getComputedStyle(header).top) || 0 : 0;
    const offset = sticky ? Math.max(0, header.getBoundingClientRect().height + top) : 0;
    root.style.setProperty(HEADER_OFFSET_PROPERTY, `${Math.ceil(offset)}px`);
  };
  const reveal = () => { hidden = false; update(); };
  const onScroll = () => {
    const y = Math.max(0, view?.scrollY ?? 0);
    const delta = y - lastY;
    if (y <= header.getBoundingClientRect().height || header.contains(header.ownerDocument.activeElement)) {
      reveal();
    } else if (Math.abs(delta) >= 4) {
      hidden = delta > 0;
      update();
    } else {
      return; // Accumulate small deltas so trackpad noise does not flicker the header.
    }
    lastY = y;
  };
  update();
  if (directional) {
    view?.addEventListener("scroll", onScroll, { passive: true });
    header.addEventListener("focusin", reveal);
  }
  const observer = view?.ResizeObserver ? new view.ResizeObserver(update) : null;
  observer?.observe(header);
  view?.addEventListener("resize", update);
  return () => {
    observer?.disconnect();
    if (directional) {
      view?.removeEventListener("scroll", onScroll);
      header.removeEventListener("focusin", reveal);
      header.style.top = previousTop;
    }
    view?.removeEventListener("resize", update);
    if (previous) root.style.setProperty(HEADER_OFFSET_PROPERTY, previous);
    else root.style.removeProperty(HEADER_OFFSET_PROPERTY);
  };
}

export function useStickyHeaderOffset(sticky: boolean, mode: "always" | "scroll-up" | "none" = "always") {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (ref.current) return observeStickyHeaderOffset(ref.current, sticky, mode);
  }, [sticky, mode]);
  return ref;
}
