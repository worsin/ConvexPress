import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { attrsSchema, parseBlockSpec } from "../../../../scripts/blocks/schema.mjs";
import { upcomingEventsAttrsSchema as admin } from "../../../../ConvexPress-Admin/apps/web/src/blocks/upcoming-events/schema";
import { upcomingEventsAttrsSchema as website } from "../../../../ConvexPress-Website/apps/web/src/blocks/upcoming-events/schema";

test("events/upcoming v1 specification preserves existing persisted attributes and defaults", () => {
  const spec = parseBlockSpec(JSON.parse(readFileSync(new URL("../block.json", import.meta.url), "utf8")));
  const schema = attrsSchema(spec.fields);
  expect(spec.name).toBe("events/upcoming");
  expect(spec.version).toBe(1);
  for (const input of [{}, { showDescription: false }, ...spec.examples, { heading: "Aster House gatherings", intro: "Join us for small gatherings and careful observation.", count: 3, showDescription: true, emptyText: "The next gathering is taking shape." }]) {
    expect(schema.parse(input)).toEqual(admin.parse(input));
    expect(schema.parse(input)).toEqual(website.parse(input));
  }
  // Dynamic event IDs/dates are intentionally absent: the resolver owns them.
  expect(schema.safeParse({ events: [{ title: "Invented" }] }).success).toBe(false);
  expect(spec.data).toEqual({ resolver: "events.upcoming", args: { limit: "attrs.count", showDescription: "attrs.showDescription" } });
});
