import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/account/courses/$slug/$nodeId")({
  component: AccountCoursePlayerRedirect,
});

function AccountCoursePlayerRedirect() {
  const { slug, nodeId } = Route.useParams();
  return (
    <Navigate
      to="/dashboard/courses/$slug/$nodeId"
      params={{ slug, nodeId }}
      replace
    />
  );
}
