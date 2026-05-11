/**
 * WebhookEndpointField — read-only field showing the webhook URL the
 * merchant should paste into their provider dashboard, with a copy
 * button. Used on Stripe, PayPal, Clerk, Resend, carrier provider pages.
 */

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export interface WebhookEndpointFieldProps {
  id: string;
  label: string;
  url: string;
  help?: React.ReactNode;
}

export function WebhookEndpointField({
  id,
  label,
  url,
  help,
}: WebhookEndpointFieldProps) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }
  return (
    <div className="grid gap-2">
      <Label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <Input id={id} readOnly value={url} className="font-mono text-xs" />
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? (
            <>
              <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
              Copied
            </>
          ) : (
            <>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Copy
            </>
          )}
        </Button>
      </div>
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}
