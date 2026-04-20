import { createFileRoute } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { DirectCarrierIntegrationPage } from "@/components/integrations/shipping/DirectCarrierIntegrationPage";
import { SettingsSection } from "@/components/settings/integrations/SettingsSection";
import { TestConnectionButton } from "@/components/settings/integrations/TestConnectionButton";

export const Route = createFileRoute(
  "/_authenticated/_admin/settings/integrations/shipping/usps",
)({
  component: UspsShippingIntegrationPage,
});

function UspsShippingIntegrationPage() {
  const testUsps = useAction(
    (api as any).settings.integrations.testActions.testUspsAddress,
  );
  return (
    <div className="space-y-6">
      <DirectCarrierIntegrationPage provider="usps" />
      <div className="mx-auto max-w-5xl px-6 pb-6">
        <SettingsSection
          title="Address validation"
          description="USPS OAuth credentials above unlock the /addresses/v3/address endpoint — used at checkout to confirm, correct, and ZIP+4-normalize US addresses before rating and label purchase."
        >
          <TestConnectionButton
            onTest={async () => (await testUsps()) as any}
            label="Test address validation"
          />
          <p className="text-xs text-muted-foreground">
            Runs a sample lookup against a known White House address and
            reports the USPS-normalized result inline.
          </p>
        </SettingsSection>
      </div>
    </div>
  );
}
