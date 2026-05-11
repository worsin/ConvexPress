import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  routeKey?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary scoped to the admin page content area.
 *
 * Unlike `AdminShellErrorBoundary` which replaces the entire shell,
 * this boundary only replaces the `<Outlet />` content — the sidebar,
 * admin bar, breadcrumbs, and footer stay visible. Pass `routeKey`
 * (e.g. the current pathname) to auto-reset the error state when the
 * user navigates to a different route.
 */
export class AdminContentErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidUpdate(prevProps: Props) {
    if (
      this.state.hasError &&
      prevProps.routeKey !== this.props.routeKey
    ) {
      this.setState({ hasError: false, error: null });
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[AdminContent] Rendering error caught by boundary:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const message = this.state.error?.message ?? "Unknown error";
      return (
        <div className="mx-auto max-w-2xl py-12">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="size-6 text-destructive" />
            </div>
            <h2 className="mb-2 text-lg font-semibold text-foreground">
              This page hit an error
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              The page content failed to render. The admin shell is still
              available — pick another page from the sidebar, or try again.
            </p>
            <pre className="mx-auto mb-6 max-h-48 max-w-full overflow-auto rounded-sm border border-border bg-card p-3 text-left text-xs text-muted-foreground">
              {message}
            </pre>
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 rounded-sm border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <RefreshCw className="size-4" />
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
