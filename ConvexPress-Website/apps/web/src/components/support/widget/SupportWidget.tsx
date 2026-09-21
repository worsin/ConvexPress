/**
 * Main Support Widget orchestrator.
 *
 * Renders the floating button and panel. Manages the state machine
 * that controls which view is displayed. Conditionally renders based
 * on widget config (enabled/disabled in settings).
 */

import { lazy, Suspense } from "react";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { WidgetButton } from "./WidgetButton";
import { WidgetPanel } from "./WidgetPanel";
import { WidgetErrorBoundary } from "./WidgetErrorBoundary";
import { useWidgetState } from "../hooks/useWidgetState";
import { useSessionId } from "../hooks/useSessionId";
const HomeView = lazy(() => import("../views/HomeView").then(module => ({ default: module.HomeView })));
const SearchResultsView = lazy(() => import("../views/SearchResultsView").then(module => ({ default: module.SearchResultsView })));
const AIAnswerView = lazy(() => import("../views/AIAnswerView").then(module => ({ default: module.AIAnswerView })));
const TicketFormView = lazy(() => import("../views/TicketFormView").then(module => ({ default: module.TicketFormView })));
const TicketListView = lazy(() => import("../views/TicketListView").then(module => ({ default: module.TicketListView })));
const TicketDetailView = lazy(() => import("../views/TicketDetailView").then(module => ({ default: module.TicketDetailView })));

const VIEW_TITLES: Record<string, string> = {
  home: "Support",
  search: "Search",
  searchResults: "Search Results",
  aiAnswer: "AI Answer",
  ticketForm: "New Ticket",
  ticketList: "My Tickets",
  ticketDetail: "Ticket",
};

export function SupportWidget() {
  const config = useQuery(api.support.widget.getConfig);
  const { sessionId, isReady } = useSessionId();
  const state = useWidgetState();

  // Don't render until config loads, or if widget is disabled
  if (config === undefined) return null;
  if (!config?.enabled) return null;

  const position = config.position === "bottomLeft" ? "bottomLeft" : "bottomRight";
  const greeting = config?.widgetTitle ?? "Hi! How can we help?";
  const title = VIEW_TITLES[state.currentView] ?? "Support";
  const showBack = state.currentView !== "home";

  return (
    <>
      <WidgetButton
        isOpen={state.isOpen}
        position={position}
        onClick={state.isOpen ? state.close : state.open}
      />

      <WidgetPanel
        isOpen={state.isOpen}
        position={position}
        title={title}
        showBack={showBack}
        onBack={state.goBack}
        onClose={state.close}
      >
        <WidgetErrorBoundary>
        <Suspense fallback={<p role="status" className="p-4 text-sm text-muted-foreground">Loading support…</p>}>
        {state.currentView === "home" && (
          <HomeView
            greeting={greeting}
            subtitle={config.widgetSubtitle}
            showKbSearch={config.showKbSearch}
            showTicketHistory={config.showTicketHistory}
            newTicketLabel={config.escalationButtonLabel}
            onSearch={state.search}
            onShowTickets={state.showTickets}
            onNewTicket={state.createTicket}
          />
        )}

        {state.currentView === "searchResults" && isReady && sessionId && (
          <SearchResultsView
            query={state.searchQuery}
            sessionId={sessionId}
            onSelectArticle={(categorySlug, slug) => {
              // Navigate to article in a new tab
              window.open(`/help/${categorySlug}/${slug}`, "_blank");
            }}
            onAIAnswer={(result) => state.showAIAnswer(result)}
            onStillNeedHelp={state.createTicket}
          />
        )}

        {state.currentView === "aiAnswer" && isReady && sessionId && (
          <AIAnswerView
            query={state.searchQuery}
            sessionId={sessionId}
            onHelpful={() => state.goHome()}
            onNotHelpful={state.createTicket}
            prefetchedResult={state.aiResult ?? undefined}
          />
        )}

        {state.currentView === "ticketForm" && isReady && sessionId && (
          <TicketFormView
            prefillQuery={state.searchQuery}
            onSuccess={(ticketId) => state.showTicketDetail(ticketId)}
            onCancel={state.goBack}
          />
        )}

        {state.currentView === "ticketList" && (
          <TicketListView
            onSelectTicket={state.showTicketDetail}
            onNewTicket={state.createTicket}
          />
        )}

        {state.currentView === "ticketDetail" && state.selectedTicketId && (
          <TicketDetailView
            ticketId={state.selectedTicketId}
          />
        )}
        </Suspense>
        </WidgetErrorBoundary>
      </WidgetPanel>
    </>
  );
}
