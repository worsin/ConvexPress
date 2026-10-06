import { expect, test } from "bun:test";
import { buildSecureRel, sanitizeHref, sanitizeImageSrc } from "./url";

// Shared URL boundaries still serve navigation/media after the article renderer
// retires. Preserve its adversarial vectors at the surviving helper boundary.
test("navigation rejects active schemes and browser normalization escapes", () => {
  for (const href of ["javascript:alert(1)", "data:text/html,test", "java\nscript:alert(1)", "/\\example.com", "/\n/example.com", "//example.com"])
    expect(sanitizeHref(href)).toBeUndefined();
  for (const href of ["/contact", "#details", "mailto:hello@example.com", "tel:+18005550123", "HTTPS://example.com/contact"])
    expect(sanitizeHref(href)).toBe(href);
});
test("image sources refuse active/local schemes and navigation-only targets", () => {
  for (const src of ["data:image/svg+xml,test", "file:///private/image", "javascript:alert(1)", "#details", "mailto:hello@example.com", "tel:+18005550123"])
    expect(sanitizeImageSrc(src)).toBeUndefined();
  expect(sanitizeImageSrc("https://example.com/image.jpg")).toBe("https://example.com/image.jpg");
});
test("new-window links preserve authored rel while isolating the opener", () => {
  expect(buildSecureRel("nofollow", "_blank")).toBe("nofollow noopener noreferrer");
  expect(buildSecureRel("nofollow noopener", "_blank")).toBe("nofollow noopener noreferrer");
});
