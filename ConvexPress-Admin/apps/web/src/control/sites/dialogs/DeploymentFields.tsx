/**
 * Deployment fields shared by "attach environment" and the guided
 * "add website" flow: kind, label, the three addresses, and an advanced
 * section for the portable key and versions.
 */

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { Notice, SelectField, TextField } from "../forms";
import {
  ENVIRONMENT_KIND_OPTIONS,
  kindLabel,
  suggestManagementOrigin,
  suggestSiteOrigin,
  type EnvironmentKind,
} from "../sites-model";

export interface DeploymentDraft {
  kind: EnvironmentKind;
  label: string;
  deploymentOrigin: string;
  managementOrigin: string;
  managementTouched: boolean;
  siteOrigin: string;
  siteTouched: boolean;
  instanceKey: string;
  siteContractVersion: string;
  schemaVersion: string;
  engineVersion: string;
}

export function emptyDeploymentDraft(kind: EnvironmentKind = "live", primaryDomain = ""): DeploymentDraft {
  return {
    kind,
    label: kindLabel(kind),
    deploymentOrigin: "",
    managementOrigin: "",
    managementTouched: false,
    siteOrigin: suggestSiteOrigin(primaryDomain),
    siteTouched: false,
    instanceKey: "",
    siteContractVersion: "1.0.0",
    schemaVersion: "2026.9.0",
    engineVersion: "1.0.0",
  };
}

export function DeploymentFields({
  draft,
  onChange,
  liveAllowed,
  primaryDomain,
  suggestedKey,
}: {
  draft: DeploymentDraft;
  onChange: (next: DeploymentDraft) => void;
  liveAllowed: boolean;
  primaryDomain: string;
  suggestedKey: string;
}) {
  const [advanced, setAdvanced] = useState(false);
  const patch = (next: Partial<DeploymentDraft>) => onChange({ ...draft, ...next });
  const kindOption = ENVIRONMENT_KIND_OPTIONS.find((option) => option.value === draft.kind);

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Environment kind"
          value={draft.kind}
          onChange={(kind) =>
            patch({
              kind,
              label:
                draft.label === "" || draft.label === kindLabel(draft.kind) ? kindLabel(kind) : draft.label,
            })
          }
          options={ENVIRONMENT_KIND_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
            disabled: option.value === "live" && !liveAllowed,
          }))}
          hint={kindOption?.hint}
        />
        <TextField label="Label" value={draft.label} onChange={(label) => patch({ label })} required />
      </div>
      {draft.kind === "live" && !liveAllowed && (
        <Notice tone="error">Your role cannot attach a production environment.</Notice>
      )}
      <TextField
        label="Convex deployment URL"
        value={draft.deploymentOrigin}
        onChange={(deploymentOrigin) =>
          patch({
            deploymentOrigin,
            managementOrigin: draft.managementTouched
              ? draft.managementOrigin
              : suggestManagementOrigin(deploymentOrigin),
          })
        }
        placeholder="https://happy-otter-123.convex.cloud"
        required
        mono
        hint="The deployment URL from the Convex dashboard, or a self-hosted backend address."
      />
      <TextField
        label="Convex site / management URL"
        value={draft.managementOrigin}
        onChange={(managementOrigin) => patch({ managementOrigin, managementTouched: true })}
        placeholder="https://happy-otter-123.convex.site"
        required
        mono
        hint="Where the deployment serves HTTP actions. Filled in automatically for Convex Cloud."
      />
      <TextField
        label="Public website URL"
        value={draft.siteOrigin}
        onChange={(siteOrigin) => patch({ siteOrigin, siteTouched: true })}
        placeholder={suggestSiteOrigin(primaryDomain) || "https://shop.example.com"}
        required
        mono
        hint="What visitors type in the browser."
      />

      <button
        type="button"
        onClick={() => setAdvanced((value) => !value)}
        aria-expanded={advanced}
        className="inline-flex items-center gap-1.5 self-start text-[12.5px] font-medium text-ink-2 hover:text-foreground"
      >
        <ChevronDown aria-hidden="true" className={advanced ? "size-3.5 rotate-180 transition-transform" : "size-3.5 transition-transform"} />
        Advanced: portable key and versions
      </button>
      {advanced && (
        <div className="grid gap-4 rounded-lg border border-border bg-surface-2/60 p-4">
          <TextField
            label="Portable environment key"
            value={draft.instanceKey}
            onChange={(instanceKey) => patch({ instanceKey })}
            placeholder={suggestedKey}
            mono
            optional
            hint="Stays the same when the site is handed to another controller."
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField label="Contract version" value={draft.siteContractVersion} onChange={(v) => patch({ siteContractVersion: v })} mono optional />
            <TextField label="Schema version" value={draft.schemaVersion} onChange={(v) => patch({ schemaVersion: v })} mono optional />
            <TextField label="Engine version" value={draft.engineVersion} onChange={(v) => patch({ engineVersion: v })} mono optional />
          </div>
        </div>
      )}
    </div>
  );
}
