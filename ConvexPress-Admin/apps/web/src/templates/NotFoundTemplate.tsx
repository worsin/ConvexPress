/**
 * Not Found (404) Template - Admin
 *
 * Displayed when a route is not found in the admin panel.
 * Uses TanStack Router's Link component for navigation.
 */

import { Link } from "@tanstack/react-router";
import { Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NotFoundTemplateProps {
  data?: unknown;
}

export function NotFoundTemplate(_props: NotFoundTemplateProps) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 text-center px-4">
      <div className="space-y-2">
        <h1 className="text-6xl font-bold text-foreground">404</h1>
        <p className="text-lg text-muted-foreground">
          The page you are looking for could not be found.
        </p>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => window.history.back()}>
          <ArrowLeft className="size-4" data-icon="inline-start" />
          Go Back
        </Button>
        <Link to="/">
          <Button>
            <Home className="size-4" data-icon="inline-start" />
            Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
