import { describe, expect, test } from "bun:test";

import { normalizeLayoutItems } from "../mutations";
import {
  DASHBOARD_GRID,
  DASHBOARD_PAGES,
  DASHBOARD_WIDGETS,
  buildDefaultLayoutItems,
  pluginIsEnabled,
  pluginSettingsKey,
} from "../registry";
import { PLUGIN_DEFAULTS, PLUGIN_PARENT, PLUGIN_SETTINGS_KEY } from "../../../plugins/registry";
import { ANONYMOUS_VIEWER, menuItemVisibleFor } from "../visibility";

describe("dashboard registry", () => {
  test("page and widget ids are unique and kebab-case", () => {
    const ids = [...DASHBOARD_PAGES.map((p) => p.id), ...DASHBOARD_WIDGETS.map((w) => w.id)];
    for (const id of ids) expect(/^[a-z0-9-]+$/u.test(id)).toBe(true);
    expect(new Set(DASHBOARD_PAGES.map((p) => p.id)).size).toBe(DASHBOARD_PAGES.length);
    expect(new Set(DASHBOARD_WIDGETS.map((w) => w.id)).size).toBe(DASHBOARD_WIDGETS.length);
  });

  test("commerce sub-plugins require the parent plugin", () => {
    expect(pluginIsEnabled("commerceReturns", { commerceReturnsEnabled: true })).toBe(false);
    expect(pluginIsEnabled("commerceReturns", { commerceReturnsEnabled: true, commerceEnabled: true })).toBe(true);
    expect(pluginIsEnabled("core", {})).toBe(true);
  });

  test("installed declarations own Dashboard keys, defaults and parent chains", () => {
    const id = "dashboard-test-sessions";
    expect(Object.prototype.hasOwnProperty.call(PLUGIN_SETTINGS_KEY, id)).toBe(false);
    PLUGIN_SETTINGS_KEY[id] = "sessionBookingsEnabled";
    PLUGIN_DEFAULTS[id] = true;
    try {
      expect(pluginSettingsKey(id)).toBe("sessionBookingsEnabled");
      expect(pluginIsEnabled(id, {})).toBe(true);
      expect(pluginIsEnabled(id, { sessionBookingsEnabled: false })).toBe(false);
      PLUGIN_PARENT[id] = "commerceReturns";
      expect(pluginIsEnabled(id, { commerceReturnsEnabled: true })).toBe(false);
      expect(pluginIsEnabled(id, { commerceReturnsEnabled: true, commerceEnabled: true })).toBe(true);
      PLUGIN_PARENT[id] = id;
      expect(pluginIsEnabled(id, { sessionBookingsEnabled: true })).toBe(false);
    } finally {
      delete PLUGIN_SETTINGS_KEY[id];
      delete PLUGIN_DEFAULTS[id];
      delete PLUGIN_PARENT[id];
    }
    expect(pluginSettingsKey(id)).toBeNull();
    expect(pluginIsEnabled(id, { [`${id}Enabled`]: true })).toBe(false);
    expect(pluginIsEnabled("constructor", { constructorEnabled: true })).toBe(false);
  });

  test("the default layout packs enabled widgets into the grid without overlap", () => {
    const items = buildDefaultLayoutItems({ commerceEnabled: true, ticketsEnabled: true, lmsEnabled: true });
    expect(items.length > 3).toBe(true);
    for (const item of items) expect(item.x + item.w <= DASHBOARD_GRID.columns).toBe(true);
    const cells = new Set<string>();
    for (const item of items) {
      for (let x = item.x; x < item.x + item.w; x += 1) {
        for (let y = item.y; y < item.y + item.h; y += 1) {
          const cell = `${x},${y}`;
          expect(cells.has(cell)).toBe(false);
          cells.add(cell);
        }
      }
    }
    expect(items.some((item) => item.widgetId === "orders")).toBe(true);
    expect(buildDefaultLayoutItems({}).some((item) => item.widgetId === "orders")).toBe(false);
  });
});

describe("layout normalization", () => {
  test("drops unknown widgets, clamps geometry, and de-duplicates keys", () => {
    const items = normalizeLayoutItems([
      { key: "a", widgetId: "welcome", x: 20, y: -2, w: 30, h: 0 },
      { key: "a", widgetId: "notifications", x: 0, y: 0, w: 4, h: 3, settings: { limit: 99, bogus: "x" } },
      { key: "z", widgetId: "not-a-widget", x: 0, y: 0, w: 4, h: 3 },
    ]);
    expect(items.length).toBe(2);
    expect(items[0].x + items[0].w <= DASHBOARD_GRID.columns).toBe(true);
    expect(items[0].y).toBe(0);
    expect(items[0].h).toBe(1);
    expect(items[1].key === "a").toBe(false);
    expect(items[1].settings?.limit).toBe(15);
    expect(items[1].settings?.bogus).toBe(undefined);
  });
});

describe("menu visibility", () => {
  const member = { signedIn: true, roleSlug: "customer", planSlugs: ["pro"], capabilities: ["read"] };
  test("signed-in and signed-out gates", () => {
    expect(menuItemVisibleFor({ visibility: "signedIn" }, ANONYMOUS_VIEWER)).toBe(false);
    expect(menuItemVisibleFor({ visibility: "signedOut" }, member)).toBe(false);
    expect(menuItemVisibleFor({}, ANONYMOUS_VIEWER)).toBe(true);
  });
  test("roles, plans, and capabilities", () => {
    expect(menuItemVisibleFor({ roles: ["vendor"] }, member)).toBe(false);
    expect(menuItemVisibleFor({ roles: ["vendor", "customer"] }, member)).toBe(true);
    expect(menuItemVisibleFor({ membershipPlans: ["enterprise"] }, member)).toBe(false);
    expect(menuItemVisibleFor({ membershipPlans: ["pro"] }, member)).toBe(true);
    expect(menuItemVisibleFor({ capability: "edit_posts" }, member)).toBe(false);
  });
});
