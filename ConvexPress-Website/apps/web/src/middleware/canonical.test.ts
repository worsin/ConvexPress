import { describe, expect, test } from "bun:test";

import { getCanonicalUrl } from "./canonical";

const redirectsTo = (url: string) => {
  const result = getCanonicalUrl(url);
  return result.shouldRedirect ? result.canonicalUrl : null;
};

describe("a page's canonical address", () => {
  test("has no trailing slash: the form every link, canonical link and sitemap entry names", () => {
    expect(redirectsTo("/page/contact")).toBeNull();
    expect(redirectsTo("/page/contact/")).toBe("/page/contact");
    expect(redirectsTo("/help/start-here/signing-up/")).toBe("/help/start-here/signing-up");
    expect(redirectsTo("/pricing//")).toBe("/pricing");
    expect(redirectsTo("/")).toBeNull();
  });

  test("keeps the query string", () => {
    expect(redirectsTo("/pricing/?plan=practice")).toBe("/pricing?plan=practice");
    expect(redirectsTo("/pricing?plan=practice")).toBeNull();
  });

  test("is lowercase, without doubled slashes", () => {
    expect(redirectsTo("/Page/Contact")).toBe("/page/contact");
    expect(redirectsTo("/blog//hello")).toBe("/blog/hello");
  });

  test("drops a listing's page 1, but not a page whose slug is 1", () => {
    expect(redirectsTo("/blog/page/1")).toBe("/blog");
    expect(redirectsTo("/blog/page/1/")).toBe("/blog");
    expect(redirectsTo("/page/1")).toBeNull();
  });

  test("leaves files, the API and sign-in routes alone", () => {
    expect(redirectsTo("/sitemap.xml")).toBeNull();
    expect(redirectsTo("/api/feed/")).toBeNull();
    expect(redirectsTo("/login")).toBeNull();
  });
});
