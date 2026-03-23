/**
 * Add Site Dialog
 *
 * Dialog for adding a new WordPress site connection.
 * Validates URL, tests connection, and saves credentials.
 */

import { useState } from "react";
import { useMutation } from "convex/react";
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
  AlertCircleIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface AddSiteDialogProps {
  open: boolean;
  onClose: () => void;
}

type TestStatus = "idle" | "testing" | "success" | "error";

interface FormData {
  name: string;
  siteUrl: string;
  username: string;
  applicationPassword: string;
}

export function AddSiteDialog({ open, onClose }: AddSiteDialogProps) {
  const [formData, setFormData] = useState<FormData>({
    name: "",
    siteUrl: "",
    username: "",
    applicationPassword: "",
  });
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testError, setTestError] = useState<string | null>(null);
  const [testDetails, setTestDetails] = useState<{
    siteName?: string;
    wpVersion?: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Mutations
  const createSite = useMutation(api.wordpressSync.mutations.createSite);
  const testConnection = useMutation(
    api.wordpressSync.actions.testSiteConnection,
  );

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Reset test status when credentials change
    if (
      field === "siteUrl" ||
      field === "username" ||
      field === "applicationPassword"
    ) {
      setTestStatus("idle");
      setTestError(null);
      setTestDetails(null);
    }
  };

  const handleTestConnection = async () => {
    if (!formData.siteUrl || !formData.username || !formData.applicationPassword) {
      toast.error("Please fill in all connection fields");
      return;
    }

    setTestStatus("testing");
    setTestError(null);

    try {
      // We need to create a temporary site to test, then delete it
      // Or use a direct test action
      // For now, let's use a simplified approach with the action
      const result = await testConnection({
        siteUrl: formData.siteUrl,
        username: formData.username,
        applicationPassword: formData.applicationPassword,
      });

      if (result.success) {
        setTestStatus("success");
        setTestDetails({
          siteName: result.siteName,
          wpVersion: result.wpVersion,
        });
        // Auto-fill name if empty
        if (!formData.name && result.siteName) {
          setFormData((prev) => ({ ...prev, name: result.siteName || "" }));
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
    if (!formData.name || !formData.siteUrl || !formData.username || !formData.applicationPassword) {
      toast.error("Please fill in all fields");
      return;
    }

    // Require successful connection test
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
      });

      toast.success("WordPress site added successfully");
      handleClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to add site",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setFormData({
      name: "",
      siteUrl: "",
      username: "",
      applicationPassword: "",
    });
    setTestStatus("idle");
    setTestError(null);
    setTestDetails(null);
    onClose();
  };

  const canTest =
    formData.siteUrl && formData.username && formData.applicationPassword;
  const canSave = formData.name && testStatus === "success";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GlobeIcon className="h-5 w-5" />
            Add WordPress Site
          </DialogTitle>
          <DialogDescription>
            Connect to a WordPress site using Application Passwords. Make sure
            the REST API is enabled on the WordPress site.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Site URL */}
          <div className="space-y-2">
            <Label htmlFor="siteUrl" className="flex items-center gap-1.5">
              <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
              WordPress Site URL
            </Label>
            <Input
              id="siteUrl"
              placeholder="https://example.com"
              value={formData.siteUrl}
              onChange={(e) => handleChange("siteUrl", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The full URL of your WordPress site
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
            <p className="text-xs text-muted-foreground">
              Generate an Application Password in WordPress under Users → Your
              Profile → Application Passwords
            </p>
          </div>

          {/* Test Connection */}
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              className="w-full"
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

            {/* Test Result */}
            {testStatus === "success" && testDetails && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/20">
                <CheckCircleIcon className="h-4 w-4 text-success flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-success">
                    Connection successful!
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {testDetails.siteName} • WordPress {testDetails.wpVersion}
                  </p>
                </div>
              </div>
            )}

            {testStatus === "error" && testError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <XCircleIcon className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-destructive">
                    Connection failed
                  </p>
                  <p className="text-xs text-destructive/80">{testError}</p>
                </div>
              </div>
            )}
          </div>

          {/* Site Name */}
          <div className="space-y-2">
            <Label htmlFor="name" className="flex items-center gap-1.5">
              Display Name
            </Label>
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

          {/* Info Box */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted">
            <AlertCircleIcon className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Requirements:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>WordPress 5.6+ (for Application Passwords)</li>
                <li>REST API enabled (default in WP 4.7+)</li>
                <li>Admin or Editor role for full access</li>
              </ul>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSave || isSaving}>
            {isSaving && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
            Add Site
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
