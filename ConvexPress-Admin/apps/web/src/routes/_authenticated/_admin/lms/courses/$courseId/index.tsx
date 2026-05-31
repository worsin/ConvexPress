/**
 * Course settings editor — /lms/courses/$courseId
 */

import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { toast } from "sonner";
import { MediaSelector } from "@/components/lms/MediaSelector";
import { PlanPicker } from "@/components/membership/PlanPicker";
import {
  ArrowLeft,
  Save,
  Eye,
  EyeOff,
  Archive,
  Layers,
  Sparkles,
  Users,
  GraduationCap,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/lms/courses/$courseId/")({
  component: CourseSettingsPage,
});

type AccessMode = "open" | "free" | "members" | "buy" | "recurring" | "closed";
type ProgressionMode = "linear" | "free_form";
type ContentVisibility = "always" | "enrollees_only";
type PrereqMode = "all" | "any";
type BillingUnit = "day" | "week" | "month" | "year";

interface FormState {
  title: string;
  slug: string;
  descriptionText: string;
  excerpt: string;
  featuredImageId: Id<"media"> | null;
  promoVideoUrl: string;
  categoryText: string;
  tagText: string;
  accessMode: AccessMode;
  price: number;
  recurringPrice: number;
  billingInterval: number;
  billingUnit: BillingUnit;
  trialPrice: number;
  trialDays: number;
  externalButtonUrl: string;
  progressionMode: ProgressionMode;
  contentVisibility: ContentVisibility;
  pointsAwarded: number;
  pointsRequired: number;
  prereqMode: PrereqMode;
  seatLimit: number;
  accessDurationDays: number;
  startDate: string;
  endDate: string;
  certificateId: string;
  completionRedirectUrl: string;
}

const EMPTY: FormState = {
  title: "",
  slug: "",
  descriptionText: "",
  excerpt: "",
  featuredImageId: null,
  promoVideoUrl: "",
  categoryText: "",
  tagText: "",
  accessMode: "members",
  price: 0,
  recurringPrice: 0,
  billingInterval: 1,
  billingUnit: "month",
  trialPrice: 0,
  trialDays: 0,
  externalButtonUrl: "",
  progressionMode: "linear",
  contentVisibility: "enrollees_only",
  pointsAwarded: 0,
  pointsRequired: 0,
  prereqMode: "all",
  seatLimit: 0,
  accessDurationDays: 0,
  startDate: "",
  endDate: "",
  certificateId: "",
  completionRedirectUrl: "",
};

type PlanId = Id<"membership_plans">;

