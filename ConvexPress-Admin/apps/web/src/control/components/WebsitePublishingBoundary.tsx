import { Component, type ReactNode } from "react";
/** A rollout or provider failure must never take down the surrounding agency workspace. */
export class WebsitePublishingBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <section aria-label="Website publishing" className="space-y-2 border-t border-border px-[18px] py-4">
      <p role="alert" className="text-sm text-muted-foreground">Website publishing is temporarily unavailable. The rest of this environment remains available.</p>
      <button type="button" className="text-sm font-medium underline underline-offset-4" onClick={() => this.setState({ failed: false })}>Retry publishing connection</button>
    </section>;
    return this.props.children;
  }
}
