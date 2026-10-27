import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// A static public/robots.txt is served before the request middleware, so the
// site's robots settings (and "Discourage search engines") would never apply.
test("robots.txt is the dynamic route's, not a static file", () => {
  expect(existsSync(fileURLToPath(new URL("../../../public/robots.txt", import.meta.url)))).toBe(false);
});
