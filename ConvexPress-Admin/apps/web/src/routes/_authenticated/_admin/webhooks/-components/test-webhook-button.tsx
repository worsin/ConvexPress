/**
 * Test Webhook Button
 *
 * "Send Test" button that invokes the test webhook action.
 * Shows loading spinner during execution and result toast on completion.
 */

import { useState } from "react";
import { useAction } from "convex/react";
import { LoaderIcon, PlayIcon } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { asId } from "@/lib/utils";

interface TestWebhookButtonProps {
  webhookId: string;
  webhookName: string;
}

export function TestWebhookButton({
  webhookId,
  webhookName,
}: TestWebhookButtonProps) {
  const testWebhook = useAction(api.api.actions.testWebhook);
  const [isTesting, setIsTesting] = useState(false);

  const handleTest = async () => {
    setIsTesting(true);
    try {
      await testWebhook({
        webhookId: asId<"webhooks">(webhookId),
      });
      toast.success(`Test delivery sent to "${webhookName}"`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Test delivery failed";
      toast.error(message);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={handleTest}
      disabled={isTesting}
      title="Send a test delivery"
    >
      {isTesting ? (
        <LoaderIcon className="size-3 animate-spin" />
      ) : (
        <PlayIcon className="size-3" />
      )}
      <span className="ml-1">Test</span>
    </Button>
  );
}