function CourseSettingsPage() {
  const { courseId } = Route.useParams();
  const id = courseId as Id<"lms_courses">;
  const course = useQuery(api.lms.courses.queries.getById, { courseId: id });
  const templates = useQuery(api.lms.certificates.queries.listTemplates, {}) as
    | Array<{ _id: string; title: string }>
    | undefined;
  const courses = useQuery(api.lms.courses.queries.list, {}) as
    | Array<{ _id: Id<"lms_courses">; title: string; status: string }>
    | undefined;
  const prereqs = useQuery(api.lms.courses.queries.getPrerequisites, { courseId: id }) as
    | Array<{ courseId: Id<"lms_courses">; title: string; status: string }>
    | undefined;
  const accessRule = useQuery((api as any).lms.courses.queries.getAccessRule, {
    courseId: id,
  }) as { planIds?: PlanId[]; customMessage?: string } | null | undefined;
  const membershipPlans = useQuery((api as any).membership.queries.listPlans, {
    status: "active",
  }) as Array<{ _id: PlanId; title: string; slug: string; status?: string }> | null | undefined;

  const update = useMutation(api.lms.courses.mutations.update);
  const updatePrerequisites = useMutation(api.lms.courses.mutations.updatePrerequisites);
  const updateAccessRule = useMutation((api as any).lms.courses.mutations.updateAccessRule);
  const publish = useMutation(api.lms.courses.mutations.publish);
  const unpublish = useMutation(api.lms.courses.mutations.unpublish);
  const archive = useMutation(api.lms.courses.mutations.archive);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [prereqCourseIds, setPrereqCourseIds] = useState<Array<Id<"lms_courses">>>([]);
  const [membershipPlanIds, setMembershipPlanIds] = useState<PlanId[]>([]);
  const [accessMessage, setAccessMessage] = useState("This course is available to members.");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (course) {
      setForm({
        title: course.title,
        slug: course.slug,
        descriptionText: docToText(course.descriptionDoc),
        excerpt: course.excerpt ?? "",
        featuredImageId: course.featuredImageId ?? null,
        promoVideoUrl: course.promoVideoUrl ?? "",
        categoryText: (course.categoryIds ?? []).join(", "),
        tagText: (course.tagIds ?? []).join(", "),
        accessMode: (course.accessMode ?? "members") as AccessMode,
        price: course.price ?? 0,
        recurringPrice: course.recurringPrice ?? 0,
        billingInterval: course.billingInterval ?? 1,
        billingUnit: (course.billingUnit ?? "month") as BillingUnit,
        trialPrice: course.trialPrice ?? 0,
        trialDays: course.trialDays ?? 0,
        externalButtonUrl: course.externalButtonUrl ?? "",
        progressionMode: (course.progressionMode ?? "linear") as ProgressionMode,
        contentVisibility: (course.contentVisibility ?? "enrollees_only") as ContentVisibility,
        pointsAwarded: course.pointsAwarded ?? 0,
        pointsRequired: course.pointsRequired ?? 0,
        prereqMode: (course.prereqMode ?? "all") as PrereqMode,
        seatLimit: course.seatLimit ?? 0,
        accessDurationDays: course.accessDurationDays ?? 0,
        startDate: toDateInput(course.startDate),
        endDate: toDateInput(course.endDate),
        certificateId: course.certificateId ?? "",
        completionRedirectUrl: course.completionRedirectUrl ?? "",
      });
    }
  }, [course]);

  useEffect(() => {
    if (prereqs) {
      setPrereqCourseIds(prereqs.map((row) => row.courseId));
    }
  }, [prereqs]);

  useEffect(() => {
    if (accessRule !== undefined) {
      setMembershipPlanIds(accessRule?.planIds ?? []);
      setAccessMessage(accessRule?.customMessage ?? "This course is available to members.");
    }
  }, [accessRule]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await update({
        courseId: id,
        title: form.title,
        slug: form.slug,
        descriptionDoc: textToDoc(form.descriptionText),
        excerpt: form.excerpt,
        featuredImageId: form.featuredImageId ?? undefined,
        promoVideoUrl: form.promoVideoUrl,
        categoryIds: splitList(form.categoryText),
        tagIds: splitList(form.tagText),
        accessMode: form.accessMode,
        price: form.price,
        recurringPrice: form.recurringPrice,
        billingInterval: form.billingInterval,
        billingUnit: form.billingUnit,
        trialPrice: form.trialPrice,
        trialDays: form.trialDays,
        externalButtonUrl: form.externalButtonUrl,
        progressionMode: form.progressionMode,
        contentVisibility: form.contentVisibility,
        pointsAwarded: form.pointsAwarded,
        pointsRequired: form.pointsRequired,
        prereqMode: form.prereqMode,
        seatLimit: form.seatLimit,
        accessDurationDays: form.accessDurationDays,
        startDate: fromDateInput(form.startDate),
        endDate: fromDateInput(form.endDate),
        certificateId: form.certificateId
          ? (form.certificateId as Id<"lms_certificates">)
          : undefined,
        completionRedirectUrl: form.completionRedirectUrl,
      });
      await updatePrerequisites({
        courseId: id,
        prereqMode: form.prereqMode,
        prereqCourseIds,
      });
      await updateAccessRule({
        courseId: id,
        planIds: form.accessMode === "members" ? membershipPlanIds : [],
        customMessage: accessMessage,
        loginRequired: true,
        ruleMode: "allow_only",
      });
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function run(label: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      toast.success(label);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  }

  if (course === undefined) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (course === null) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Course not found.</p>
        <Link to="/lms/courses" className="text-sm text-primary hover:underline">
          Back to Courses
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link
        to="/lms/courses"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Courses
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{form.title || "Untitled course"}</h1>
          <span className="text-xs uppercase text-muted-foreground">{course.status}</span>
        </div>
        <div className="flex items-center gap-2">
          {course.status === "published" ? (
            <button
              type="button"
              onClick={() => run("Unpublished", () => unpublish({ courseId: id }))}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              <EyeOff className="h-4 w-4" /> Unpublish
            </button>
          ) : (
            <button
              type="button"
              onClick={() => run("Published", () => publish({ courseId: id }))}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              <Eye className="h-4 w-4" /> Publish
            </button>
          )}
          <button
            type="button"
            onClick={() => run("Archived", () => archive({ courseId: id }))}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            <Archive className="h-4 w-4" /> Archive
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <QuickLink to="/lms/courses/$courseId/builder" courseId={courseId} icon={Layers} title="Builder" desc="Topics & lessons" />
        <QuickLink to="/lms/courses/$courseId/generate" courseId={courseId} icon={Sparkles} title="Generate (AI)" desc="From a brief" />
        <QuickLink to="/lms/courses/$courseId/enrollees" courseId={courseId} icon={Users} title="Enrollees" desc="Manage access" />
        <Link
          to="/lms/learn/$courseId"
          params={{ courseId }}
          className="flex items-center gap-3 rounded-lg border border-border p-4 hover:border-primary"
        >
          <GraduationCap className="h-5 w-5 text-muted-foreground" />
          <div>
            <div className="font-medium">Preview</div>
            <div className="text-xs text-muted-foreground">As a learner</div>
          </div>
        </Link>
      </div>

      <div className="space-y-6 rounded-lg border border-border p-6">
        <Field label="Title">
          <input value={form.title} onChange={(e) => set("title", e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
        </Field>
        <Field label="Slug">
          <input value={form.slug} onChange={(e) => set("slug", e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
        </Field>
        <Field label="Course description">
          <textarea
            value={form.descriptionText}
            onChange={(e) => set("descriptionText", e.target.value)}
            rows={6}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Excerpt">
          <textarea value={form.excerpt} onChange={(e) => set("excerpt", e.target.value)} rows={3} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
        </Field>
        <Field label="Featured image">
          <MediaSelector
            mediaType="image"
            value={form.featuredImageId}
            onChange={(value) => set("featuredImageId", value)}
            placeholder="Search images"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Promo video URL">
            <input value={form.promoVideoUrl} onChange={(e) => set("promoVideoUrl", e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
          </Field>
          <Field label="Access mode">
            <select value={form.accessMode} onChange={(e) => set("accessMode", e.target.value as AccessMode)} className="w-full rounded-md border border-border px-3 py-2 text-sm">
              <option value="open">Open (public)</option>
              <option value="free">Free (login required)</option>
              <option value="members">Members (plan-gated)</option>
              <option value="buy">Buy now</option>
              <option value="recurring">Recurring</option>
              <option value="closed">Closed</option>
            </select>
          </Field>
          <Field label="Progression">
            <select value={form.progressionMode} onChange={(e) => set("progressionMode", e.target.value as ProgressionMode)} className="w-full rounded-md border border-border px-3 py-2 text-sm">
              <option value="linear">Linear (in order)</option>
              <option value="free_form">Free-form (any order)</option>
            </select>
          </Field>
          <Field label="Content visibility">
            <select value={form.contentVisibility} onChange={(e) => set("contentVisibility", e.target.value as ContentVisibility)} className="w-full rounded-md border border-border px-3 py-2 text-sm">
              <option value="enrollees_only">Enrollees only</option>
              <option value="always">Always visible</option>
            </select>
          </Field>
          <Field label="Certificate on completion">
            <select value={form.certificateId} onChange={(e) => set("certificateId", e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm">
              <option value="">None</option>
              {(templates ?? []).map((t) => (
                <option key={t._id} value={t._id}>{t.title}</option>
              ))}
            </select>
          </Field>
          <Field label="Seat limit (0 = unlimited)">
            <input type="number" min={0} value={form.seatLimit} onChange={(e) => set("seatLimit", Number(e.target.value))} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
          </Field>
          <Field label="Points awarded on completion">
            <input type="number" min={0} value={form.pointsAwarded} onChange={(e) => set("pointsAwarded", Number(e.target.value))} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
          </Field>
          <Field label="Points required to access">
            <input type="number" min={0} value={form.pointsRequired} onChange={(e) => set("pointsRequired", Number(e.target.value))} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
          </Field>
          <Field label="Access duration (days, 0 = lifetime)">
            <input type="number" min={0} value={form.accessDurationDays} onChange={(e) => set("accessDurationDays", Number(e.target.value))} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
          </Field>
          <Field label="Start date">
            <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
          </Field>
          <Field label="End date">
            <input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
          </Field>
          <Field label="Completion redirect URL">
            <input value={form.completionRedirectUrl} onChange={(e) => set("completionRedirectUrl", e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
          </Field>
          <Field label="Categories">
            <input value={form.categoryText} onChange={(e) => set("categoryText", e.target.value)} placeholder="onboarding, compliance" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
          </Field>
          <Field label="Tags">
            <input value={form.tagText} onChange={(e) => set("tagText", e.target.value)} placeholder="beginner, team training" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
          </Field>
        </div>

        {(form.accessMode === "buy" || form.accessMode === "recurring") && (
          <div className="grid grid-cols-1 gap-4 rounded-md border border-border bg-muted/20 p-4 sm:grid-cols-2">
            <Field label="One-time price">
              <input type="number" min={0} value={form.price} onChange={(e) => set("price", Number(e.target.value))} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
            </Field>
            <Field label="Recurring price">
              <input type="number" min={0} value={form.recurringPrice} onChange={(e) => set("recurringPrice", Number(e.target.value))} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
            </Field>
            <Field label="Billing interval">
              <input type="number" min={1} value={form.billingInterval} onChange={(e) => set("billingInterval", Number(e.target.value))} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
            </Field>
            <Field label="Billing unit">
              <select value={form.billingUnit} onChange={(e) => set("billingUnit", e.target.value as BillingUnit)} className="w-full rounded-md border border-border px-3 py-2 text-sm">
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="year">Year</option>
              </select>
            </Field>
            <Field label="Trial price">
              <input type="number" min={0} value={form.trialPrice} onChange={(e) => set("trialPrice", Number(e.target.value))} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
            </Field>
            <Field label="Trial days">
              <input type="number" min={0} value={form.trialDays} onChange={(e) => set("trialDays", Number(e.target.value))} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
            </Field>
            <Field label="External checkout URL">
              <input value={form.externalButtonUrl} onChange={(e) => set("externalButtonUrl", e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
            </Field>
          </div>
        )}

        {form.accessMode === "members" && (
          <div className="space-y-3 rounded-md border border-border bg-muted/20 p-4">
            <div>
              <h2 className="text-sm font-semibold">Membership access</h2>
              <p className="text-xs text-muted-foreground">
                Learners must have one of these active plans before they can enroll.
              </p>
            </div>
            <PlanPicker
              multiple
              value={membershipPlanIds}
              onChange={setMembershipPlanIds}
              plans={Array.isArray(membershipPlans) ? membershipPlans : []}
              emptyLabel="No active membership plans are available."
            />
            <Field label="Locked message">
              <textarea
                value={accessMessage}
                onChange={(e) => setAccessMessage(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-border px-3 py-2 text-sm"
              />
            </Field>
          </div>
        )}

        <div className="space-y-3 rounded-md border border-border bg-muted/20 p-4">
          <div>
            <h2 className="text-sm font-semibold">Prerequisites</h2>
            <p className="text-xs text-muted-foreground">
              Control whether all selected courses or any one selected course unlocks this course.
            </p>
          </div>
          <Field label="Requirement mode">
            <select value={form.prereqMode} onChange={(e) => set("prereqMode", e.target.value as PrereqMode)} className="w-full rounded-md border border-border px-3 py-2 text-sm">
              <option value="all">Complete all prerequisites</option>
              <option value="any">Complete any prerequisite</option>
            </select>
          </Field>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(courses ?? [])
              .filter((candidate) => candidate._id !== id)
              .map((candidate) => {
                const checked = prereqCourseIds.includes(candidate._id);
                return (
                  <button
                    key={candidate._id}
                    type="button"
                    onClick={() => {
                      setPrereqCourseIds((current) =>
                        checked
                          ? current.filter((courseId) => courseId !== candidate._id)
                          : [...current, candidate._id],
                      );
                    }}
                    className={`rounded-md border px-3 py-2 text-left text-sm ${
                      checked
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <span className="block font-medium">{candidate.title}</span>
                    <span className="text-xs text-muted-foreground">{candidate.status}</span>
                  </button>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}

function docToText(doc: unknown): string {
  if (!doc || typeof doc !== "object" || !("content" in doc)) return "";
  const content = (doc as { content?: Array<{ content?: Array<{ text?: string }> }> }).content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => block.content?.map((inline) => inline.text ?? "").join("") ?? "")
    .join("\n\n")
    .trim();
}

function textToDoc(text: string) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => ({
      type: "paragraph",
      content: [{ type: "text", text: part }],
    }));
  return { type: "doc", content: paragraphs.length > 0 ? paragraphs : [{ type: "paragraph" }] };
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function toDateInput(value?: number): string {
  if (!value) return "";
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function fromDateInput(value: string): number | undefined {
  if (!value) return undefined;
  return new Date(`${value}T00:00:00`).getTime();
}

function QuickLink({
  to,
  courseId,
  icon: Icon,
  title,
  desc,
}: {
  to: "/lms/courses/$courseId/builder" | "/lms/courses/$courseId/generate" | "/lms/courses/$courseId/enrollees";
  courseId: string;
  icon: typeof Layers;
  title: string;
  desc: string;
}) {
  return (
    <Link
      to={to}
      params={{ courseId }}
      className="flex items-center gap-3 rounded-lg border border-border p-4 hover:border-primary"
    >
      <Icon className="h-5 w-5 text-muted-foreground" />
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </Link>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
