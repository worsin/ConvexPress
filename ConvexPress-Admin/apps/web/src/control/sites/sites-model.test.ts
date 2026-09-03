import { describe, expect, test } from "bun:test";

import {
  attentionItems,
  buildPortfolioTree,
  countPortfolio,
  filterPortfolioTree,
  nodeForSelection,
  suggestManagementOrigin,
  suggestSiteOrigin,
  type TreeInput,
} from "./sites-model";

const input: TreeInput = {
  organizations: [
    { organizationId: "org-a", name: "Northstar Group", slug: "northstar" },
    { organizationId: "org-b", name: "Client Studios", slug: "client-studios" },
  ],
  businesses: [
    { businessId: "biz-1", organizationId: "org-a", name: "Northstar Commerce", slug: "northstar-commerce" },
    { businessId: "biz-2", organizationId: "org-b", name: "Studio One", slug: "studio-one" },
  ],
  websites: [
    { websiteId: "w-shop", businessId: "biz-1", organizationId: "org-a", websiteKey: "northstar:shop", title: "Northstar Shop", primaryDomain: "northstarshop.com", isDefault: true },
    { websiteId: "w-journal", businessId: "biz-1", organizationId: "org-a", websiteKey: "northstar:journal", title: "Northstar Journal", primaryDomain: "journal.northstar.com", isDefault: false },
    { websiteId: "w-studio", businessId: "biz-2", organizationId: "org-b", websiteKey: "studio:site", title: "Studio Site", primaryDomain: "studio.example", isDefault: true },
  ],
  environments: [
    { instanceId: "e-staging", websiteId: "w-shop", instanceKey: "northstar:shop:staging", kind: "staging", label: "Staging", deploymentOrigin: "http://192.168.1.246:4830", managementOrigin: "http://192.168.1.246:4831", siteOrigin: "https://staging.northstarshop.com", health: "ok", compatibility: "compatible", isDefault: false },
    { instanceId: "e-live", websiteId: "w-shop", instanceKey: "northstar:shop:live", kind: "live", label: null, deploymentOrigin: "http://192.168.1.246:4820", managementOrigin: "http://192.168.1.246:4821", siteOrigin: "https://northstarshop.com", health: "unreachable", compatibility: "compatible", isDefault: true },
    { instanceId: "e-journal", websiteId: "w-journal", instanceKey: "northstar:journal:live", kind: "live", label: null, deploymentOrigin: "http://192.168.1.246:4840", managementOrigin: "http://192.168.1.246:4841", siteOrigin: "https://journal.northstar.com", health: "unknown", compatibility: "unknown", isDefault: true },
  ],
};

describe("sites model", () => {
  test("builds the tree with live environments first", () => {
    const tree = buildPortfolioTree(input);
    expect(tree.length).toBe(2);
    const shop = tree[0].businesses[0].websites[0];
    expect(shop.environments.map((e) => e.kind)).toEqual(["live", "staging"]);
    expect(countPortfolio(tree)).toEqual({
      organizations: 2,
      businesses: 2,
      websites: 3,
      environments: 3,
      live: 2,
    });
  });

  test("filters by title, domain, key, or deployment origin, keeping parents", () => {
    const tree = buildPortfolioTree(input);
    expect(filterPortfolioTree(tree, "journal")[0].businesses[0].websites.map((w) => w.websiteId)).toEqual(["w-journal"]);
    expect(filterPortfolioTree(tree, "4830")[0].businesses[0].websites.map((w) => w.websiteId)).toEqual(["w-shop"]);
    expect(filterPortfolioTree(tree, "client").map((o) => o.organizationId)).toEqual(["org-b"]);
    expect(filterPortfolioTree(tree, "zzz").length).toBe(0);
    expect(filterPortfolioTree(tree, "  ").length).toBe(2);
  });

  test("attention list orders incompatible, unreachable, degraded, unknown", () => {
    const items = attentionItems(buildPortfolioTree(input));
    expect(items.map((item) => item.reason)).toEqual(["Unreachable", "Health never checked"]);
    expect(items[0].tone).toBe("live");
  });

  test("launch node follows the deepest selected scope", () => {
    expect(nodeForSelection({ websiteId: "w", businessId: "b", organizationId: "o" })).toEqual({ type: "website", id: "w" });
    expect(nodeForSelection({ websiteId: null, businessId: "b", organizationId: "o" })).toEqual({ type: "business", id: "b" });
    expect(nodeForSelection({ websiteId: null, businessId: null, organizationId: null })).toEqual({ type: "overview" });
  });

  test("suggests origins for cloud and self-hosted deployments", () => {
    expect(suggestManagementOrigin("https://happy-otter-123.convex.cloud/")).toBe("https://happy-otter-123.convex.site");
    expect(suggestManagementOrigin("http://192.168.1.246:4820")).toBe("http://192.168.1.246:4821");
    expect(suggestManagementOrigin("nope")).toBe("");
    expect(suggestSiteOrigin("Shop.Example.com")).toBe("https://shop.example.com");
    expect(suggestSiteOrigin("http://localhost:4106/")).toBe("http://localhost:4106");
  });
});
