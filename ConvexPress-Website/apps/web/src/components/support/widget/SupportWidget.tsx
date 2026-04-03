/**
 * Main Support Widget orchestrator.
 *
 * Renders the floating button and panel. Manages the state machine
 * that controls which view is displayed. Conditionally renders based
 * on widget config (enabled/disabled in settings).
 */

import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { WidgetButton } from "./WidgetButton";
import { WidgetPanel } from "./WidgetPanel";
import { useWidgetState } from "../hooks/useWidgetState";
import { useSessionId } from "../hooks/useSessionId";
import { HomeView } from "../views/HomeView";
import { SearchResultsView } from "../views/SearchResultsView";
import { AIAnswerView } from "../views/AIAnswerView";
import { TicketFormView } from "../views/TicketFormView";
import { TicketListView } from "../views/TicketListView";
import { TicketDetailView } from "../views/TicketDetailView";

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
  if (!config.enabled) return null;

  const position = config?.position ?? "bottomRight";
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
        {state.currentView === "home" && (
          <HomeView
            greeting={greeting}
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
            sessionId={sessionId}
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
      </WidgetPanel>
    </>
  );
}
