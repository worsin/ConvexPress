/**
 * Attach another isolated deployment to an existing website.
 */

import { api as controlApi } from "@control/convex/_generated/api";
import type { Id } from "@control/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buildEnvironmentKey } from "../../components/site-manager-view";
import type { WorkspaceApi } from "../SitesWorkspace";
import { CheckField, Notice } from "../forms";
import { findWebsite } from "../sites-model";
import { friendlyError } from "../useWorkspaceActions";
import { DeploymentFields, emptyDeploymentDraft } from "./DeploymentFields";

export function AttachEnvironmentDialog({ api, websiteId }: { api: WorkspaceApi; websiteId: string }) {
  const found = findWebsite(api.tree, websiteId);
  const attach = useMutation(controlApi.websiteInstances.attach);
  const liveAccess = useQuery(
    controlApi.rbac.queries.checkMyAccess,
    found
      ? {
          selectorType: "capability",
          code: "environment.live.operate",
          organizationId: found.organization.organizationId,
          businessId: found.business.businessId,
          websiteId,
        }
      : "skip",
  );
  const hasLive = found?.website.environments.some((e) => e.kind === "live") ?? false;
  const [draft, setDraft] = useState(() =>
    emptyDeploymentDraft(hasLive ? "staging" : "live", found?.website.primaryDomain ?? ""),
  );
  const [makeDefault, setMakeDefault] = useState(!hasLive);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!found) return null;
  const { website } = found;
  const liveAllowed = liveAccess?.allowed === true;
  const suggestedKey = buildEnvironmentKey({
    websiteKey: website.websiteKey,
    kind: draft.kind,
    label: draft.label,
    existingKeys: website.environments.map((entry) => entry.instanceKey),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && api.closeDialog()}>
      <DialogContent className="max-w-xl">
        <form
          aria-label="Attach environment"
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            void api
              .run(
                "create-environment",
                () =>
                  attach({
                    websiteId: websiteId as Id<"overseer_websites">,
                    instanceKey: draft.instanceKey || suggestedKey,
                    kind: draft.kind,
                    ...(draft.label ? { label: draft.label } : {}),
                    deploymentOrigin: draft.deploymentOrigin,
                    managementOrigin: draft.managementOrigin || draft.deploymentOrigin,
                    siteOrigin: draft.siteOrigin,
                    ...(draft.siteContractVersion ? { siteContractVersion: draft.siteContractVersion } : {}),
                    ...(draft.schemaVersion ? { schemaVersion: draft.schemaVersion } : {}),
                    ...(draft.engineVersion ? { engineVersion: draft.engineVersion } : {}),
                    makeDefault,
                  }),
                (created) => `${created.label ?? created.kind} environment attached. Connect its authority next.`,
              )
              .then((result) => {
                setBusy(false);
                if (result.ok) api.closeDialog();
                else setError(result.error ?? friendlyError(new Error("failed")));
              });
          }}
        >
          <DialogHeader>
            <DialogTitle className="font-serif text-[26px] font-normal leading-none tracking-[-0.01em]">
              Attach an environment to {website.title}
            </DialogTitle>
            <DialogDescription className="text-[13.5px] leading-6">
              Enter an existing deployment here, then connect its controller. To create new production
              and staging databases with a connected Convex account, use Cloud environments on the website page.
            </DialogDescription>
          </DialogHeader>
          {error && <Notice tone="error">{error}</Notice>}
          <DeploymentFields
            draft={draft}
            onChange={setDraft}
            liveAllowed={liveAllowed}
            primaryDomain={website.primaryDomain}
            suggestedKey={suggestedKey}
          />
          <CheckField
            label="Make this the website default"
            hint="The default environment opens when the site is selected."
            checked={makeDefault}
            onChange={setMakeDefault}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={busy} onClick={api.closeDialog}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || (draft.kind === "live" && !liveAllowed)}>
              {busy && <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />}
              Attach environment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
