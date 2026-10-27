import { describe, expect, test } from "bun:test";

import { getCanonicalUrl } from "./canonical";

const redirectsTo = (url: string) => {
  const result = getCanonicalUrl(url);
  return result.shouldRedirect ? result.canonicalUrl : null;
};

describe("a page's canonical address", () => {
  test("is never sent to a trailing-slash form, and a slashed address isn't redirected", () => {
    // Browsers cached the 301 to "/page/contact/" this middleware used to
    // send; redirecting back would loop for them. Its canonical link names
    // the form without the slash.
    expect(redirectsTo("/page/contact")).toBeNull();
    expect(redirectsTo("/page/contact/")).toBeNull();
    expect(redirectsTo("/pricing?plan=practice")).toBeNull();
    expect(redirectsTo("/")).toBeNull();
  });

  test("is lowercase, without doubled slashes", () => {
    expect(redirectsTo("/Page/Contact")).toBe("/page/contact");
    expect(redirectsTo("/blog//hello")).toBe("/blog/hello");
  });

  test("drops a listing's page 1, but not a page whose slug is 1", () => {
    expect(redirectsTo("/blog/page/1")).toBe("/blog");
    expect(redirectsTo("/blog/page/1/")).toBe("/blog");
    expect(redirectsTo("/Pricing/")).toBe("/pricing/");
    expect(redirectsTo("/page/1")).toBeNull();
  });

  test("leaves files, the API and sign-in routes alone", () => {
    expect(redirectsTo("/sitemap.xml")).toBeNull();
    expect(redirectsTo("/api/feed/")).toBeNull();
    expect(redirectsTo("/login")).toBeNull();
  });
});
