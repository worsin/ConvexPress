import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { observeStickyHeaderOffset } from "./useStickyHeaderOffset";

function fixture(sticky: boolean, mode: "always" | "scroll-up" = "scroll-up") {
  const dom = new JSDOM('<!doctype html><header style="top:0px"><a href="#content">Home</a></header><main id="content"></main>');
  const { window } = dom;
  const header = window.document.querySelector("header")!;
  let height = 64;
  // JSDOM has no layout engine; supply only physical size and scroll position.
  header.getBoundingClientRect = () => ({ height } as DOMRect);
  const stop = observeStickyHeaderOffset(header, sticky, mode);
  const scroll = (y: number) => {
    Object.defineProperty(window, "scrollY", { configurable: true, value: y });
    window.dispatchEvent(new window.Event("scroll"));
  };
  const offset = () => window.document.documentElement.style.getPropertyValue("--site-header-offset");
  return { window, header, scroll, offset, resize: (value: number) => { height = value; window.dispatchEvent(new window.Event("resize")); }, close: () => { stop(); dom.window.close(); }, stop };
}

test("scroll-up hides after downward travel and reveals on reversal with matching anchor offset", () => {
  const f = fixture(true);
  try {
    expect(f.offset()).toBe("64px");
    f.scroll(20); expect(f.header.style.top).toBe("0px");
    f.scroll(160); expect(f.header.style.top).toBe("-64px"); expect(f.offset()).toBe("0px");
    f.scroll(150); expect(f.header.style.top).toBe("0px"); expect(f.offset()).toBe("64px");
    f.scroll(240); f.resize(96); expect(f.header.style.top).toBe("-96px"); expect(f.offset()).toBe("0px");
    f.scroll(0); expect(f.header.style.top).toBe("0px"); expect(f.offset()).toBe("96px");
  } finally { f.close(); }
});

test("keyboard focus reveals the hidden header and keeps focused navigation visible", () => {
  const f = fixture(true);
  try {
    f.scroll(200); expect(f.header.style.top).toBe("-64px");
    f.header.querySelector("a")!.focus(); expect(f.header.style.top).toBe("0px");
    f.scroll(300); expect(f.header.style.top).toBe("0px");
  } finally { f.close(); }
});

test("Always and disabled stickiness do not hide on scrolling", () => {
  for (const [sticky, mode, expectedOffset] of [[true, "always", "64px"], [false, "scroll-up", "0px"]] as const) {
    const f = fixture(sticky, mode);
    try { f.scroll(200); expect(f.header.style.top).toBe("0px"); expect(f.offset()).toBe(expectedOffset); }
    finally { f.close(); }
  }
});

test("cleanup restores header position and removes its scroll and focus listeners", () => {
  const f = fixture(true);
  try {
    f.scroll(200); f.stop(); expect(f.header.style.top).toBe("0px"); expect(f.offset()).toBe("");
    f.scroll(300); expect(f.header.style.top).toBe("0px"); expect(f.offset()).toBe("");
  } finally { f.close(); }
});
