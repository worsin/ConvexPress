/**
 * Journal · dashboard.courses — enrolled courses as rule-separated rows: a
 * 3:2 image, the title in display type, the progress as a hairline, small
 * caps for the lesson count and the enrolment date, and the resume /
 * certificate links Core offers.
 */
import { Link } from "@tanstack/react-router";

import { CourseImageFallback } from "@/components/lms/CourseImageFallback";
import { MediaImage } from "@/components/media/MediaImage";
import type { DashboardCoursesSurfaceData, DashboardLearningCourse } from "@/templates/packs/core/surfaces/dashboard.courses";
import type { SurfaceProps } from "@/templates/sdk/types";

import { EmptyState, LinkButton, SkeletonBlock, SmallCaps } from "../parts";
import { PageHeading, ProgressLine, Row, RowList, dashDate, textActionClasses } from "../parts/extra-dashboard";

export default function JournalDashboardCourses({ data }: SurfaceProps<DashboardCoursesSurfaceData>) {
  const { courses, hrefs } = data;

  return (
    <div data-slot="dashboard-courses" className="flex flex-col gap-10">
      <PageHeading eyebrow="Learning" title="My courses" lede="Continue lessons, review progress, and access earned certificates." />

      {courses === undefined ? (
        <div className="flex flex-col divide-y divide-border border-y border-border" aria-hidden="true">
          {[0, 1].map((index) => (
            <div key={index} className="grid gap-6 py-8 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <SkeletonBlock className="aspect-[3/2] rounded-2xl" />
              <div className="flex flex-col gap-3">
                <SkeletonBlock className="h-6 w-2/3" />
                <SkeletonBlock className="h-3 w-1/3 rounded-full" />
                <SkeletonBlock className="h-1 w-full rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : courses.length === 0 ? (
        <EmptyState
          eyebrow="No courses yet"
          title="You are not enrolled in any courses."
          action={
            <LinkButton to={hrefs.catalog} variant="primary">
              Browse courses
            </LinkButton>
          }
        />
      ) : (
        <RowList aria-label="Enrolled courses">
          {courses.map((course) => (
            <CourseRow key={course.enrollmentId} course={course} hrefs={hrefs} />
          ))}
        </RowList>
      )}
    </div>
  );
}

function CourseRow({ course, hrefs }: { course: DashboardLearningCourse; hrefs: DashboardCoursesSurfaceData["hrefs"] }) {
  const percent = Math.min(Math.max(course.percent, 0), 100);
  const continueHref = course.nextNodeId ? hrefs.lesson(course.slug, course.nextNodeId) : hrefs.course(course.slug);

  return (
    <Row className="grid gap-6 py-8 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-8">
      <Link to={continueHref as any} className="block overflow-hidden rounded-2xl bg-muted" tabIndex={-1} aria-hidden="true">
        <div className="aspect-[3/2] w-full">
          {course.featuredImageId ? (
            <MediaImage mediaId={course.featuredImageId as any} alt={course.title} className="h-full w-full object-cover" preferredSize="medium" sizes="(max-width: 640px) 100vw, 160px" />
          ) : (
            <CourseImageFallback title={course.title} subtitle={`${percent}% complete`} />
          )}
        </div>
      </Link>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 className="font-display text-xl leading-snug tracking-tight text-foreground">
            <Link to={continueHref as any} className="transition-colors hover:text-primary">
              {course.title}
            </Link>
          </h2>
          {course.excerpt ? <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">{course.excerpt}</p> : null}
        </div>

        <div className="flex flex-col gap-2">
          <ProgressLine percent={percent} label={`${course.title} progress`} />
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <SmallCaps className="tabular-nums">
              {course.completedCount} of {course.lessonCount} lessons
            </SmallCaps>
            <Dot />
            <SmallCaps className="tabular-nums">{percent}%</SmallCaps>
            <Dot />
            <SmallCaps>Enrolled {dashDate(course.enrolledAt)}</SmallCaps>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <LinkButton to={continueHref} variant={percent >= 100 ? "ghost" : "primary"} className="h-10 px-5">
            {percent >= 100 ? "Review course" : "Continue"}
          </LinkButton>
          {course.certificateSerial ? (
            <Link to={hrefs.certificate(course.certificateSerial) as any} className={textActionClasses("primary")}>
              Certificate
            </Link>
          ) : null}
          {course.certificateSerial && course.certificatePdfUrl ? (
            <a href={course.certificatePdfUrl} target="_blank" rel="noreferrer" className={textActionClasses("muted")}>
              Download PDF
            </a>
          ) : null}
        </div>
      </div>
    </Row>
  );
}

function Dot() {
  return (
    <span className="text-muted-foreground/60" aria-hidden="true">
      ·
    </span>
  );
}
