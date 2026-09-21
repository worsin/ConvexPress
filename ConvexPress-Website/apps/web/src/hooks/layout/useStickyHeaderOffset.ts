import { useEffect, useRef } from "react";

export const HEADER_OFFSET_PROPERTY = "--site-header-offset";

/** Shared by pack headers: includes optional bars, wrapped text and responsive height. */
export function observeStickyHeaderOffset(header: HTMLElement, sticky: boolean): () => void {
  const root = header.ownerDocument.documentElement;
  const view = header.ownerDocument.defaultView;
  const previous = root.style.getPropertyValue(HEADER_OFFSET_PROPERTY);
  const update = () => {
    const top = view ? Number.parseFloat(view.getComputedStyle(header).top) || 0 : 0;
    const offset = sticky ? Math.max(0, header.getBoundingClientRect().height + top) : 0;
    root.style.setProperty(HEADER_OFFSET_PROPERTY, `${Math.ceil(offset)}px`);
  };
  update();
  const observer = view?.ResizeObserver ? new view.ResizeObserver(update) : null;
  observer?.observe(header);
  view?.addEventListener("resize", update);
  return () => {
    observer?.disconnect();
    view?.removeEventListener("resize", update);
    if (previous) root.style.setProperty(HEADER_OFFSET_PROPERTY, previous);
    else root.style.removeProperty(HEADER_OFFSET_PROPERTY);
  };
}

export function useStickyHeaderOffset(sticky: boolean) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (ref.current) return observeStickyHeaderOffset(ref.current, sticky);
  }, [sticky]);
  return ref;
}
