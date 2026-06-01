// @ts-ignore Convex backend tsconfig does not include Bun test globals.
import { describe, expect, test } from "bun:test";

import {
  FIXTURE_NOW,
  makeFixtureField,
  makeFixtureForm,
  paidTesterFieldSet,
  paidTesterValues,
} from "./fixtures";

describe("Forms deterministic fixtures", () => {
  test("form fixture is stable across calls", () => {
    expect(makeFixtureForm()).toEqual(makeFixtureForm());
    expect(makeFixtureForm().createdAt).toBe(FIXTURE_NOW);
  });

  test("field fixture keeps deterministic ids and timestamps", () => {
    const field = makeFixtureField("email", "email", { order: 4 });
    expect(field._id).toBe("fieldDefinitions:email");
    expect(field.groupId).toBe("fieldGroups:paid-tester");
    expect(field.createdAt).toBe(FIXTURE_NOW + 4);
  });

  test("paid tester field set covers public, wizard, logic, and calc paths", () => {
    const fields = paidTesterFieldSet();
    expect(fields.map((f) => f.key)).toEqual([
      "full_name",
      "email",
      "package",
      "company",
      "step_2",
      "quantity",
      "grand_total",
    ]);
    expect(fields.some((f) => f.conditionalLogic)).toBe(true);
    expect(fields.some((f) => f.type === "page_break")).toBe(true);
    expect(fields.some((f) => f.type === "calculation")).toBe(true);
  });

  test("paid tester values are deterministic and overridable", () => {
    expect(paidTesterValues()).toEqual(paidTesterValues());
    expect(paidTesterValues({ package: "starter" }).package).toBe("starter");
  });
});
