/**
 * SettingsSection - Visual grouping of related fields within a settings page.
 *
 * Renders a card with a header, optional description, optional callout,
 * and child fields. Supports collapsible sections.
 */

import * as React from "react";
import { ChevronDown } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { SettingsCallout } from "./SettingsCallout";
import type { CalloutConfig } from "@/types/settings";

interface SettingsSectionProps {
  /** Section title (e.g., "Site Identity") */
  title: string;
  /** Optional description text */
  description?: string;
  /** Child content: SettingsField components */
  children: React.ReactNode;
  /** Whether the section is collapsible */
  collapsible?: boolean;
  /** Whether the section starts collapsed */
  defaultCollapsed?: boolean;
  /** Optional callout/info box at the top of the section */
  callout?: CalloutConfig;
  /** Optional callback to reset this section to defaults (Fix #155) */
  onReset?: () => void;
}

export function SettingsSection({
  title,
  description,
  children,
  collapsible = false,
  defaultCollapsed = false,
  callout,
  onReset,
}: SettingsSectionProps) {
  const [isOpen, setIsOpen] = React.useState(!defaultCollapsed);

  const handleToggle = () => {
    if (collapsible) {
      setIsOpen((prev) => !prev);
    }
  };

  return (
    <Card>
      <CardHeader
        className={cn(
          collapsible && "cursor-pointer select-none",
          !isOpen && collapsible && "border-b-0",
        )}
        onClick={handleToggle}
        role={collapsible ? "button" : undefined}
        aria-expanded={collapsible ? isOpen : undefined}
        tabIndex={collapsible ? 0 : undefined}
        onKeyDown={
          collapsible
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleToggle();
                }
              }
            : undefined
        }
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            {description && (
              <CardDescription className="mt-1">{description}</CardDescription>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onReset && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onReset();
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Reset to defaults
              </button>
            )}
            {collapsible && (
              <ChevronDown
                className={cn(
                  "size-4 text-muted-foreground transition-transform duration-200",
                  isOpen && "rotate-180",
                )}
              />
            )}
          </div>
        </div>
      </CardHeader>

      {/* Animated content area */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <CardContent>
            <div
              className="flex flex-col gap-4"
              role="group"
              aria-label={title}
            >
              {callout && (
                <SettingsCallout type={callout.type} link={callout.link}>
                  {callout.message}
                </SettingsCallout>
              )}
              {children}
            </div>
          </CardContent>
        </div>
      </div>
    </Card>
  );
}
