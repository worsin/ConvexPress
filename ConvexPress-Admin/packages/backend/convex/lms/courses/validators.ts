/**
 * Course System - argument validators.
 */

import { v } from "convex/values";
import {
  lmsAccessModeValidator,
  lmsBillingUnitValidator,
  lmsProgressionModeValidator,
  lmsContentVisibilityValidator,
  lmsPrereqModeValidator,
} from "../../schema/lms";

export const MAX_LMS_TITLE_LENGTH = 200;

export const createCourseArgs = {
  title: v.string(),
};

export const updateCourseArgs = {
  courseId: v.id("lms_courses"),
  title: v.optional(v.string()),
  slug: v.optional(v.string()),
  descriptionDoc: v.optional(v.any()),
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
  materialsDoc: v.optional(v.any()),
};

export const courseIdArg = { courseId: v.id("lms_courses") };
