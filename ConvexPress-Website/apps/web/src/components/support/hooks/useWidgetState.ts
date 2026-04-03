/**
 * Widget state machine hook.
 *
 * Controls which view the support widget displays and manages
 * navigation history for the back button.
 *
 * States: closed | home | search | searchResults | aiAnswer | ticketForm | ticketList | ticketDetail
 *
 * State machine transitions:
 *   closed -> home (open)
 *   home -> searchResults (search)
 *   home -> ticketList (showTickets)
 *   home -> ticketForm (createTicket)
 *   searchResults -> aiAnswer (showAIAnswer)
 *   searchResults -> ticketForm (createTicket / stillNeedHelp)
 *   aiAnswer -> ticketForm (notHelpful -> createTicket)
 *   aiAnswer -> home (helpful)
 *   ticketList -> ticketDetail (showTicketDetail)
 *   ticketForm -> ticketDetail (success)
 *   any -> home (goHome)
 *   any -> previous (goBack)
 *   any -> closed (close)
 */

import { useReducer, useCallback } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────

type WidgetView =
  | "home"
  | "search"
  | "searchResults"
  | "aiAnswer"
  | "ticketForm"
  | "ticketList"
  | "ticketDetail";

interface WidgetState {
  isOpen: boolean;
  currentView: WidgetView;
  searchQuery: string;
  selectedTicketId: string | null;
  history: WidgetView[];
}

type WidgetAction =
  | { type: "OPEN" }
  | { type: "CLOSE" }
  | { type: "SEARCH"; query: string }
  | { type: "SHOW_RESULTS" }
  | { type: "SHOW_AI_ANSWER" }
  | { type: "CREATE_TICKET" }
  | { type: "SHOW_TICKETS" }
  | { type: "SHOW_TICKET_DETAIL"; ticketId: string }
  | { type: "GO_BACK" }
  | { type: "GO_HOME" };

// ─── Reducer ───────────────────────────────────────────────────────────────

const initialState: WidgetState = {
  isOpen: false,
  currentView: "home",
  searchQuery: "",
  selectedTicketId: null,
  history: [],
};

function widgetReducer(state: WidgetState, action: WidgetAction): WidgetState {
  switch (action.type) {
    case "OPEN":
      return {
        ...state,
        isOpen: true,
        currentView: "home",
        history: [],
      };

    case "CLOSE":
      return {
        ...state,
        isOpen: false,
      };

    case "SEARCH":
      return {
        ...state,
        currentView: "searchResults",
        searchQuery: action.query,
        history: [...state.history, state.currentView],
      };

    case "SHOW_RESULTS":
      return {
        ...state,
        currentView: "searchResults",
        history: [...state.history, state.currentView],
      };

    case "SHOW_AI_ANSWER":
      return {
        ...state,
        currentView: "aiAnswer",
        history: [...state.history, state.currentView],
      };

    case "CREATE_TICKET":
      return {
        ...state,
        currentView: "ticketForm",
        history: [...state.history, state.currentView],
      };

    case "SHOW_TICKETS":
      return {
        ...state,
        currentView: "ticketList",
        history: [...state.history, state.currentView],
      };

    case "SHOW_TICKET_DETAIL":
      return {
        ...state,
        currentView: "ticketDetail",
        selectedTicketId: action.ticketId,
        history: [...state.history, state.currentView],
      };

    case "GO_BACK": {
      const newHistory = [...state.history];
      const previousView = newHistory.pop() ?? "home";
      return {
        ...state,
        currentView: previousView,
        history: newHistory,
      };
    }

    case "GO_HOME":
      return {
        ...state,
        currentView: "home",
        searchQuery: "",
        selectedTicketId: null,
        history: [],
      };

    default:
      return state;
  }
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useWidgetState() {
  const [state, dispatch] = useReducer(widgetReducer, initialState);

  const open = useCallback(() => dispatch({ type: "OPEN" }), []);
  const close = useCallback(() => dispatch({ type: "CLOSE" }), []);
  const search = useCallback(
    (query: string) => dispatch({ type: "SEARCH", query }),
    [],
  );
  const showResults = useCallback(
    () => dispatch({ type: "SHOW_RESULTS" }),
    [],
  );
  const showAIAnswer = useCallback(
    () => dispatch({ type: "SHOW_AI_ANSWER" }),
    [],
  );
  const createTicket = useCallback(
    () => dispatch({ type: "CREATE_TICKET" }),
    [],
  );
  const showTickets = useCallback(
    () => dispatch({ type: "SHOW_TICKETS" }),
    [],
  );
  const showTicketDetail = useCallback(
    (ticketId: string) =>
      dispatch({ type: "SHOW_TICKET_DETAIL", ticketId }),
    [],
  );
  const goBack = useCallback(() => dispatch({ type: "GO_BACK" }), []);
  const goHome = useCallback(() => dispatch({ type: "GO_HOME" }), []);

  return {
    ...state,
    open,
    close,
    search,
    showResults,
    showAIAnswer,
    createTicket,
    showTickets,
    showTicketDetail,
    goBack,
    goHome,
  };
}
