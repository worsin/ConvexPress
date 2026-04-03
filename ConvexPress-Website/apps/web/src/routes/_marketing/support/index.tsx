import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@clerk/clerk-react";
import { LifeBuoy, MessageSquarePlus, List, Search } from "lucide-react";

export const Route = createFileRoute("/_marketing/support/")({
  component: SupportLandingPage,
  head: () => ({
    meta: [{ title: "Support - ConvexPress" }],
  }),
});

function SupportLandingPage() {
  const { isSignedIn } = useAuth();

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
      {/* Hero */}
      <div className="text-center space-y-3">
        <LifeBuoy className="h-12 w-12 mx-auto text-primary" />
        <h1 className="text-3xl font-bold">How can we help?</h1>
        <p className="text-lg text-foreground/60 max-w-lg mx-auto">
          Browse our help center, search for answers, or submit a support
          ticket and we'll get back to you as soon as possible.
        </p>
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          to="/support/new"
          className="rounded-lg border border-border p-6 hover:border-primary/40 hover:shadow-sm transition-all text-center space-y-2"
        >
          <MessageSquarePlus className="h-8 w-8 mx-auto text-primary" />
          <h2 className="text-lg font-semibold">Submit a Ticket</h2>
          <p className="text-sm text-foreground/50">
            Describe your issue and our team will respond promptly.
          </p>
        </Link>

        {isSignedIn && (
          <Link
            to="/support/tickets"
            className="rounded-lg border border-border p-6 hover:border-primary/40 hover:shadow-sm transition-all text-center space-y-2"
          >
            <List className="h-8 w-8 mx-auto text-primary" />
            <h2 className="text-lg font-semibold">My Tickets</h2>
            <p className="text-sm text-foreground/50">
              View and manage your existing support tickets.
            </p>
          </Link>
        )}

        <Link
          to="/help"
          className="rounded-lg border border-border p-6 hover:border-primary/40 hover:shadow-sm transition-all text-center space-y-2"
        >
          <Search className="h-8 w-8 mx-auto text-primary" />
          <h2 className="text-lg font-semibold">Help Center</h2>
          <p className="text-sm text-foreground/50">
            Search our knowledge base for instant answers.
          </p>
        </Link>
      </div>

      {!isSignedIn && (
        <div className="text-center text-sm text-foreground/40">
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>{" "}
          to submit a ticket or view your existing tickets.
        </div>
      )}
    </div>
  );
}
