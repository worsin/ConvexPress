import { expect, test } from "bun:test";
import { eventListWindow, eventNextPageHref, eventWindowStart } from "./window";
test("event page links retain the same time boundary with opaque cursors", () => {
 const first = eventListWindow({}, 125_001);
 expect(first).toEqual({ startsAtOrAfter: 120_000, cursor: undefined });
 const href = eventNextPageHref("opaque+/=cursor", first.startsAtOrAfter);
 const search = new URL(href, "https://example.test").searchParams;
 const next = eventListWindow({ cursor: search.get("cursor")!, startsAtOrAfter: Number(search.get("startsAtOrAfter")) }, 240_001);
 expect(next).toEqual({ cursor: "opaque+/=cursor", startsAtOrAfter: 120_000 });
});
test("old unanchored links restart safely and block windows change only at a minute boundary", () => {
 expect(eventListWindow({ cursor: "old-unanchored-cursor" }, 125_000)).toEqual({ cursor: undefined, startsAtOrAfter: 120_000 });
 expect(eventWindowStart(179_999)).toBe(120_000);
 expect(eventWindowStart(180_000)).toBe(180_000);
});
