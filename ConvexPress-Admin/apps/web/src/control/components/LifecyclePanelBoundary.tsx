import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** A failed history query must not unmount the active site admin. */
export class LifecyclePanelBoundary extends Component<{
  children: ReactNode;
  onClose: () => void;
}, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <aside aria-label="Site operations" className="absolute inset-y-0 right-0 z-[80] flex w-full max-w-[34rem] flex-col gap-4 border-l border-border bg-background p-5 shadow-float">
      <h2 className="font-serif text-2xl">Site operations</h2>
      <p role="alert">Operations could not be loaded. Retry to check the current status of backups and maintenance.</p>
      <div className="flex gap-2">
        <Button onClick={() => this.setState({ failed: false })}>Retry operations</Button>
        <Button variant="outline" onClick={this.props.onClose}>Close site operations</Button>
      </div>
    </aside>;
  }
}
