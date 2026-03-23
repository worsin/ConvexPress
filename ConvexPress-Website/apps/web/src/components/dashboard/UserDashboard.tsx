import type { UserProfile, WebsiteDashboardData } from "@/lib/dashboard/types";
import { DashboardWidgetGrid } from "./DashboardWidgetGrid";
import { ContentPerformanceWidget } from "./widgets/ContentPerformanceWidget";
import { MyCommentsWidget } from "./widgets/MyCommentsWidget";
import { MyContentWidget } from "./widgets/MyContentWidget";
import { MyNotificationsWidget } from "./widgets/MyNotificationsWidget";
import { QuickLinksWidget } from "./widgets/QuickLinksWidget";

interface UserDashboardProps {
  user: UserProfile;
  dashboardData: WebsiteDashboardData | undefined;
}

/**
 * Main container for the /dashboard home page.
 * Renders a static 2-column widget grid with personalized content.
 */
export function UserDashboard({ user, dashboardData }: UserDashboardProps) {
  const firstName = user.firstName ?? user.displayName.split(" ")[0] ?? "there";

  return (
    <div data-slot="user-dashboard" className="space-y-6">
      {/* Welcome heading */}
      <div>
        <h1 className="text-sm font-medium text-foreground">
          Welcome back, {firstName}!
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Here's what's happening with your account.
        </p>
      </div>

      {/* Widget grid: 2 columns on desktop, 1 column on mobile */}
      <DashboardWidgetGrid>
        {/* Left column items (PRD order) */}
        <MyContentWidget data={dashboardData?.myPosts} />
        <MyCommentsWidget data={dashboardData?.myComments} />

        {/* Right column items (PRD order) */}
        <MyNotificationsWidget data={dashboardData?.unreadNotifications} />
        <QuickLinksWidget user={user} />

        {/* Full-width content performance (Author+ only) */}
        <ContentPerformanceWidget
          data={dashboardData?.contentPerformance}
        />
      </DashboardWidgetGrid>
    </div>
  );
}
