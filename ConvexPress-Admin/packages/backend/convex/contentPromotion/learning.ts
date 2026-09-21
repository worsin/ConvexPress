import type { ContentPromotionManifest, PromotionRecord } from "@convexpress/site-contract/content-promotion";
import type { QueryCtx } from "../_generated/server";
import { fail, read, referencedKey, type Row } from "./shared";

export const isLearningKind = (kind: string) => ["course", "courseNode", "coursePrerequisite", "plan", "planBenefit"].includes(kind);
export function validateLearningManifest(manifest: ContentPromotionManifest): void {
  const records = new Map(manifest.records.map(r => [r.key, r]));
  const sameParent = new Set<string>();
  for (const record of manifest.records) {
    if (!isLearningKind(record.kind)) continue;
    const d = record.data;
    if (d.slug && !/^[a-z0-9][a-z0-9_-]*$/.test(String(d.slug))) fail("LEARNING_SLUG_INVALID", "Course and plan slugs must be canonical single segments.");
    if (record.kind === "course") {
      if (typeof d.startDate === "number" && typeof d.endDate === "number" && d.startDate >= d.endDate) fail("LEARNING_DATES_INVALID", "Course end must follow its start.");
      if (d.accessMode === "members" && !manifest.records.some(r => r.kind === "restriction" && r.data.resourceType === "course" && referencedKey(String(r.data.resourceIdOrKey)) === record.key && Array.isArray(r.data.planIds) && r.data.planIds.length)) fail("COURSE_GATE_REQUIRED", "A members course requires its reviewed membership gate and plans.");
      for (const field of ["categoryIds", "tagIds"]) if (Array.isArray(d[field]) && d[field].some(label => typeof label !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(label))) fail("COURSE_LABEL_INVALID", "Course labels must use the canonical normalized label format.");
    }
    if (record.kind === "courseNode") {
      if (records.get(referencedKey(String(d.courseId)) ?? "")?.kind !== "course") fail("COURSE_PARENT_REQUIRED", "Every node requires its reviewed course.");
      if (d.parentId) {
        const parent = records.get(referencedKey(String(d.parentId)) ?? "");
        if (!parent || parent.kind !== "courseNode" || parent.data.kind !== "topic" || parent.data.courseId !== d.courseId || parent.data.parentId || d.kind === "topic") fail("COURSE_TREE_INVALID", "Lesson parents must be root topics in the same reviewed course.");
      }
      const key = JSON.stringify([d.courseId, d.parentId, d.position]);
      if (sameParent.has(key)) fail("COURSE_TREE_INVALID", "Sibling positions must be unique.");
      sameParent.add(key);
      for (const prefix of ["topic", "lesson"]) {
        if (d[prefix + "DripMode"] === "specific_date" && typeof d[prefix + "DripDate"] !== "number") fail("COURSE_DRIP_INVALID", "Date-based drip requires its authored date.");
        if (d[prefix + "DripMode"] === "enrollment_based" && typeof d[prefix + "DripOffsetDays"] !== "number") fail("COURSE_DRIP_INVALID", "Enrollment-based drip requires its offset.");
      }
    }
    if (record.kind === "coursePrerequisite") {
      if (d.courseId === d.prereqCourseId || [d.courseId,d.prereqCourseId].some(id => records.get(referencedKey(String(id)) ?? "")?.kind !== "course")) fail("COURSE_PREREQUISITE_INVALID", "Prerequisites need two distinct reviewed courses.");
      const key = JSON.stringify([d.courseId,d.prereqCourseId]);
      if (sameParent.has(key)) fail("COURSE_PREREQUISITE_INVALID", "Duplicate prerequisites are not supported.");
      sameParent.add(key);
    }
    if (record.kind === "planBenefit") {
      if (records.get(referencedKey(String(d.planId)) ?? "")?.kind !== "plan") fail("PLAN_PARENT_REQUIRED", "Benefits require their reviewed plan.");
      const key = JSON.stringify([d.planId,d.code]);
      if (sameParent.has(key)) fail("PLAN_BENEFIT_CONFLICT", "Benefit codes must be unique per plan.");
      sameParent.add(key);
    }
  }
  const visiting = new Set<string>(); const visited = new Set<string>();
  function prerequisites(key: string) {
    if (visiting.has(key)) fail("COURSE_PREREQUISITE_CYCLE", "Course prerequisites form a cycle.");
    if (visited.has(key)) return;
    visiting.add(key);
    for (const r of manifest.records.filter(r => r.kind === "coursePrerequisite" && referencedKey(String(r.data.courseId)) === key)) prerequisites(referencedKey(String(r.data.prereqCourseId))!);
    visiting.delete(key); visited.add(key);
  }
  for (const r of manifest.records.filter(r => r.kind === "course")) prerequisites(r.key);
}
export async function learningChildren(ctx: QueryCtx, kind: "courseNode" | "coursePrerequisite" | "planBenefit", parentId: string): Promise<Row[]> {
  let rows: Row[];
  if (kind === "planBenefit") {
    const id = ctx.db.normalizeId("membership_plans", parentId); if (!id) fail("PLAN_PARENT_REQUIRED", "Invalid plan identity.");
    rows = await ctx.db.query("membership_plan_benefits").withIndex("by_plan", q => q.eq("planId", id)).take(101);
  } else {
    const id = ctx.db.normalizeId("lms_courses", parentId); if (!id) fail("COURSE_PARENT_REQUIRED", "Invalid course identity.");
    rows = kind === "courseNode" ? await ctx.db.query("lms_nodes").withIndex("by_course", q => q.eq("courseId", id)).take(101) : await ctx.db.query("lms_course_prerequisites").withIndex("by_course", q => q.eq("courseId", id)).take(101);
  }
  if (rows.length > 100) fail("PROMOTION_SCAN_LIMIT", "Learning collection exceeds this atomic adapter.");
  return rows;
}
export async function lookupLearningTarget(ctx: QueryCtx, record: PromotionRecord, known: Map<string,string>): Promise<Row | null> {
  if (record.kind === "course") return ctx.db.query("lms_courses").withIndex("by_slug", q => q.eq("slug", String(record.data.slug))).unique();
  if (record.kind === "plan") return ctx.db.query("membership_plans").withIndex("by_slug", q => q.eq("slug", String(record.data.slug))).unique();
  const d = record.data; const parent = known.get(referencedKey(String(d.planId ?? d.courseId)) ?? "");
  if (!parent) return null;
  const kind = record.kind as "courseNode" | "coursePrerequisite" | "planBenefit";
  const rows = await learningChildren(ctx, kind, parent);
  const matches = rows.filter(r => kind === "planBenefit" ? r.code === d.code : kind === "coursePrerequisite" ? r.prereqCourseId === known.get(referencedKey(String(d.prereqCourseId)) ?? "") : r.kind === d.kind && r.title === d.title && r.parentId === (d.parentId ? known.get(referencedKey(String(d.parentId)) ?? "") : undefined));
  if (matches.length > 1) fail("TARGET_LEARNING_IDENTITY_CONFLICT", "Learning identity is ambiguous; resolve it before promotion.");
  return matches[0] ?? null;
}
export function assertPortableLearningSource(kind: string, row: Row): void {
  if (kind === "course" && (row.certificateId || row.accessMode === "buy" || row.accessMode === "recurring" || row.externalButtonUrl || row.price || row.recurringPrice || row.trialPrice)) fail("LEARNING_ADAPTER_REQUIRED", "Paid/external courses and certificates require explicit target adapters.");
  if (kind === "plan" && (row.linkedRoleId || (Array.isArray(row.linkedCapabilities) && row.linkedCapabilities.length))) fail("PLAN_BINDING_ADAPTER_REQUIRED", "Source role/capability bindings require an explicit reviewed target adapter.");
  if (kind === "planBenefit" && row.metadata !== undefined) fail("PLAN_BENEFIT_ADAPTER_REQUIRED", "Source benefit metadata requires its own semantic adapter.");
}
export async function reviewLearningRecord(ctx: QueryCtx, manifest: ContentPromotionManifest, record: PromotionRecord, current: Row | null, known: Map<string,string>, issue: (code:string,key:string,message:string)=>void): Promise<void> {
  if (record.kind === "plan") {
    if ((!current && record.data.grantMode !== "manual") || (current && current.grantMode !== record.data.grantMode)) issue("TARGET_PLAN_BINDING_REQUIRED", record.key, "Paid-mode plans need an existing compatible target plan; promotion never creates billing links or changes grant mode.");
  }
  if (record.kind === "course" && current) {
    if (current.certificateId || current.accessMode === "buy" || current.accessMode === "recurring" || current.externalButtonUrl || current.price || current.recurringPrice || current.trialPrice) issue("TARGET_LEARNING_ADAPTER_REQUIRED", record.key, "Existing paid/external/certificate configuration needs its own adapter.");
  }
  if (current && (record.kind === "course" || record.kind === "plan")) {
    const natural = await lookupLearningTarget(ctx, record, known);
    if (natural && natural._id !== current._id) issue("TARGET_LEARNING_IDENTITY_CONFLICT", record.key, "Another target record owns the reviewed slug.");
  }
  if (current && ["courseNode","coursePrerequisite","planBenefit"].includes(record.kind)) {
    for (const field of record.kind === "planBenefit" ? ["planId"] : record.kind === "coursePrerequisite" ? ["courseId","prereqCourseId"] : ["courseId","parentId"]) {
      const target = record.data[field] ? known.get(referencedKey(String(record.data[field])) ?? "") : undefined;
      if (current[field] !== target) issue("TARGET_LEARNING_PARENT_CONFLICT", record.key, "Existing learner-linked records cannot change parent/course identity.");
    }
    if (record.kind === "courseNode" && current.kind !== record.data.kind) issue("TARGET_LEARNING_KIND_CONFLICT", record.key, "Existing node kind must remain stable for learner progress.");
    if (record.kind === "planBenefit" && current.code !== record.data.code) issue("TARGET_PLAN_BENEFIT_CONFLICT", record.key, "Existing benefit identity cannot change.");
  }
  if (record.kind === "restriction") for (const value of Array.isArray(record.data.planIds) ? record.data.planIds : []) {
    const key = referencedKey(String(value)) ?? ""; const plan = manifest.records.find(r => r.key === key && r.kind === "plan");
    const id = known.get(key); const target = !plan && id ? await read(ctx,"plan",id) : null;
    if ((plan?.data.status ?? target?.status) !== "active") issue("TARGET_GATE_PLAN_INACTIVE", record.key, "Every gate must resolve to an active reviewed or bound target plan.");
  }
}
export async function reviewLearningCollections(ctx: QueryCtx, changes: Array<{kind:string;targetId:string|null;key:string}>, issue:(code:string,key:string,message:string)=>void): Promise<void> {
  for (const parent of changes.filter(c => (c.kind === "course" || c.kind === "plan") && c.targetId)) {
    for (const kind of parent.kind === "course" ? ["courseNode","coursePrerequisite"] as const : ["planBenefit"] as const) {
      const retained = new Set(changes.filter(c => c.kind === kind).map(c => c.targetId));
      if ((await learningChildren(ctx,kind,parent.targetId!)).some(r => !retained.has(r._id))) issue("TARGET_LEARNING_COLLECTION_CONFLICT",parent.key,"All existing curriculum/prerequisite/benefit records must be reviewed; deletion needs a dedicated adapter.");
    }
  }
}
