import { api } from "@convexpress-website/backend/generated/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Award, BookOpen, GraduationCap, PlayCircle } from "lucide-react";

import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { MediaImage } from "@/components/media/MediaImage";
import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/dashboard/courses")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex" },
      { title: "My Courses - ConvexPress" },
    ],
  }),
  component: DashboardCoursesPage,
});

type LearningCourse = {
  enrollmentId: string;
  courseId: string;
  title: string;
  slug: string;
  excerpt?: string;
  featuredImageId?: string;
  lessonCount: number;
  enrolledAt: number;
  expiresAt?: number;
  percent: number;
  completedCount: number;
  nextNodeId?: string | null;
  certificateSerial?: string;
};

function DashboardCoursesPage() {
  return (
    <PublicPluginGate pluginId="lms">
      <DashboardCoursesContent />
    </PublicPluginGate>
  );
}

function DashboardCoursesContent() {
  const courses = useQuery((api as any).lms.enrollment.queries.listMyLearning, {}) as
    | LearningCourse[]
    | undefined;

  if (courses === undefined) {
    return <CoursesSkeleton />;
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-sm font-medium text-foreground">My Courses</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Continue lessons, review progress, and access earned certificates.
        </p>
      </header>

      {courses.length === 0 ? (
        <DashboardCard title="No courses yet">
          <EmptyState
            icon={GraduationCap}
            title="You are not enrolled in any courses"
            description="Browse the course catalog and enroll to start learning."
            action={{ label: "Browse courses", href: "/courses" }}
          />
        </DashboardCard>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {courses.map((course) => (
            <CourseCard key={course.enrollmentId} course={course} />
          ))}
        </div>
      )}
    </div>
  );
}

function CoursesSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-64" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    </div>
  );
}

function CourseCard({ course }: { course: LearningCourse }) {
  const percent = Math.min(Math.max(course.percent, 0), 100);
  const continueTarget = course.nextNodeId
    ? ({
        to: "/dashboard/courses/$slug/$nodeId",
        params: { slug: course.slug, nodeId: course.nextNodeId },
      } as const)
    : ({
        to: "/courses/$slug",
        params: { slug: course.slug },
      } as const);

  return (
    <article className="overflow-hidden border border-border bg-card text-card-foreground">
      <div className="aspect-[16/9] bg-muted/40">
        {course.featuredImageId ? (
          <MediaImage
            mediaId={course.featuredImageId as any}
            alt={course.title}
            className="h-full w-full object-cover"
            preferredSize="large"
            sizes="(max-width: 1024px) 100vw, 50vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Course
          </div>
        )}
      </div>

      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="line-clamp-2 text-base font-semibold text-foreground">
              {course.title}
            </h2>
            {course.excerpt ? (
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                {course.excerpt}
              </p>
            ) : null}
          </div>
          {course.certificateSerial ? (
            <Link
              to="/certificates/verify"
              search={{ serial: course.certificateSerial }}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <Award className="size-3.5" aria-hidden="true" />
              Certificate
            </Link>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{course.completedCount} of {course.lessonCount} lessons</span>
            <span>{percent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <BookOpen className="size-3.5" aria-hidden="true" />
            Enrolled {formatDate(course.enrolledAt)}
          </span>
          <Link
            {...continueTarget}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            <PlayCircle className="size-3.5" aria-hidden="true" />
            {percent >= 100 ? "Review course" : "Continue"}
          </Link>
        </div>
      </div>
    </article>
  );
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
