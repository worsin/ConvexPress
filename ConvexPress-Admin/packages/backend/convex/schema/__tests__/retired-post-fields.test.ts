import { expect, test } from "bun:test";
import schema from "../../schema";

for (const field of ["content", "contentMode", "pageSections"] as const) {
  test(`live post storage rejects retired ${field} while original revisions retain it`, () => {
    expect(schema.tables.posts.validator.fields).not.toHaveProperty(field);
    expect(schema.tables.revisions.validator.fields).toHaveProperty(field);
  });
}
