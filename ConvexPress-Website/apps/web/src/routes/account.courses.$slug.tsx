import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/account/courses/$slug")({
  component: AccountCourseRedirect,
});

function AccountCourseRedirect() {
  const { slug } = Route.useParams();
  return <Navigate to="/courses/$slug" params={{ slug }} replace />;
}
