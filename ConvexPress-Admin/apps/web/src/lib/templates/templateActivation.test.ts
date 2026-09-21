import { expect, test } from "bun:test";
import { activateTemplate } from "./templateActivation";
import type { TemplateSection } from "./templatePublishing";

test("returning to a template restores its saved shop layout without changing content settings", () => {
  const current: TemplateSection = { active: "depot", overrides: { page: "core" }, variants: { "shop.catalog": "marketplace", "shop.product": "showcase", page: "minimal" }, settings: {
    depot: { shop: { catalogVariant: "marketplace", productVariant: "showcase" } },
    journal: { shop: { catalogVariant: "boutique", productVariant: "classic" }, colors: { primary: "#91444b" } },
  } };
  const original = structuredClone(current);
  const journal = activateTemplate(current, "journal");
  expect(journal.variants).toEqual({ "shop.catalog": "boutique", "shop.product": "classic", page: "minimal" });
  expect(journal.settings).toEqual(current.settings);
  expect(journal.overrides).toEqual(current.overrides);
  expect(activateTemplate(journal, "depot")).toEqual(current);
  expect(current).toEqual(original);
});

test("a new pack uses its defaults and switching back preserves legacy selections", () => {
  const legacy: TemplateSection = { active: "core", overrides: {}, variants: { "shop.product": "classic" }, settings: {} };
  const journal = activateTemplate(legacy, "journal");
  expect(journal.variants).toEqual({});
  expect(journal.settings.core?.shop?.productVariant).toBe("classic");
  expect(activateTemplate(journal, "core").variants["shop.product"]).toBe("classic");
  expect(activateTemplate(legacy, "core")).toEqual(legacy);
});
