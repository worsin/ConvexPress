import { api } from "@convexpress-website/backend/generated/api";
import { Navigate, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

export const Route = createFileRoute("/account/courses/$slug")({
  component: AccountCourseRedirect,
});

type LearningCourse = {
  slug: string;
  nextNodeId: string | null;
};

function AccountCourseRedirect() {
  const { slug } = Route.useParams();
  const courses = useQuery((api as any).lms.enrollment.queries.listMyLearning, {}) as
    | LearningCourse[]
    | undefined;
  const enrolledCourse = courses?.find((course) => course.slug === slug);

  if (courses === undefined) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-sm text-muted-foreground">
        Loading course...
      </div>
    );
  }

  if (enrolledCourse?.nextNodeId) {
    return (
      <Navigate
        to="/dashboard/courses/$slug/$nodeId"
        params={{ slug, nodeId: enrolledCourse.nextNodeId }}
        replace
      />
    );
  }

  return <Navigate to="/courses/$slug" params={{ slug }} replace />;
}
