/**
 * SitemapPingSettings - Search engine ping configuration.
 *
 * Checkboxes for enabling/disabling Google and Bing pings
 * after sitemap regeneration.
 */

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface SitemapPingSettingsProps {
  pingGoogle: boolean;
  pingBing: boolean;
  onPingGoogleChange: (enabled: boolean) => void;
  onPingBingChange: (enabled: boolean) => void;
  disabled?: boolean;
}

export function SitemapPingSettings({
  pingGoogle,
  pingBing,
  onPingGoogleChange,
  onPingBingChange,
  disabled = false,
}: SitemapPingSettingsProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <Checkbox
          checked={pingGoogle}
          onCheckedChange={(checked) => onPingGoogleChange(checked === true)}
          disabled={disabled}
        />
        <div>
          <Label className="text-xs font-medium">Ping Google</Label>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Notify Google when the sitemap is regenerated via their ping API.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <Checkbox
          checked={pingBing}
          onCheckedChange={(checked) => onPingBingChange(checked === true)}
          disabled={disabled}
        />
        <div>
          <Label className="text-xs font-medium">Ping Bing</Label>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Notify Bing when the sitemap is regenerated via their ping API.
          </p>
        </div>
      </div>
    </div>
  );
}
