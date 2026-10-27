import { describe, expect, test } from "bun:test";
import { isRedirect } from "@tanstack/react-router";

import { redirectFrontPageHome, redirectPricingContentPage } from "./front-page";

function outcome(run: () => void): unknown {
  try {
    run();
    return null;
  } catch (error) {
    return error;
  }
}

describe("the static front page's own address", () => {
  test("sends visitors to the homepage, keeping the query string", () => {
    const sent = outcome(() => redirectFrontPageHome({ _id: "home" }, { _id: "home" }, { template: "story" }));
    expect(isRedirect(sent)).toBe(true);
    if (!isRedirect(sent)) return;
    expect(sent.options.to).toBe("/");
    expect(sent.options.search).toEqual({ template: "story" });
  });

  test("leaves any other page, and a homepage of latest posts, where it is", () => {
    expect(outcome(() => redirectFrontPageHome({ _id: "about" }, { _id: "home" }, {}))).toBeNull();
    expect(outcome(() => redirectFrontPageHome({ _id: "home" }, null, {}))).toBeNull();
    expect(outcome(() => redirectFrontPageHome({}, {}, {}))).toBeNull();
  });
});

describe("the pricing content page's own address", () => {
  test("sends visitors to /pricing, keeping the query string", () => {
    const sent = outcome(() => redirectPricingContentPage({ _id: "packages" }, { _id: "packages" }, { utm_source: "mail" }));
    expect(isRedirect(sent)).toBe(true);
    if (!isRedirect(sent)) return;
    expect(sent.options.to).toBe("/pricing");
    expect(sent.options.search).toEqual({ utm_source: "mail" });
  });

  test("leaves any other page where it is, and every page while no pricing content is chosen", () => {
    expect(outcome(() => redirectPricingContentPage({ _id: "about" }, { _id: "packages" }, {}))).toBeNull();
    expect(outcome(() => redirectPricingContentPage({ _id: "packages" }, null, {}))).toBeNull();
    expect(outcome(() => redirectPricingContentPage({}, {}, {}))).toBeNull();
  });
});
