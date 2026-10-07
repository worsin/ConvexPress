import { expect, test } from "bun:test";
import { resolveInstructorDemo } from "./instructor-adapter";
import { validateCanonicalData } from "../src/templates/sdk/block-data/portable/resolve";

const scope = { websiteKey: "block-demo", instanceKey: "isolated-demo" };
const policy = { enabledPlugins: ["lms"], capabilities: ["reference.targetResolution"], disabledBlocks: [] };
const tree = [{ id: "teacher", name: "lms/instructor", version: 1, attrs: { instructor: "demo-instructor" } }];
const portrait = "/assets/fictional-studio-portrait.png";

test("portrait specimens use canonical image data and retain bound course pagination", async () => {
  const envelope = await resolveInstructorDemo(tree, scope, policy, {}, { profile: "portrait", portrait });
  validateCanonicalData(tree, scope, policy, envelope);
  const entry = envelope.dataByBlock.teacher;
  if (entry.resolver !== "lms.instructor") throw new Error("Wrong resolver");
  expect(entry.data.instructor?.image).toEqual({ src: portrait, alt: "Robin Ellis, fictional instructor" });
  expect(entry.data.courses).toHaveLength(6);
  expect(entry.data.nextCursor).toBe("demo-instructor:6");
  const next = await resolveInstructorDemo(tree, scope, policy, { teacher: "demo-instructor:6" }, { profile: "portrait", portrait });
  validateCanonicalData(tree, scope, policy, next, { teacher: "demo-instructor:6" });
  const page = next.dataByBlock.teacher;
  if (page.resolver !== "lms.instructor") throw new Error("Wrong resolver");
  expect(page.data.instructor?.image?.src).toBe(portrait);
  expect(page.data.courses).toHaveLength(1);
  expect(page.data.nextCursor).toBeNull();
});

test("minimal and withdrawn specimens remove optional profile data and unavailable course links", async () => {
  const minimal = await resolveInstructorDemo(tree, scope, policy, {}, { profile: "minimal" });
  const entry = minimal.dataByBlock.teacher;
  if (entry.resolver !== "lms.instructor") throw new Error("Wrong resolver");
  expect(entry.data.instructor?.bio).toBe("");
  expect(entry.data.instructor?.image).toBeNull();
  const withdrawn = await resolveInstructorDemo(tree, scope, policy, {}, { profile: "unavailable" });
  validateCanonicalData(tree, scope, policy, withdrawn);
  const missing = withdrawn.dataByBlock.teacher;
  if (missing.resolver !== "lms.instructor") throw new Error("Wrong resolver");
  expect(missing.data.instructor).toBeNull();
  expect(missing.data.courses).toEqual([]);
  expect(missing.data.nextCursor).toBeNull();
});
