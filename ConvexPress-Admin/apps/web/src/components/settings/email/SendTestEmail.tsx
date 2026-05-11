/**
 * SendTestEmail - Test email delivery from admin settings.
 *
 * A card allowing administrators to send a test email to verify
 * that the Resend API key and email configuration are working.
 *
 * Calls the emails.actions.sendTestEmail Convex action.
 */

import { useState, useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { Send, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SendStatus = "idle" | "sending" | "success" | "error";

export function SendTestEmail() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SendStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const sendTestEmail = useAction(api.emails.actions.sendTestEmail);

  const handleSend = useCallback(async () => {
    if (!email.trim()) {
      toast.error("Please enter an email address");
      return;
    }

    setStatus("sending");
    setErrorMessage("");

    try {
      await sendTestEmail({ recipientEmail: email.trim() });
      setStatus("success");
      toast.success(`Test email queued for ${email.trim()}. Check the delivery queue for status.`);
    } catch (error: unknown) {
      setStatus("error");
      const msg =
        error instanceof Error ? error.message : "Failed to send test email";
      setErrorMessage(msg);
      toast.error(msg);
    }
  }, [email, sendTestEmail]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Send className="size-4 text-muted-foreground" />
          <div>
            <CardTitle>Send Test Email</CardTitle>
            <CardDescription className="mt-0.5">
              Verify your email configuration by sending a test message via
              Resend.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="test-email-input">Recipient Email</Label>
            <Input
              id="test-email-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEmail(e.target.value)
              }
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === "Enter" && status !== "sending") {
                  handleSend();
                }
              }}
              disabled={status === "sending"}
              aria-describedby="test-email-hint"
            />
            <p
              id="test-email-hint"
              className="text-[10px] text-muted-foreground"
            >
              Enter an email address to receive the test message.
            </p>
          </div>

          <Button
            size="sm"
            onClick={handleSend}
            disabled={status === "sending" || !email.trim()}
          >
            {status === "sending" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
            <span>{status === "sending" ? "Sending..." : "Send Test"}</span>
          </Button>
        </div>

        {/* Status feedback */}
        {status === "success" && (
          <div className="mt-3 flex items-center gap-2 text-xs text-success">
            <CheckCircle className="size-3.5" />
            <span>
              Test email queued successfully. Monitor delivery from the queue below.
            </span>
          </div>
        )}
        {status === "error" && errorMessage && (
          <div className="mt-3 flex items-start gap-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
