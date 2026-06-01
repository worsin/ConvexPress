/**
 * Add WordPress Site Form
 *
 * Inline expandable form for adding a new WordPress site connection.
 * Validates URL, tests connection, and saves credentials.
 *
 * Designed specifically for WordPress sites using Elementor.
 */

import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import {
  GlobeIcon,
  KeyIcon,
  UserIcon,
  LinkIcon,
  CheckCircleIcon,
  XCircleIcon,
  Loader2Icon,
  InfoIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  BookOpenIcon,
  ShoppingCartIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface AddSiteFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TestStatus = "idle" | "testing" | "success" | "error";

interface FormData {
  name: string;
  siteUrl: string;
  username: string;
  applicationPassword: string;
  wooAuthMode: "shared" | "separate";
  wooConsumerKey: string;
  wooConsumerSecret: string;
  userPasswordExportPath: string;
  userPasswordExportSecret: string;
}

export function AddSiteForm({ open, onOpenChange }: AddSiteFormProps) {
  const [formData, setFormData] = useState<FormData>({
    name: "",
    siteUrl: "",
    username: "",
    applicationPassword: "",
    wooAuthMode: "shared",
    wooConsumerKey: "",
    wooConsumerSecret: "",
    userPasswordExportPath: "",
    userPasswordExportSecret: "",
  });
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testError, setTestError] = useState<string | null>(null);
  const [testDetails, setTestDetails] = useState<{
    siteName?: string;
    siteDescription?: string;
    wpVersion?: string;
    wooDetected?: boolean;
    wooAuthValid?: boolean;
    elementorDetected?: boolean;
    userPasswordExportConfigured?: boolean;
    userPasswordExportDetected?: boolean;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showWooHelp, setShowWooHelp] = useState(false);

  const createSite = useMutation(api.wordpressSync.mutations.createSite);
  const testConnection = useAction(
    api.wordpressSync.actions.testSiteConnection,
  );

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (
      field === "siteUrl" ||
      field === "username" ||
      field === "applicationPassword" ||
      field === "wooConsumerKey" ||
      field === "wooConsumerSecret" ||
      field === "wooAuthMode" ||
      field === "userPasswordExportPath" ||
      field === "userPasswordExportSecret"
    ) {
      setTestStatus("idle");
      setTestError(null);
      setTestDetails(null);
    }
  };

  const handleTestConnection = async () => {
    if (
      !formData.siteUrl ||
      !formData.username ||
      !formData.applicationPassword
    ) {
      toast.error("Please fill in all connection fields");
      return;
    }

    setTestStatus("testing");
    setTestError(null);

    try {
      const result = await testConnection({
        siteUrl: formData.siteUrl,
        username: formData.username,
        applicationPassword: formData.applicationPassword,
        wooAuthMode: formData.wooAuthMode,
        wooConsumerKey:
          formData.wooAuthMode === "separate"
            ? formData.wooConsumerKey || undefined
            : undefined,
        wooConsumerSecret:
          formData.wooAuthMode === "separate"
            ? formData.wooConsumerSecret || undefined
            : undefined,
        userPasswordExportPath:
          formData.userPasswordExportPath || undefined,
        userPasswordExportSecret:
          formData.userPasswordExportSecret || undefined,
      });

      if (result.success) {
        const caps = (result as any).capabilities ?? {};
        setTestStatus("success");
        setTestDetails({
          siteName: result.siteInfo.name,
          siteDescription: result.siteInfo.description,
          wpVersion: result.siteInfo.namespaces?.includes("wp/v2")
            ? "5.0+"
            : "Unknown",
          wooDetected: Boolean(caps.woocommerceApi),
          wooAuthValid: Boolean(caps.wooAuthValid),
          elementorDetected: Boolean(caps.elementorDetected),
          userPasswordExportConfigured: Boolean(caps.userPasswordExportEndpointConfigured),
          userPasswordExportDetected: Boolean(caps.userPasswordExportEndpointDetected),
        });
        // Auto-fill name if empty
        if (!formData.name && result.siteInfo.name) {
          setFormData((prev) => ({
            ...prev,
            name: result.siteInfo.name || "",
          }));
        }
      } else {
        setTestStatus("error");
        setTestError(result.error || "Connection failed");
      }
    } catch (error) {
      setTestStatus("error");
      setTestError(
        error instanceof Error ? error.message : "Connection test failed",
      );
    }
  };

  const handleSubmit = async () => {
    if (
      !formData.name ||
      !formData.siteUrl ||
      !formData.username ||
      !formData.applicationPassword
    ) {
      toast.error("Please fill in all fields");
      return;
    }

    if (testStatus !== "success") {
      toast.error("Please test the connection first");
      return;
    }

    setIsSaving(true);

    try {
      await createSite({
        name: formData.name,
        siteUrl: formData.siteUrl,
        username: formData.username,
        applicationPassword: formData.applicationPassword,
        wooAuthMode: formData.wooAuthMode,
        wooConsumerKey:
          formData.wooAuthMode === "separate"
            ? formData.wooConsumerKey || undefined
            : undefined,
        wooConsumerSecret:
          formData.wooAuthMode === "separate"
            ? formData.wooConsumerSecret || undefined
            : undefined,
        userPasswordExportPath:
          formData.userPasswordExportPath || undefined,
        userPasswordExportSecret:
          formData.userPasswordExportSecret || undefined,
      });

      toast.success("WordPress site added successfully");
      handleReset();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to add site",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setFormData({
      name: "",
      siteUrl: "",
      username: "",
      applicationPassword: "",
      wooAuthMode: "shared",
      wooConsumerKey: "",
      wooConsumerSecret: "",
      userPasswordExportPath: "",
      userPasswordExportSecret: "",
    });
    setTestStatus("idle");
    setTestError(null);
    setTestDetails(null);
  };

  const canTest =
    formData.siteUrl && formData.username && formData.applicationPassword;
  const canSave = formData.name && testStatus === "success";

  return (
    <Card>
      {/* Clickable header to toggle form */}
      <CardHeader
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => onOpenChange(!open)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <GlobeIcon className="h-5 w-5 text-primary" />
            Add WordPress Site
          </CardTitle>
          {open ? (
            <ChevronUpIcon className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDownIcon className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </CardHeader>

      {/* Expandable form content */}
      {open && (
        <CardContent className="pt-0 space-y-6">
          {/* Elementor Note */}
          <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/5 border border-primary/10">
            <InfoIcon className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-foreground mb-1">
                WordPress / WooCommerce Import
              </p>
              <p className="text-muted-foreground">
                Import all content from WordPress and WooCommerce sites --
                users, media, categories, tags, posts, pages, comments, menus,
                products, orders, and more. Elementor page structure and
                metadata are preserved automatically.
              </p>
            </div>
          </div>

          {/* Connection Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Site URL */}
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="siteUrl" className="flex items-center gap-1.5">
                <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
                WordPress Site URL
              </Label>
              <Input
                id="siteUrl"
                placeholder="https://mysite.com"
                value={formData.siteUrl}
                onChange={(e) => handleChange("siteUrl", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The full URL of your WordPress site (e.g., https://example.com)
              </p>
            </div>

            {/* Username */}
            <div className="space-y-2">
              <Label htmlFor="username" className="flex items-center gap-1.5">
                <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                WordPress Username
              </Label>
              <Input
                id="username"
                placeholder="admin"
                value={formData.username}
                onChange={(e) => handleChange("username", e.target.value)}
              />
            </div>

            {/* Application Password */}
            <div className="space-y-2">
              <Label
                htmlFor="applicationPassword"
                className="flex items-center gap-1.5"
              >
                <KeyIcon className="h-3.5 w-3.5 text-muted-foreground" />
                Application Password
              </Label>
              <Input
                id="applicationPassword"
                type="password"
                placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                value={formData.applicationPassword}
                onChange={(e) =>
                  handleChange("applicationPassword", e.target.value)
                }
              />
            </div>
          </div>

          {/* WooCommerce credentials */}
          <div className="rounded-lg border border-border bg-card/50 p-4 space-y-4">
            <div className="flex items-start gap-3">
              <ShoppingCartIcon className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-foreground">
                  WooCommerce credentials
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Required to import products with prices, variants, attributes,
                  orders, and customers. Skip if this is a content-only site.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-medium text-foreground">
                Authentication mode
              </Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleChange("wooAuthMode", "shared")}
                  className={`text-left rounded-md border p-3 transition-colors ${
                    formData.wooAuthMode === "shared"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="text-sm font-medium text-foreground">
                    Shared (use WP password)
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Re-uses the WordPress application password above. Works
                    when the Woo REST API accepts Basic Auth (most sites).
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => handleChange("wooAuthMode", "separate")}
                  className={`text-left rounded-md border p-3 transition-colors ${
                    formData.wooAuthMode === "separate"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="text-sm font-medium text-foreground">
                    Separate (Consumer Key/Secret)
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Use a dedicated Woo REST API key generated in WooCommerce
                    settings. Recommended for production.
                  </p>
                </button>
              </div>
            </div>

            {formData.wooAuthMode === "separate" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="wooKey" className="flex items-center gap-1.5">
                    <KeyIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    Consumer Key
                  </Label>
                  <Input
                    id="wooKey"
                    placeholder="ck_..."
                    value={formData.wooConsumerKey}
                    onChange={(e) => handleChange("wooConsumerKey", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wooSecret" className="flex items-center gap-1.5">
                    <KeyIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    Consumer Secret
                  </Label>
                  <Input
                    id="wooSecret"
                    type="password"
                    placeholder="cs_..."
                    value={formData.wooConsumerSecret}
                    onChange={(e) => handleChange("wooConsumerSecret", e.target.value)}
                  />
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowWooHelp((v) => !v)}
              className="text-xs text-primary hover:underline"
            >
              {showWooHelp ? "Hide" : "Show"} how to generate a Woo REST API key
            </button>
            {showWooHelp && (
              <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground space-y-1">
                <p>
                  In <strong>WooCommerce → Settings → Advanced → REST API</strong>:
                </p>
                <ol className="list-decimal list-inside space-y-0.5 ml-1">
                  <li>Click <strong>Add Key</strong></li>
                  <li>Description: <code>ConvexPress Sync</code></li>
                  <li>User: an administrator</li>
                  <li>Permissions: <strong>Read/Write</strong></li>
                  <li>Click <strong>Generate API Key</strong></li>
                  <li>Copy the Consumer Key (<code>ck_...</code>) and Consumer Secret (<code>cs_...</code>) — they're shown only once.</li>
                </ol>
              </div>
            )}
          </div>

          {/* Optional credential continuity endpoint */}
          <div className="rounded-lg border border-border bg-card/50 p-4 space-y-4">
            <div className="flex items-start gap-3">
              <KeyIcon className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-foreground">
                  User credential continuity
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Optional migration helper for importing supported WordPress
                  password digests into Clerk. Leave blank to require password
                  resets after import.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label
                  htmlFor="userPasswordExportPath"
                  className="flex items-center gap-1.5"
                >
                  <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  Export endpoint path
                </Label>
                <Input
                  id="userPasswordExportPath"
                  placeholder="/convexpress/v1/user-password-digests"
                  value={formData.userPasswordExportPath}
                  onChange={(e) =>
                    handleChange("userPasswordExportPath", e.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="userPasswordExportSecret"
                  className="flex items-center gap-1.5"
                >
                  <KeyIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  Migration secret
                </Label>
                <Input
                  id="userPasswordExportSecret"
                  type="password"
                  value={formData.userPasswordExportSecret}
                  onChange={(e) =>
                    handleChange("userPasswordExportSecret", e.target.value)
                  }
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              The helper endpoint must be temporary, administrator-only, and
              protected by this shared secret. ConvexPress never stores the
              source password digest; it sends supported digests directly to
              Clerk during import. If the path is blank, ConvexPress uses the
              default path shown above.
            </p>
          </div>

          {/* Test Connection Button */}
          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestConnection}
              disabled={!canTest || testStatus === "testing"}
            >
              {testStatus === "testing" && (
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              )}
              {testStatus === "success" && (
                <CheckCircleIcon className="mr-2 h-4 w-4 text-success" />
              )}
              {testStatus === "error" && (
                <XCircleIcon className="mr-2 h-4 w-4 text-destructive" />
              )}
              {testStatus === "idle" && (
                <GlobeIcon className="mr-2 h-4 w-4" />
              )}
              {testStatus === "testing"
                ? "Testing Connection..."
                : "Test Connection"}
            </Button>

            {/* Test Result - Success */}
            {testStatus === "success" && testDetails && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-success/10 border border-success/20">
                <CheckCircleIcon className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                <div className="text-sm flex-1 space-y-2">
                  <div>
                    <p className="font-medium text-success">
                      Connection successful!
                    </p>
                    <p className="text-muted-foreground">
                      {testDetails.siteName}
                      {testDetails.siteDescription &&
                        ` -- ${testDetails.siteDescription}`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      WordPress {testDetails.wpVersion}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <CapabilityBadge label="WP REST" ok={true} />
                    <CapabilityBadge
                      label={
                        testDetails.wooDetected
                          ? testDetails.wooAuthValid
                            ? "WooCommerce auth ✓"
                            : "WooCommerce detected — auth failed"
                          : "WooCommerce not detected"
                      }
                      ok={Boolean(testDetails.wooDetected && testDetails.wooAuthValid)}
                      neutral={!testDetails.wooDetected}
                    />
                    <CapabilityBadge
                      label={
                        testDetails.elementorDetected
                          ? "Elementor detected"
                          : "No Elementor"
                      }
                      ok={Boolean(testDetails.elementorDetected)}
                      neutral={!testDetails.elementorDetected}
                    />
                    {testDetails.userPasswordExportConfigured && (
                      <CapabilityBadge
                        label={
                          testDetails.userPasswordExportDetected
                            ? "Credential export ready"
                            : "Credential export failed"
                        }
                        ok={Boolean(testDetails.userPasswordExportDetected)}
                      />
                    )}
                  </div>
                  {testDetails.wooDetected && !testDetails.wooAuthValid && (
                    <p className="text-xs text-warning">
                      Woo REST API was detected but authentication failed. Try
                      switching to <strong>Separate</strong> mode and entering a
                      Consumer Key + Secret generated in WooCommerce settings.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Test Result - Error */}
            {testStatus === "error" && testError && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                <XCircleIcon className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-destructive">
                    Connection failed
                  </p>
                  <p className="text-destructive/80">{testError}</p>
                </div>
              </div>
            )}
          </div>

          {/* Site Name (shown after successful connection test) */}
          {testStatus === "success" && (
            <div className="space-y-2">
              <Label htmlFor="name">Display Name</Label>
              <Input
                id="name"
                placeholder="My WordPress Site"
                value={formData.name}
                onChange={(e) => handleChange("name", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                A friendly name for this site in your dashboard
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSubmit} disabled={!canSave || isSaving}>
              {isSaving && (
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save & Connect
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                handleReset();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
          </div>

          {/* How to get Application Password */}
          <div className="border-t border-border pt-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted">
              <BookOpenIcon className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-foreground mb-2">
                  How to get a WordPress Application Password
                </p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>
                    Log into your WordPress admin at{" "}
                    <code className="px-1 py-0.5 rounded bg-black/5 text-xs">
                      yourdomain.com/wp-admin
                    </code>
                  </li>
                  <li>
                    Go to <strong>Users</strong> &rarr;{" "}
                    <strong>Your Profile</strong>
                  </li>
                  <li>
                    Scroll down to the{" "}
                    <strong>Application Passwords</strong> section
                  </li>
                  <li>
                    Enter a name (e.g., "ConvexPress Import") and click{" "}
                    <strong>Add New Application Password</strong>
                  </li>
                  <li>Copy the generated password and paste it above</li>
                </ol>
                <p className="text-xs text-muted-foreground mt-2">
                  Requires WordPress 5.6+ with REST API enabled (default in WP
                  4.7+). Your user must have Administrator or Editor role.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function CapabilityBadge({
  label,
  ok,
  neutral,
}: {
  label: string;
  ok: boolean;
  neutral?: boolean;
}) {
  const cls = neutral
    ? "bg-muted text-muted-foreground border-border"
    : ok
      ? "bg-success/10 text-success border-success/30"
      : "bg-warning/10 text-warning border-warning/30";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${cls}`}
    >
      {neutral ? null : ok ? (
        <CheckCircleIcon className="size-3" />
      ) : (
        <XCircleIcon className="size-3" />
      )}
      {label}
    </span>
  );
}

/**
 * @deprecated Use AddSiteForm instead. This is kept for backward compatibility.
 */
export function AddSiteDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <AddSiteForm
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    />
  );
}
