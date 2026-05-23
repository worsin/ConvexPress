import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_marketing/$slug")({
  component: RootSlugPage,
});

function RootSlugPage() {
  const { slug } = Route.useParams();
  return <Navigate to="/page/$" params={{ _splat: slug }} replace />;
}
