import { expect, test } from "bun:test";
import { staticFrontPageId } from "../frontPage";

test("the reading settings' static front page, with the keys older data used", () => {
  expect(staticFrontPageId({ homepageDisplays: "static_page", homepageId: "home" })).toBe("home");
  expect(staticFrontPageId({ showOnFront: "page", pageOnFront: "legacy" })).toBe("legacy");
  // A static page with no page chosen falls back to the older keys, as before.
  expect(staticFrontPageId({ homepageDisplays: "static_page", homepageId: "", showOnFront: "page", pageOnFront: "legacy" })).toBe("legacy");
});

test("no front page while the homepage shows the latest posts, or for unusable values", () => {
  expect(staticFrontPageId({ homepageDisplays: "latest_posts", homepageId: "home" })).toBeNull();
  expect(staticFrontPageId({ showOnFront: "posts", pageOnFront: "legacy" })).toBeNull();
  expect(staticFrontPageId({ homepageDisplays: "static_page", homepageId: 7 })).toBeNull();
  expect(staticFrontPageId(undefined)).toBeNull();
  expect(staticFrontPageId("static_page")).toBeNull();
});
