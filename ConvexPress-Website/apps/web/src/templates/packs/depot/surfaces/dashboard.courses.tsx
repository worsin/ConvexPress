/**
 * Depot · dashboard.courses — enrolled courses as a dense card grid: 16:9
 * image, title, excerpt, progress bar with the lesson count, enrolled date,
 * "Continue" / "Review course" and the certificate links. Same hrefs and
 * states as Core.
 */
import { Link } from "@tanstack/react-router";
import { Award, BookOpen, PlayCircle } from "lucide-react";

import { CourseImageFallback } from "@/components/lms/CourseImageFallback";
import { MediaImage } from "@/components/media/MediaImage";
import type { DashboardCoursesSurfaceData, DashboardLearningCourse } from "@/templates/packs/core/surfaces/dashboard.courses";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Card, EmptyState, Skeleton, buttonClasses } from "../parts";
import { DashboardPageHeader, Progress, dateOrDash } from "../parts/extra-dashboard";

export default function DepotDashboardCourses({ data }: SurfaceProps<DashboardCoursesSurfaceData>) {
  const { courses, hrefs } = data;

  return (
    <div data-slot="dashboard-courses" data-pack="depot" className="flex flex-col gap-4">
      <DashboardPageHeader
        eyebrow="Learning"
        title="My courses"
        description="Continue lessons, review progress, and access earned certificates."
        meta={courses ? `${courses.length} ${courses.length === 1 ? "course" : "courses"}` : undefined}
      />

      {courses === undefined ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="hidden h-64 xl:block" />
        </div>
      ) : courses.length === 0 ? (
        <EmptyState
          title="You are not enrolled in any courses"
          description="Browse the course catalog and enroll to start learning."
          action={
            <Link to={hrefs.catalog} className={buttonClasses("primary")}>
              Browse courses
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <CourseCard key={course.enrollmentId} course={course} hrefs={hrefs} />
          ))}
        </div>
      )}
    </div>
  );
}

function CourseCard({ course, hrefs }: { course: DashboardLearningCourse; hrefs: DashboardCoursesSurfaceData["hrefs"] }) {
  const percent = Math.min(Math.max(course.percent, 0), 100);
  const continueHref = course.nextNodeId ? hrefs.lesson(course.slug, course.nextNodeId) : hrefs.course(course.slug);

  return (
    <Card as="article" className="flex flex-col overflow-hidden">
      <Link to={continueHref} className="block aspect-video bg-muted/40">
        {course.featuredImageId ? (
          <MediaImage mediaId={course.featuredImageId as any} alt={course.title} className="h-full w-full object-cover" preferredSize="large" sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw" />
        ) : (
          <CourseImageFallback title={course.title} subtitle={`${percent}% complete`} />
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="flex flex-col gap-1">
          <h2 className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">{course.title}</h2>
          {course.excerpt ? <p className="line-clamp-2 text-[13px] leading-5 text-muted-foreground">{course.excerpt}</p> : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs tabular-nums text-muted-foreground">
            <span>
              {course.completedCount} of {course.lessonCount} lessons
            </span>
            <span className="font-semibold text-foreground">{percent}%</span>
          </div>
          <Progress value={percent} label={`${course.title} progress`} />
        </div>

        {course.certificateSerial ? (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <Link to={hrefs.certificate(course.certificateSerial)} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
              <Award className="size-3.5" aria-hidden="true" />
              Certificate
            </Link>
            {course.certificatePdfUrl ? (
              <a href={course.certificatePdfUrl} target="_blank" rel="noreferrer" className="font-medium text-muted-foreground hover:text-foreground hover:underline">
                Download PDF
              </a>
            ) : null}
          </div>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <BookOpen className="size-3.5" aria-hidden="true" />
            Enrolled {dateOrDash(course.enrolledAt)}
          </span>
          <Link to={continueHref} className={buttonClasses("primary", "sm")}>
            <PlayCircle className="size-3.5" aria-hidden="true" />
            {percent >= 100 ? "Review course" : "Continue"}
          </Link>
        </div>
      </div>
    </Card>
  );
}
