/**
 * EmailTemplateEditorPage - Full-page template editor.
 *
 * Allows admins to customize email template subject, body HTML,
 * preheader text, and toggle active state. Shows available variables
 * and a live preview panel.
 *
 * Route: /admin/settings/email/templates/$templateSlug
 * Wired to:
 *   - api.emails.queries.getTemplate
 *   - api.emails.mutations.updateTemplate
 *   - api.emails.mutations.resetTemplate
 */

import { useState, useCallback, useMemo, useEffect, useRef, useTransition } from "react";
import { useParams, Link } from "@tanstack/react-router";
import { useAction, useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { toast } from "sonner";
import {
  ArrowLeft,
  RotateCcw,
  Eye,
  Code,
  Info,
  Copy,
  Check,
  Loader2,
} from "lucide-react";

import { api } from "@backend/convex/_generated/api";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  EMAIL_CATEGORY_CONFIG,
  EMAIL_PRIORITY_CONFIG,
} from "@/lib/email/constants";
import { EmailTemplatePreview } from "./EmailTemplatePreview";
import type { EmailCategory, EmailPriority, TemplateVariable } from "@/lib/email/types";
import type { Id } from "@backend/convex/_generated/dataModel";

export function EmailTemplateEditorPage() {
  const { templateSlug } = useParams({
    from: "/_authenticated/_admin/settings/email_/templates/$templateSlug",
  });
  const template = useQuery(api.emails.queries.getTemplate, { templateSlug });
  const updateTemplate = useMutation(api.emails.mutations.updateTemplate);
  const resetTemplate = useMutation(api.emails.mutations.resetTemplate);
  const sendTemplateTestEmail = useAction(api.emails.actions.sendTemplateTestEmail);

  const [subjectTemplate, setSubjectTemplate] = useState<string | null>(null);
  const [bodyHtml, setBodyHtml] = useState<string | null>(null);
  const [preheaderText, setPreheaderText] = useState<string | null>(null);
  const [isActive, setIsActive] = useState<boolean | null>(null);
  const [isResetting, startResetTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"editor" | "preview">("editor");
  const [copiedVar, setCopiedVar] = useState<string | null>(null);
  const [testRecipientEmail, setTestRecipientEmail] = useState("");
  const [testRecipientName, setTestRecipientName] = useState("");
  const [testVariableOverrides, setTestVariableOverrides] = useState("");
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<
    "idle" | "pending" | "saving" | "saved" | "error"
  >("idle");
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Effective values (local edits override server values)
  const effectiveSubject = subjectTemplate ?? template?.subjectTemplate ?? "";
  const effectiveBody = bodyHtml ?? template?.bodyHtml ?? "";
  const effectivePreheader = preheaderText ?? template?.preheaderText ?? "";
  const effectiveActive = isActive ?? template?.isActive ?? true;

  // Check if there are unsaved changes
  const isDirty = useMemo(() => {
    if (!template) return false;
    return (
      (subjectTemplate !== null &&
        subjectTemplate !== template.subjectTemplate) ||
      (bodyHtml !== null && bodyHtml !== template.bodyHtml) ||
      (preheaderText !== null && preheaderText !== (template.preheaderText ?? "")) ||
      (isActive !== null && isActive !== template.isActive)
    );
  }, [template, subjectTemplate, bodyHtml, preheaderText, isActive]);

  const persistDraft = useCallback(async () => {
    if (!template) return;

    const updateArgs: {
      templateId: Id<"emailTemplates">;
      subjectTemplate?: string;
      bodyHtml?: string;
      preheaderText?: string;
      isActive?: boolean;
    } = { templateId: template._id as Id<"emailTemplates"> };
    if (subjectTemplate !== null) updateArgs.subjectTemplate = subjectTemplate;
    if (bodyHtml !== null) updateArgs.bodyHtml = bodyHtml;
    if (preheaderText !== null) updateArgs.preheaderText = preheaderText;
    if (isActive !== null) updateArgs.isActive = isActive;

    // No changes queued.
    if (Object.keys(updateArgs).length === 1) return;

    setAutoSaveStatus("saving");
    setAutoSaveError(null);
    try {
      await updateTemplate(updateArgs);
      setSubjectTemplate(null);
      setBodyHtml(null);
      setPreheaderText(null);
      setIsActive(null);
      setAutoSaveStatus("saved");
    } catch (error: unknown) {
      setAutoSaveStatus("error");
      setAutoSaveError(
        error instanceof Error ? error.message : "Failed to save template.",
      );
    } finally {
    }
  }, [template, subjectTemplate, bodyHtml, preheaderText, isActive, updateTemplate]);

  const draftSignature = useMemo(
    () =>
      JSON.stringify({
        subjectTemplate,
        bodyHtml,
        preheaderText,
        isActive,
      }),
    [subjectTemplate, bodyHtml, preheaderText, isActive],
  );

  useEffect(() => {
    if (!template) return;

    if (!isDirty) {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    setAutoSaveStatus("pending");
    setAutoSaveError(null);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void persistDraft();
    }, 700);
  }, [draftSignature, isDirty, persistDraft, template]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, []);

  const handleReset = useCallback(() => {
    if (!template) return;

    const confirmed = window.confirm(
      "Reset this template to its default content? Your customizations will be lost.",
    );
    if (!confirmed) return;

    startResetTransition(async () => {
      try {
        await resetTemplate({ templateId: template._id });
        toast.success("Template reset to defaults.");

        // Clear local edits
        setSubjectTemplate(null);
        setBodyHtml(null);
        setPreheaderText(null);
        setIsActive(null);
      } catch (error: unknown) {
        toast.error(
          error instanceof Error ? error.message : "Failed to reset template.",
        );
      }
    });
  }, [template, resetTemplate]);

  const handleCopyVariable = useCallback((varName: string) => {
    navigator.clipboard.writeText(`{${varName}}`);
    setCopiedVar(varName);
    setTimeout(() => setCopiedVar(null), 2000);
  }, []);

  const handleSendTemplateTest = useCallback(async () => {
    if (!template) return;
    if (!testRecipientEmail.trim()) {
      toast.error("Enter a recipient email address for the test send.");
      return;
    }

    setIsSendingTest(true);
    try {
      await sendTemplateTestEmail({
        templateSlug: template.slug,
        recipientEmail: testRecipientEmail.trim(),
        recipientName: testRecipientName.trim() || undefined,
        variableOverridesJson: testVariableOverrides.trim() || undefined,
      });
      toast.success(
        `Queued test send for ${testRecipientEmail.trim()}. Check the delivery queue for status.`,
      );
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send template test email.",
      );
    } finally {
      setIsSendingTest(false);
    }
  }, [
    template,
    testRecipientEmail,
    testRecipientName,
    testVariableOverrides,
    sendTemplateTestEmail,
  ]);

  // Loading state
  if (template === undefined) {
    return (
      <div className="flex flex-col gap-6 pb-20">
        <div className="flex items-center gap-3">
          <Skeleton className="size-8" />
          <Skeleton className="h-7 w-64" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 flex flex-col gap-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
          <div className="flex flex-col gap-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </div>
    );
  }

  // Not found
  if (template === null) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h1 className="text-lg font-semibold mb-2">Template Not Found</h1>
        <p className="text-sm text-muted-foreground mb-6">
          No template with slug "{templateSlug}" was found.
        </p>
        <Link
          to="/settings/email"
          className="inline-flex items-center px-4 py-2 text-sm font-medium border border-input bg-card hover:bg-accent transition-colors"
        >
          Back to Email Settings
        </Link>
      </div>
    );
  }

  const categoryConfig =
    EMAIL_CATEGORY_CONFIG[template.category as EmailCategory];
  const priorityConfig =
    EMAIL_PRIORITY_CONFIG[template.priority as EmailPriority];
  const statusText =
    autoSaveStatus === "saving"
      ? "Saving..."
      : autoSaveStatus === "pending"
        ? "Saving shortly..."
        : autoSaveStatus === "error"
          ? autoSaveError ?? "Autosave failed."
          : "All changes saved.";

  return (
    <div className="flex flex-col gap-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/settings/email"
            className="inline-flex size-8 items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              {template.name}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {template.slug}
              {template.isCustomized && (
                <span className="ml-2 text-primary">(customized)</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {template.isCustomized && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={isResetting}
              className="h-8 text-xs"
            >
              <RotateCcw className="mr-1.5 size-3" />
              {isResetting ? "Resetting..." : "Reset to Default"}
            </Button>
          )}
          <div
            className={cn(
              "inline-flex h-8 items-center gap-1.5 text-xs",
              autoSaveStatus === "error" ? "text-destructive" : "text-muted-foreground",
            )}
            aria-live="polite"
          >
            {(autoSaveStatus === "pending" || autoSaveStatus === "saving") && (
              <Loader2 className="size-3 animate-spin" />
            )}
            <span>{statusText}</span>
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main editor area (2 cols) */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Subject */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Subject Line</CardTitle>
            </CardHeader>
            <CardContent>
              <input
                type="text"
                value={effectiveSubject}
                onChange={(e) => setSubjectTemplate(e.target.value)}
                placeholder="Email subject..."
                className="h-8 w-full border border-input bg-transparent px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring/50"
              />
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                Use {"{variableName}"} syntax for dynamic values.
              </p>
            </CardContent>
          </Card>

          {/* Preheader */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Preheader Text</CardTitle>
            </CardHeader>
            <CardContent>
              <input
                type="text"
                value={effectivePreheader}
                onChange={(e) => setPreheaderText(e.target.value)}
                placeholder="Preview text shown in email client..."
                maxLength={200}
                className="h-8 w-full border border-input bg-transparent px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring/50"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                {effectivePreheader.length}/200 characters
              </p>
            </CardContent>
          </Card>

          {/* Body - Editor/Preview tabs */}
          <Card>
            <CardHeader className="pb-0">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setActiveTab("editor")}
                  className={cn(
                    "flex items-center gap-1.5 pb-2 text-xs font-medium transition-colors border-b-2",
                    activeTab === "editor"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Code className="size-3.5" />
                  HTML Source
                </button>
                <button
                  onClick={() => setActiveTab("preview")}
                  className={cn(
                    "flex items-center gap-1.5 pb-2 text-xs font-medium transition-colors border-b-2",
                    activeTab === "preview"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Eye className="size-3.5" />
                  Preview
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {activeTab === "editor" ? (
                <textarea
                  value={effectiveBody}
                  onChange={(e) => setBodyHtml(e.target.value)}
                  className="min-h-[400px] w-full resize-y border border-input bg-transparent p-3 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring/50"
                  placeholder="<html>...</html>"
                  spellCheck={false}
                />
              ) : (
                <EmailTemplatePreview
                  bodyHtml={effectiveBody}
                  subjectTemplate={effectiveSubject}
                  templateSlug={templateSlug}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar (1 col) */}
        <div className="flex flex-col gap-4">
          {/* Template Info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Template Info</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 text-xs">
                {template.description && (
                  <p className="text-muted-foreground">
                    {template.description}
                  </p>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Category</span>
                  {categoryConfig && (
                    <span
                      className={cn(
                        "inline-flex items-center border px-1.5 py-0.5 text-[10px] font-medium",
                        categoryConfig.className,
                      )}
                    >
                      {categoryConfig.label}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Priority</span>
                  {priorityConfig && (
                    <span
                      className={cn(
                        "inline-flex items-center border px-1.5 py-0.5 text-[10px] font-medium",
                        priorityConfig.className,
                      )}
                    >
                      {priorityConfig.label}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Recipient Type</span>
                  <span className="text-foreground capitalize">
                    {template.recipientType}
                  </span>
                </div>

                {template.eventCode && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Event</span>
                    <span className="font-mono text-foreground text-[10px]">
                      {template.canonicalEventCode ?? template.eventCode}
                    </span>
                  </div>
                )}

                {template.triggerKind && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Trigger</span>
                    <span className="text-foreground capitalize">
                      {template.triggerKind}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total Sent</span>
                  <span className="text-foreground">
                    {template.totalSent.toLocaleString()}
                  </span>
                </div>

                {/* Active toggle */}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="text-muted-foreground">Active</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={effectiveActive}
                    onClick={() => setIsActive(!effectiveActive)}
                    className={cn(
                      "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring/50",
                      effectiveActive ? "bg-primary" : "bg-input",
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none block size-3.5 rounded-full shadow-sm transition-transform",
                        effectiveActive
                          ? "translate-x-4 bg-primary-foreground"
                          : "translate-x-0.5 bg-foreground/70",
                      )}
                    />
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Available Variables */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-1.5">
                <Info className="size-3.5 text-muted-foreground" />
                <CardTitle className="text-sm">Available Variables</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-1.5">
                {template.availableVariables &&
                template.availableVariables.length > 0 ? (
                  template.availableVariables.map((variable: TemplateVariable) => (
                    <div
                      key={variable.name}
                      className="group flex items-start gap-2 text-xs"
                    >
                      <button
                        onClick={() => handleCopyVariable(variable.name)}
                        className="mt-0.5 flex items-center gap-1 font-mono text-primary hover:underline shrink-0"
                        title={`Copy {${variable.name}}`}
                      >
                        {copiedVar === variable.name ? (
                          <Check className="size-2.5 text-success" />
                        ) : (
                          <Copy className="size-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                        {`{${variable.name}}`}
                      </button>
                      <span className="text-muted-foreground text-[10px] leading-relaxed">
                        {variable.description}
                        {variable.required && (
                          <span className="text-destructive ml-0.5">*</span>
                        )}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No template-specific variables.
                  </p>
                )}

                {/* Global variables */}
                <div className="mt-2 border-t border-border pt-2">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Global Variables
                  </span>
                  <div className="mt-1.5 flex flex-col gap-1">
                    {[
                      { name: "site_name", desc: "Site name" },
                      { name: "site_url", desc: "Site URL" },
                      { name: "current_year", desc: "Current year" },
                      { name: "unsubscribe_url", desc: "Unsubscribe link" },
                    ].map((v) => (
                      <div
                        key={v.name}
                        className="group flex items-center gap-2 text-xs"
                      >
                        <button
                          onClick={() => handleCopyVariable(v.name)}
                          className="flex items-center gap-1 font-mono text-primary/80 hover:underline shrink-0"
                          title={`Copy {${v.name}}`}
                        >
                          {copiedVar === v.name ? (
                            <Check className="size-2.5 text-success" />
                          ) : (
                            <Copy className="size-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                          {`{${v.name}}`}
                        </button>
                        <span className="text-muted-foreground text-[10px]">
                          {v.desc}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Send Test</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="template-test-email">Recipient Email</Label>
                  <Input
                    id="template-test-email"
                    type="email"
                    value={testRecipientEmail}
                    onChange={(e) => setTestRecipientEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="template-test-name">Recipient Name</Label>
                  <Input
                    id="template-test-name"
                    type="text"
                    value={testRecipientName}
                    onChange={(e) => setTestRecipientName(e.target.value)}
                    placeholder="Alex Example"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="template-test-overrides">
                    Variable Overrides
                  </Label>
                  <Textarea
                    id="template-test-overrides"
                    value={testVariableOverrides}
                    onChange={(e) => setTestVariableOverrides(e.target.value)}
                    placeholder={`{\n  "user_name": "Alex Example"\n}`}
                    className="min-h-[120px] font-mono text-xs"
                    spellCheck={false}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Optional JSON object. Any provided keys override the built-in
                    sample data for this template.
                  </p>
                </div>

                <Button
                  size="sm"
                  onClick={handleSendTemplateTest}
                  disabled={isSendingTest}
                >
                  {isSendingTest ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5" />
                  )}
                  <span>{isSendingTest ? "Queueing..." : "Send Template Test"}</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Sticky save bar */}
      {isDirty && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-sm">
          <div className="mx-auto flex items-center justify-between px-6 py-3">
            <span className="text-xs text-muted-foreground">
              {statusText}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSubjectTemplate(null);
                  setBodyHtml(null);
                  setPreheaderText(null);
                  setIsActive(null);
                }}
                className="h-7 text-xs"
              >
                Discard
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
