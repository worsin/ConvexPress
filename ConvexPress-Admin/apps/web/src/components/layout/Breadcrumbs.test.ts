import { describe, expect, test } from "bun:test";

import { looksLikeRecordId } from "@/lib/admin-shell/breadcrumb-titles";
import { deriveBreadcrumbs } from "./Breadcrumbs";

describe("breadcrumbs", () => {
  test("a record id reads as its registered title, else Details", () => {
    const id = "ts8vg9c1mjnmdg8hy3qgfq0ee58g90jk";
    expect(looksLikeRecordId(id)).toBe(true);
    expect(looksLikeRecordId("order-forms")).toBe(false);
    expect(looksLikeRecordId("pricingcardsandmoreandmoreandmore")).toBe(false);

    const path = `/commerce/subscriptions/contracts/${id}`;
    expect(deriveBreadcrumbs(path).map((segment) => segment.label)).toEqual([
      "Dashboard", "Commerce", "Subscriptions", "Contracts", "Details",
    ]);
    expect(deriveBreadcrumbs(path, new Map([[id, "Avery Quinn"]])).at(-1)).toEqual({ label: "Avery Quinn", to: undefined });
    expect(deriveBreadcrumbs("/commerce/subscriptions/dunning").at(-1)?.label).toBe("Failed Payments");
    expect(deriveBreadcrumbs("/kb/help").map((segment) => segment.label)).toEqual(["Dashboard", "Knowledge Base", "In-app help"]);
    expect(deriveBreadcrumbs("/kb/health").at(-1)?.label).toBe("Content health");
    expect(deriveBreadcrumbs(`/kb/${id}/edit`, new Map([[id, "Uploading documents"]])).map((segment) => segment.label)).toEqual([
      "Dashboard", "Knowledge Base", "Uploading documents", "Edit",
    ]);
  });
});
