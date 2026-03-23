/**
 * Error Log
 *
 * Collapsible error log for sync failures.
 */

import { useState } from "react";
import {
  AlertTriangleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FileTextIcon,
  ImageIcon,
  UserIcon,
  FolderIcon,
  MessageSquareIcon,
  MenuIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn, formatDateTime } from "@/lib/utils";

interface SyncError {
  phase: string;
  wpId: number;
  message: string;
  timestamp: number;
}

interface ErrorLogProps {
  errors: SyncError[];
}

const PHASE_ICONS: Record<string, React.ElementType> = {
  users: UserIcon,
  categories: FolderIcon,
  tags: FolderIcon,
  taxonomies: FolderIcon,
  media: ImageIcon,
  posts: FileTextIcon,
  pages: FileTextIcon,
  comments: MessageSquareIcon,
  menus: MenuIcon,
};

export function ErrorLog({ errors }: ErrorLogProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (errors.length === 0) {
    return null;
  }

  // Group errors by phase
  const groupedErrors = errors.reduce(
    (acc, error) => {
      if (!acc[error.phase]) {
        acc[error.phase] = [];
      }
      acc[error.phase].push(error);
      return acc;
    },
    {} as Record<string, SyncError[]>,
  );

  const phaseCount = Object.keys(groupedErrors).length;

  return (
    <Card className="border-destructive/30">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-between p-0 h-auto hover:bg-transparent"
            >
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangleIcon className="h-4 w-4" />
                Sync Errors
                <Badge variant="outline" className="ml-2 text-destructive border-destructive/30">
                  {errors.length}
                </Badge>
              </CardTitle>
              {isOpen ? (
                <ChevronUpIcon className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="space-y-4">
              {Object.entries(groupedErrors).map(([phase, phaseErrors]) => {
                const Icon = PHASE_ICONS[phase] || AlertTriangleIcon;

                return (
                  <div key={phase}>
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium capitalize">{phase}</span>
                      <Badge variant="outline" className="text-xs">
                        {phaseErrors.length}
                      </Badge>
                    </div>

                    <div className="space-y-2 pl-6">
                      {phaseErrors.slice(0, 10).map((error, index) => (
                        <div
                          key={`${error.wpId}-${index}`}
                          className="text-sm p-2 rounded bg-destructive/5 border border-destructive/10"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <span className="font-mono text-xs text-muted-foreground mr-2">
                                WP ID: {error.wpId}
                              </span>
                              <span className="text-destructive break-words">
                                {error.message}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatTime(error.timestamp)}
                            </span>
                          </div>
                        </div>
                      ))}

                      {phaseErrors.length > 10 && (
                        <p className="text-xs text-muted-foreground">
                          + {phaseErrors.length - 10} more errors
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {errors.length > 50 && (
              <p className="text-xs text-muted-foreground mt-4">
                Showing first 50 errors. View full logs in the database.
              </p>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
