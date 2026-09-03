import { describe, expect, test } from "bun:test";

import {
  buildSections,
  flattenRows,
  groupWebsites,
  moveHighlight,
  pushRecentWebsite,
  websiteMatches,
  type SwitcherInput,
} from "./site-switcher-model";

const input: SwitcherInput = {
  organizations: [
    { organizationId: "org-a", name: "Northstar Group" },
    { organizationId: "org-b", name: "Client Studios" },
  ],
  businesses: [
    { businessId: "biz-1", organizationId: "org-a", name: "Northstar Commerce" },
    { businessId: "biz-2", organizationId: "org-a", name: "Summit Services" },
    { businessId: "biz-3", organizationId: "org-b", name: "Studio One" },
    { businessId: "biz-empty", organizationId: "org-b", name: "No Sites Yet" },
  ],
  websites: [
    { websiteId: "w-shop", businessId: "biz-1", organizationId: "org-a", title: "Northstar Shop", primaryDomain: "northstarshop.com" },
    { websiteId: "w-journal", businessId: "biz-1", organizationId: "org-a", title: "Northstar Journal", primaryDomain: "journal.northstar.com" },
    { websiteId: "w-summit", businessId: "biz-2", organizationId: "org-a", title: "Summit Main", primaryDomain: "summitservices.co" },
    { websiteId: "w-studio", businessId: "biz-3", organizationId: "org-b", title: "Studio Site", primaryDomain: "studio.example" },
  ],
  environments: [],
};

describe("site switcher model", () => {
  test("groups websites under organization and business, keeping empty businesses selectable", () => {
    const groups = groupWebsites(input);
    expect(groups.map((group) => group.key)).toEqual([
      "org-a:biz-1",
      "org-a:biz-2",
      "org-b:biz-3",
      "org-b:biz-empty",
    ]);
    expect(groups[0].websites.map((w) => w.websiteId)).toEqual(["w-shop", "w-journal"]);
  });

  test("expands the selected organization and folds the others", () => {
    const sections = buildSections(input, {
      query: "",
      selectedWebsiteId: "w-shop",
      selectedOrganizationId: "org-a",
      expandedOrganizationIds: new Set(),
      recentWebsiteIds: [],
    });
    expect(sections.map((section) => [section.kind, section.title])).toEqual([
      ["group", "Northstar Group › Northstar Commerce"],
      ["group", "Northstar Group › Summit Services"],
      ["folded", "Client Studios"],
    ]);
    expect(sections[2].summary).toBe("2 businesses · 1 site");
  });

  test("recent websites appear first and never include the current website", () => {
    const sections = buildSections(input, {
      query: "",
      selectedWebsiteId: "w-shop",
      selectedOrganizationId: "org-a",
      expandedOrganizationIds: new Set(),
      recentWebsiteIds: ["w-shop", "w-studio", "missing", "w-journal"],
    });
    expect(sections[0].kind).toBe("recent");
    expect(sections[0].websites.map((w) => w.websiteId)).toEqual(["w-studio", "w-journal"]);
  });

  test("searching flattens every match under its full path", () => {
    const sections = buildSections(input, {
      query: "  NORTH ",
      selectedWebsiteId: null,
      selectedOrganizationId: "org-b",
      expandedOrganizationIds: new Set(),
      recentWebsiteIds: ["w-studio"],
    });
    expect(sections.length).toBe(1);
    expect(sections[0].title).toBe("Northstar Group › Northstar Commerce");
    expect(sections[0].websites.length).toBe(2);
    expect(websiteMatches(input.websites[3], "studio.example")).toBe(true);
  });

  test("flatten produces keyboard rows including folded organizations", () => {
    const rows = flattenRows(
      buildSections(input, {
        query: "",
        selectedWebsiteId: "w-shop",
        selectedOrganizationId: "org-a",
        expandedOrganizationIds: new Set(),
        recentWebsiteIds: [],
      }),
    );
    expect(rows.map((row) => row.kind)).toEqual(["website", "website", "website", "folded"]);
    expect(moveHighlight(-1, 1, rows.length)).toBe(0);
    expect(moveHighlight(0, -1, rows.length)).toBe(3);
    expect(moveHighlight(3, 1, rows.length)).toBe(0);
    expect(moveHighlight(0, 1, 0)).toBe(-1);
  });

  test("an expanded organization lists an empty business as a selectable row", () => {
    const rows = flattenRows(
      buildSections(input, {
        query: "",
        selectedWebsiteId: null,
        selectedOrganizationId: "org-b",
        expandedOrganizationIds: new Set(),
        recentWebsiteIds: [],
      }),
    );
    const business = rows.find((row) => row.kind === "business");
    expect(business?.kind).toBe("business");
    expect(business && business.kind === "business" ? business.title : "").toBe("No Sites Yet");
    const searched = flattenRows(
      buildSections(input, {
        query: "no sites",
        selectedWebsiteId: null,
        selectedOrganizationId: null,
        expandedOrganizationIds: new Set(),
        recentWebsiteIds: [],
      }),
    );
    expect(searched.map((row) => row.kind)).toEqual(["business"]);
  });

  test("recent list is deduplicated and capped", () => {
    expect(pushRecentWebsite(["b", "a"], "a", 2)).toEqual(["a", "b"]);
    expect(pushRecentWebsite(["a", "b", "c"], "d", 3)).toEqual(["d", "a", "b"]);
  });
});
