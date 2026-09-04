import { createFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "@/dashboard/DashboardPage";
import { siteTitled } from "@/lib/seo/head";

/**
 * Nested ticket pages under the built-in /dashboard base path:
 *   /dashboard/tickets/new              new ticket
 *   /dashboard/tickets/<ticketNumber>   thread
 * (`tickets_` keeps this a sibling of /dashboard/tickets rather than a child,
 * since the list route renders no Outlet.) The tickets page module (dashboard/pages/tickets/manifest.tsx) switches on
 * the subpath, exactly as it does under a configurable base path.
 */
export const Route = createFileRoute("/dashboard/tickets_/$")({
  head: ({ params }) => ({
    meta: [
      { name: "robots", content: "noindex" },
      { title: siteTitled(params._splat?.toLowerCase() === "new" ? "New support ticket" : "Support ticket") },
    ],
  }),
  component: TicketSubpage,
});

function TicketSubpage() {
  const { _splat } = Route.useParams();
  const subpath = _splat ? `/${_splat}` : "";
  return <DashboardPage id="tickets" subpath={subpath} />;
}
