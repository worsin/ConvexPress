/**
 * Widget System - WidgetErrorBoundary
 *
 * Error boundary that wraps individual widget render components.
 * If a widget crashes, this catches the error and renders nothing,
 * preventing one broken widget from taking down the entire sidebar.
 *
 * In development, logs the error to the console.
 */

import { Component, type ReactNode } from "react";

interface Props {
  widgetType: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class WidgetErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error(
        `[Widget Error] Widget type "${this.props.widgetType}" crashed:`,
        error,
        errorInfo,
      );
    }
  }

  render() {
    if (this.state.hasError) {
      // Render nothing in production - the widget silently disappears
      return null;
    }

    return this.props.children;
  }
}
