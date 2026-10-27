import { describe, expect, test } from "bun:test";
import { isRedirect } from "@tanstack/react-router";

import { redirectFrontPageHome } from "./front-page";

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
