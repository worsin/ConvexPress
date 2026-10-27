import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WidgetPanel } from "./WidgetPanel";
import { homeGreeting } from "./SupportWidget";
import { signInHref } from "../views/TicketFormView";

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

describe("support widget fit", () => {
  test("the panel is as tall as its view, and leaves room for the site's sticky header", () => {
    const html = renderToStaticMarkup(createElement(WidgetPanel, {
      isOpen: true, position: "bottomRight", title: "Support", showBack: false,
      onBack() {}, onClose() {}, children: createElement("p", null, "Home"),
    }));
    expect(html).toContain("max-h-[min(600px,calc(100dvh_-_7rem_-_var(--site-header-offset,0px)))]");
    expect(html.includes(" h-[min(600px")).toBe(false);
  });

  test("a greeting that repeats the panel's title is left out; any other is kept", () => {
    expect(homeGreeting("Support", "Support")).toBeUndefined();
    expect(homeGreeting(" support ", "Support")).toBeUndefined();
    expect(homeGreeting("Questions? We're here.", "Support")).toBe("Questions? We're here.");
    expect(homeGreeting(undefined, "Support")).toBe("Hi! How can we help?");
    expect(homeGreeting("", "Support")).toBe("Hi! How can we help?");
  });
});

describe("support widget for a visitor who isn't signed in", () => {
  test("a new ticket offers sign-in, returning to the page the widget was opened on", () => {
    expect(signInHref("/page/about")).toBe("/login?returnTo=%2Fpage%2Fabout");
    expect(signInHref("/pricing?plan=practice")).toBe("/login?returnTo=%2Fpricing%3Fplan%3Dpractice");
    expect(signInHref("/")).toBe("/login");
  });
});
