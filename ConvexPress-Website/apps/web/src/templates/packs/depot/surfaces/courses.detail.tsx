/**
 * Depot · courses.detail — course overview as a marketplace listing: image
 * 5/12, facts table 4/12, sticky enrol box 3/12; then the description card
 * and the curriculum as one data table (topic rows, lesson rows, preview
 * links). CTA gates match Core's `CourseCta` exactly.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, Award, BookOpen, CheckCircle2, PlayCircle } from "lucide-react";

import { CourseImageFallback } from "@/components/lms/CourseImageFallback";
import { LessonContentRenderer } from "@/components/lms/LessonContentRenderer";
import { MediaImage } from "@/components/media/MediaImage";
import type { Course, CourseAccess, CourseDetailSurfaceData } from "@/templates/packs/core/surfaces/courses.detail";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, Breadcrumbs, Button, Card, Container, DataTable, EmptyState, Label, LinkButton, SectionHeading, StickyPanel, Td, Th, buttonClasses } from "../parts";

function formatCents(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount / 100);
}

function accessLabel(mode?: string) {
  switch (mode) {
    case "open":
      return "Open access";
    case "free":
      return "Free enrollment";
    case "buy":
      return "One-time purchase";
    case "recurring":
      return "Subscription";
    case "closed":
      return "Closed";
    case "members":
    default:
      return "Members";
  }
}

function bigPrice(course: Course): string {
  if (course.accessMode === "buy" && typeof course.price === "number") return formatCents(course.price);
  if (course.accessMode === "recurring" && typeof course.recurringPrice === "number") return `${formatCents(course.recurringPrice)}/mo`;
  if (course.accessMode === "open" || course.accessMode === "free") return "Free";
  if (course.accessMode === "buy") return "Paid";
  if (course.accessMode === "recurring") return "Subscription";
  return "Members";
}

export default function DepotCourseDetail({ data }: SurfaceProps<CourseDetailSurfaceData>) {
  const { course, tree, access, isSignedIn, firstLessonId, canEnterDashboard, canSelfEnroll, actions } = data;
  const lessonTotal = tree.topics.reduce((sum, topic) => sum + topic.children.filter((child) => child.kind === "lesson").length, 0);

  return (
    <Container padded={false} data-slot="course-detail" data-pack="depot" className="flex flex-col gap-6 py-6 md:py-8">
      <Breadcrumbs items={[{ label: "Courses", to: "/courses" }, { label: course.title }]} />

      <div className="grid gap-4 lg:grid-cols-12 lg:items-start">
        <Card className="overflow-hidden lg:col-span-5">
          <div className="aspect-[4/3] bg-muted/40">
            {course.featuredImageId ? (
              <MediaImage mediaId={course.featuredImageId as any} alt={course.title} className="h-full w-full object-cover" preferredSize="large" sizes="(max-width: 1024px) 100vw, 40vw" loading="eager" />
            ) : (
              <CourseImageFallback title={course.title} subtitle={`${course.lessonCount ?? 0} lessons`} />
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-3 lg:col-span-4">
          <div className="flex flex-col gap-1.5">
            <Label>{accessLabel(course.accessMode)}</Label>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{course.title}</h1>
            {course.excerpt ? <p className="text-[13px] leading-5 text-muted-foreground">{course.excerpt}</p> : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="new">
              <BookOpen className="mr-1 size-3" aria-hidden="true" />
              {course.lessonCount ?? 0} lessons
            </Badge>
            <Badge tone="stock">{course.accessMode ?? "members"}</Badge>
            {course.certificateId ? (
              <Badge tone="sale">
                <Award className="mr-1 size-3" aria-hidden="true" />
                Certificate
              </Badge>
            ) : null}
          </div>
          <DataTable
            caption="Course facts"
            firstColumnLabel
            rows={[
              { key: "lessons", cells: ["Lessons", <span className="tabular-nums">{course.lessonCount ?? lessonTotal}</span>] },
              { key: "topics", cells: ["Topics", <span className="tabular-nums">{course.topicCount ?? tree.topics.length}</span>] },
              { key: "access", cells: ["Access", accessLabel(course.accessMode)] },
              { key: "certificate", cells: ["Certificate", course.certificateId ? "Issued on completion" : "None"] },
            ]}
          />
        </div>

        <StickyPanel label="Enrol" className="lg:col-span-3">
          <div className="flex flex-col gap-0.5">
            <Label>Price</Label>
            <span className="text-3xl font-semibold tabular-nums text-foreground">{bigPrice(course)}</span>
          </div>
          <CourseCta course={course} firstLessonId={firstLessonId} isSignedIn={isSignedIn} canEnterDashboard={canEnterDashboard} canSelfEnroll={canSelfEnroll} access={access} onEnroll={actions.enroll} />
          <ul className="flex flex-col gap-1 text-[13px] text-muted-foreground">
            <li className="flex items-center gap-2">
              <PlayCircle className="size-3.5" aria-hidden="true" />
              {course.lessonCount ?? lessonTotal} lessons across {course.topicCount ?? tree.topics.length} topics
            </li>
            {course.certificateId ? (
              <li className="flex items-center gap-2">
                <Award className="size-3.5" aria-hidden="true" />
                Certificate of completion
              </li>
            ) : null}
          </ul>
        </StickyPanel>
      </div>

      {course.descriptionDoc ? (
        <section className="flex flex-col gap-3">
          <SectionHeading title="About this course" />
          <Card className="p-4">
            <LessonContentRenderer doc={course.descriptionDoc} fallbackText={course.excerpt} emptyLabel="Course description is being prepared." className="text-sm leading-6" />
          </Card>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionHeading title="Curriculum" count={lessonTotal > 0 ? `${lessonTotal} lessons` : undefined} />
        <p className="text-[13px] text-muted-foreground">Follow the course in order from topic to topic.</p>
        {tree.topics.length === 0 ? (
          <EmptyState title="Curriculum is being prepared." />
        ) : (
          <DataTable caption="Course curriculum">
            <thead>
              <tr>
                <Th className="w-12">#</Th>
                <Th>Lesson</Th>
                <Th className="w-28">Type</Th>
                <Th className="w-28 text-right">Access</Th>
              </tr>
            </thead>
            <tbody>
              {tree.topics.map((topic, topicIndex) => {
                const lessons = topic.children.filter((child) => child.kind === "lesson").length;
                return [
                  <tr key={topic._id} className="border-t border-border bg-muted/40">
                    <Th scope="row" className="tabular-nums">
                      {topicIndex + 1}
                    </Th>
                    <Td className="text-sm font-semibold text-foreground" colSpan={2}>
                      {topic.title}
                    </Td>
                    <Td align="right" className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {lessons} lessons
                    </Td>
                  </tr>,
                  ...topic.children.map((child, childIndex) => (
                    <tr key={child._id} className="border-t border-border">
                      <Td className="tabular-nums text-muted-foreground">
                        {topicIndex + 1}.{childIndex + 1}
                      </Td>
                      <Td>
                        <span className="flex min-w-0 items-center gap-2">
                          {child.kind === "lesson" ? <PlayCircle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : <BookOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                          {child.kind === "lesson" && child.isPreview ? (
                            <Link to="/courses/$slug/$nodeId" params={{ slug: course.slug, nodeId: child._id }} className="truncate font-medium text-primary hover:underline">
                              {child.title}
                            </Link>
                          ) : (
                            <span className="truncate text-foreground">{child.title}</span>
                          )}
                        </span>
                      </Td>
                      <Td className="capitalize text-muted-foreground">{child.kind}</Td>
                      <Td align="right">{child.isPreview ? <Badge tone="sale">Preview</Badge> : <span className="text-[13px] text-muted-foreground">Enrolled</span>}</Td>
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </DataTable>
        )}
      </section>
    </Container>
  );
}

function CourseCta({
  course,
  firstLessonId,
  isSignedIn,
  canEnterDashboard,
  canSelfEnroll,
  access,
  onEnroll,
}: {
  course: Course;
  firstLessonId?: string;
  isSignedIn: boolean;
  canEnterDashboard: boolean;
  canSelfEnroll: boolean;
  access?: CourseAccess;
  onEnroll: () => void;
}) {
  if (canEnterDashboard && firstLessonId) {
    return (
      <LinkButton to="/dashboard/courses/$slug/$nodeId" params={{ slug: course.slug, nodeId: firstLessonId }} className="w-full">
        Continue learning
        <ArrowRight className="size-4" aria-hidden="true" />
      </LinkButton>
    );
  }

  if (!isSignedIn && (access?.requiresLogin || course.accessMode !== "open")) {
    return (
      <LinkButton to="/login" search={{ returnTo: `/courses/${course.slug}` }} className="w-full">
        Sign in to enroll
        <ArrowRight className="size-4" aria-hidden="true" />
      </LinkButton>
    );
  }

  if (!isSignedIn && course.accessMode === "open" && firstLessonId) {
    return (
      <LinkButton to="/courses/$slug/$nodeId" params={{ slug: course.slug, nodeId: firstLessonId }} className="w-full">
        Start learning
        <ArrowRight className="size-4" aria-hidden="true" />
      </LinkButton>
    );
  }

  if (course.accessMode === "buy" || course.accessMode === "recurring") {
    const href = safeCourseUrl(course.externalButtonUrl) ?? "/pricing";
    return (
      <a href={href} className={buttonClasses("primary", "md", "w-full")}>
        Get access
        <ArrowRight className="size-4" aria-hidden="true" />
      </a>
    );
  }

  if (canSelfEnroll) {
    return (
      <Button type="button" onClick={onEnroll} className="w-full">
        <CheckCircle2 className="size-4" aria-hidden="true" />
        Enroll now
      </Button>
    );
  }

  return <div className="rounded-md border border-border bg-muted/40 p-3 text-[13px] leading-5 text-muted-foreground">This course is restricted. Check your membership or contact the site team for access.</div>;
}

function safeCourseUrl(value?: string | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
