/**
 * Course System - argument validators.
 */

import { v } from "convex/values";
import {
  lmsAccessModeValidator,
  lmsBillingUnitValidator,
  lmsCourseStatusValidator,
  lmsProgressionModeValidator,
  lmsContentVisibilityValidator,
  lmsPrereqModeValidator,
} from "../../schema/lms";
import { lmsDocs } from "../../schema/lms.docs.generated";
import { tiptapDocValidator } from "../tiptapDoc";

/**
 * Public (non-staff) projection of a course. `descriptionDoc` is stored Tiptap
 * JSON; it reuses the schema's own field validator for that column.
 */
export const publicCoursePayloadValidator = v.object({
  _id: v.id("lms_courses"),
  title: v.string(),
  slug: v.string(),
  status: lmsCourseStatusValidator,
  descriptionDoc: lmsDocs.lms_courses.fields.descriptionDoc,
  excerpt: v.optional(v.string()),
  featuredImageId: v.optional(v.id("media")),
  promoVideoUrl: v.optional(v.string()),
  accessMode: lmsAccessModeValidator,
  price: v.optional(v.number()),
  recurringPrice: v.optional(v.number()),
  billingInterval: v.optional(v.number()),
  billingUnit: v.optional(lmsBillingUnitValidator),
  trialPrice: v.optional(v.number()),
  trialDays: v.optional(v.number()),
  externalButtonUrl: v.optional(v.string()),
  progressionMode: lmsProgressionModeValidator,
  contentVisibility: lmsContentVisibilityValidator,
  startDate: v.optional(v.number()),
  endDate: v.optional(v.number()),
  lessonCount: v.number(),
  topicCount: v.number(),
  certificateId: v.optional(v.id("lms_certificates")),
  publishedAt: v.optional(v.number()),
});

export const MAX_LMS_TITLE_LENGTH = 200;

export const createCourseArgs = {
  title: v.string(),
};

export const updateCourseArgs = {
  courseId: v.id("lms_courses"),
  title: v.optional(v.string()),
  slug: v.optional(v.string()),
  descriptionDoc: v.optional(tiptapDocValidator),
  excerpt: v.optional(v.string()),
  featuredImageId: v.optional(v.id("media")),
  promoVideoUrl: v.optional(v.string()),
  categoryIds: v.optional(v.array(v.string())),
  tagIds: v.optional(v.array(v.string())),
  accessMode: v.optional(lmsAccessModeValidator),
  price: v.optional(v.number()),
  recurringPrice: v.optional(v.number()),
  billingInterval: v.optional(v.number()),
  billingUnit: v.optional(lmsBillingUnitValidator),
  trialPrice: v.optional(v.number()),
  trialDays: v.optional(v.number()),
  externalButtonUrl: v.optional(v.string()),
  progressionMode: v.optional(lmsProgressionModeValidator),
  pointsAwarded: v.optional(v.number()),
  pointsRequired: v.optional(v.number()),
  prereqMode: v.optional(lmsPrereqModeValidator),
  accessDurationDays: v.optional(v.number()),
  startDate: v.optional(v.number()),
  endDate: v.optional(v.number()),
  seatLimit: v.optional(v.number()),
  contentVisibility: v.optional(lmsContentVisibilityValidator),
  certificateId: v.optional(v.id("lms_certificates")),
  completionRedirectUrl: v.optional(v.string()),
  materialsDoc: v.optional(tiptapDocValidator),
};

export const courseIdArg = { courseId: v.id("lms_courses") };

export const updatePrerequisitesArgs = {
  courseId: v.id("lms_courses"),
  prereqMode: v.optional(lmsPrereqModeValidator),
  prereqCourseIds: v.array(v.id("lms_courses")),
};

export const updateAccessRuleArgs = {
  courseId: v.id("lms_courses"),
  planIds: v.array(v.id("membership_plans")),
  ruleMode: v.optional(v.union(v.literal("allow_only"), v.literal("deny_if_missing"))),
  loginRequired: v.optional(v.boolean()),
  customMessage: v.optional(v.string()),
};
