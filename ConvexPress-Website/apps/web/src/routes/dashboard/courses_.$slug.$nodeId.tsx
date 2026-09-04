import { createFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "@/dashboard/DashboardPage";
import { siteTitled } from "@/lib/seo/head";

export const Route = createFileRoute("/dashboard/courses_/$slug/$nodeId")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex" },
      { title: siteTitled("Lesson") },
    ],
  }),
  component: CoursePlayerRoute,
});

function CoursePlayerRoute() {
  const { slug, nodeId } = Route.useParams();
  return <DashboardPage id="courses" subpath={`/${slug}/${nodeId}`} />;
}
