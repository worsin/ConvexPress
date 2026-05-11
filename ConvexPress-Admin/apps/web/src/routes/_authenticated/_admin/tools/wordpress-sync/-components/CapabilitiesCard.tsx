/**
 * Capabilities Card
 *
 * Shows green/red indicators for each detected site capability.
 * Accepts either the site's capabilities or a report's detectedCapabilities.
 */

import { Check, X } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Site capabilities shape (from wordpressSites table) */
interface SiteCapabilities {
  wpRest: boolean;
  wpAuthValid: boolean;
  woocommerceApi: boolean;
  wooAuthValid: boolean;
  menusApi: boolean;
  customMetaEndpointConfigured?: boolean;
  customMetaEndpointDetected: boolean;
  elementorDetected: boolean;
  mediaAccessible: boolean;
}

/** Report capabilities shape (from wordpressSyncReports.detectedCapabilities) */
interface ReportCapabilities {
  wpRest: boolean;
  wpAuthValid: boolean;
  wooRest: boolean;
  wooAuthValid: boolean;
  menusApi: boolean;
  customMetaEndpoint: boolean;
  elementorDetected: boolean;
  mediaAccessible: boolean;
}

interface CapabilitiesCardProps {
  capabilities: SiteCapabilities | ReportCapabilities | null;
}

/**
 * Ordered list of capability keys with human labels.
 * We check for both site and report key variants.
 */
const CAPABILITY_ENTRIES: Array<{
  keys: string[];
  label: string;
}> = [
  { keys: ["wpRest"], label: "WordPress REST API" },
  { keys: ["wpAuthValid"], label: "WordPress Auth" },
  { keys: ["woocommerceApi", "wooRest"], label: "WooCommerce API" },
  { keys: ["wooAuthValid"], label: "WooCommerce Auth" },
  { keys: ["menusApi"], label: "Menus API" },
  {
    keys: ["customMetaEndpointDetected", "customMetaEndpoint"],
    label: "Custom Meta Endpoint",
  },
  { keys: ["elementorDetected"], label: "Elementor Detected" },
  { keys: ["mediaAccessible"], label: "Media Accessible" },
];

function resolveCapability(
  capabilities: Record<string, unknown>,
  keys: string[],
): boolean {
  for (const key of keys) {
    if (key in capabilities) return Boolean(capabilities[key]);
  }
  return false;
}

export function CapabilitiesCard({ capabilities }: CapabilitiesCardProps) {
  if (!capabilities) return null;

  const caps = capabilities as unknown as Record<string, unknown>;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Capabilities</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {CAPABILITY_ENTRIES.map(({ keys, label }) => {
            const value = resolveCapability(caps, keys);
            return (
              <div key={label} className="flex items-center gap-2 text-sm">
                {value ? (
                  <Check className="w-4 h-4 text-green-500 shrink-0" />
                ) : (
                  <X className="w-4 h-4 text-red-500 shrink-0" />
                )}
                <span className={value ? "" : "text-muted-foreground"}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
