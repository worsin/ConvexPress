import { describe, expect, test } from "bun:test";
import { sanitize } from "./html-sanitizer";

describe("portable HTML sanitization", () => {
  test("preserves editorial content, images and tables without a window", () => {
    const clean = sanitize('<h2 class="headline">Aster &amp; House</h2><img src="https://images.example/house.jpg" alt="House"><table><tbody><tr><td colspan="2">Stay</td></tr></tbody></table>');
    expect(clean).toContain('<h2 class="headline">Aster &amp; House</h2>');
    expect(clean).toContain('src="https://images.example/house.jpg"');
    expect(clean).toContain('colspan="2"');
    expect(sanitize(clean)).toBe(clean);
  });
  test("blocks scripts, handler attributes, namespace payloads and encoded URLs", () => {
    for (const html of [
      '<script>alert(1)</script><p>safe</p>',
      '<img src=x onerror="alert(1)">',
      '<a href="java&#x73;cript:alert(1)">safe</a>',
      '<svg><a xlink:href="javascript:alert(1)">click</a></svg>',
      '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=1 onerror=alert(1)>">',
      '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    ]) {
      const clean = sanitize(html);
      // Escaped text inside a quoted title is harmless; assert actual emitted
      // attributes, which the sanitizer always serializes with double quotes.
      expect(/<script|<iframe|<svg|<math|\sonerror\s*=\s*"|href="javascript:/i.test(clean)).toBe(false);
      expect(sanitize(clean)).toBe(clean);
    }
  });
  test("honors restricted search markup and cannot relax safe tag limits", () => {
    expect(sanitize('<mark onclick="alert(1)">Map</mark><img src=x><p>Trail</p>', { ALLOWED_TAGS: ["mark"], ALLOWED_ATTR: [] })).toBe("<mark>Map</mark>Trail");
    expect(sanitize('<script>alert(1)</script><img src=x onerror=alert(1)>', { ALLOWED_TAGS: ["script", "img"], ALLOWED_ATTR: ["onerror", "src"] })).toBe('<img src="x" />');
  });
  test("prevents opener access and protocol-relative resource URLs", () => {
    const clean = sanitize('<a href="https://example.com" target="_blank">Map</a><img src="//evil.example/a">');
    expect(clean).toContain('rel="noopener noreferrer"');
    expect(clean).not.toContain('//evil.example');
  });
});
