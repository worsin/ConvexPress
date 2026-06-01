/**
 * Deterministic Forms fixtures for production-hardening tests.
 *
 * These are Convex-free shapes that mirror the fields the pure Forms engines
 * read. They let backend/unit/e2e setup code share one canonical set of form
 * definitions instead of hand-rolling slightly different examples per test.
 */

export const FIXTURE_NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

export function fixtureId(table: string, name: string): string {
  return `${table}:${name}`;
}

export interface FixtureField {
  _id: string;
  groupId: string;
  key: string;
  name: string;
  label: string;
  type: string;
  required: boolean;
  settings: string;
  conditionalLogic?: string;
  parentFieldId?: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface FixtureForm {
  _id: string;
  title: string;
  slug: string;
  status: "draft" | "published" | "archived";
  fieldGroupId: string;
  settings: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export function makeFixtureField(
  key: string,
  type: string,
  patch: Partial<FixtureField> = {},
): FixtureField {
  const order = patch.order ?? 0;
  return {
    _id: patch._id ?? fixtureId("fieldDefinitions", key),
    groupId: patch.groupId ?? fixtureId("fieldGroups", "paid-tester"),
    key,
    name: patch.name ?? key,
    label: patch.label ?? key.replace(/_/g, " "),
    type,
    required: patch.required ?? false,
    settings: patch.settings ?? "{}",
    conditionalLogic: patch.conditionalLogic,
    parentFieldId: patch.parentFieldId,
    order,
    createdAt: patch.createdAt ?? FIXTURE_NOW + order,
    updatedAt: patch.updatedAt ?? FIXTURE_NOW + order,
  };
}

export function makeFixtureForm(
  patch: Partial<FixtureForm> = {},
): FixtureForm {
  return {
    _id: patch._id ?? fixtureId("forms", "paid-tester"),
    title: patch.title ?? "Paid Tester Form",
    slug: patch.slug ?? "paid-tester-form",
    status: patch.status ?? "published",
    fieldGroupId: patch.fieldGroupId ?? fixtureId("fieldGroups", "paid-tester"),
    settings: patch.settings ?? "{}",
    createdBy: patch.createdBy ?? fixtureId("users", "admin"),
    createdAt: patch.createdAt ?? FIXTURE_NOW,
    updatedAt: patch.updatedAt ?? FIXTURE_NOW,
  };
}

export function paidTesterFieldSet(): FixtureField[] {
  return [
    makeFixtureField("full_name", "text", {
      label: "Full name",
      required: true,
      order: 0,
    }),
    makeFixtureField("email", "email", {
      label: "Email",
      required: true,
      order: 1,
    }),
    makeFixtureField("package", "select", {
      label: "Package",
      required: true,
      settings: JSON.stringify({
        choices: [
          { label: "Starter", value: "starter" },
          { label: "Pro", value: "pro" },
        ],
      }),
      order: 2,
    }),
    makeFixtureField("company", "text", {
      label: "Company",
      conditionalLogic: JSON.stringify({
        action: "show",
        logic: "all",
        rules: [
          {
            field: "package",
            operator: "is",
            value: "pro",
          },
        ],
      }),
      order: 3,
    }),
    makeFixtureField("step_2", "page_break", {
      label: "Details",
      order: 4,
    }),
    makeFixtureField("quantity", "number", {
      label: "Quantity",
      required: true,
      settings: JSON.stringify({ min: 1, max: 10 }),
      order: 5,
    }),
    makeFixtureField("grand_total", "calculation", {
      label: "Grand total",
      settings: JSON.stringify({
        formula: "{quantity} * 5000",
        output: "number",
      }),
      order: 6,
    }),
  ];
}

export function paidTesterValues(
  patch: Record<string, string> = {},
): Record<string, string> {
  return {
    full_name: "Ada Lovelace",
    email: "ada@example.test",
    package: "pro",
    company: "Analytical Engines LLC",
    quantity: "2",
    ...patch,
  };
}
