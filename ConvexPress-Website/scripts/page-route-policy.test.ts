import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PUBLIC_ROUTE_PATTERNS } from "../../ConvexPress-Admin/packages/backend/convex/helpers/pageRoutePolicy";
test("reserved page policy covers the actual Website route tree without reserving the generic page alias", () => {
 const source = readFileSync(new URL("../apps/web/src/routeTree.gen.ts", import.meta.url), "utf8");
 const paths = [...new Set([...source.matchAll(/fullPath: '([^']+)'/g)].map(match => match[1]))].filter(path => !["/", "/$", "/$slug"].includes(path)).sort();
 expect([...PUBLIC_ROUTE_PATTERNS]).toEqual(paths);
});
