import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/account/courses")({
  component: AccountCoursesRedirect,
});

function AccountCoursesRedirect() {
  return <Navigate to="/dashboard/courses" replace />;
}
