import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WidgetPanel } from "./WidgetPanel";

describe("support widget panel accessibility", () => {
  function render(isOpen: boolean) {
    return renderToStaticMarkup(createElement(WidgetPanel, {
      isOpen, position: "bottomRight", title: "Support", showBack: true,
      onBack() {}, onClose() {}, children: createElement("input", { "aria-label": "Search support" }),
    }));
  }
  test("closed panel exposes neither a dialog nor focusable descendants", () => {
    expect(render(false)).toBe("");
  });
  test("open panel exposes named controls as a nonmodal support dialog", () => {
    const html = render(true);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Support widget"');
    expect(html).toContain('aria-label="Search support"');
    expect(html).toContain('aria-label="Close support widget"');
    expect(html).not.toContain('aria-modal');
  });
});
