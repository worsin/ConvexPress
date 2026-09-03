import { api as controlApi } from "@control/convex/_generated/api";
import type { Id } from "@control/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  Check,
  Copy,
  Download,
  FileInput,
  FileOutput,
  Loader2,
  PackageCheck,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { getElectronBridge } from "@/lib/electron";
import {
  expectedHandoffRevocation,
  formatHandoffFilename,
  handoffCanBeDownloaded,
  parseHandoffPackageText,
} from "./handoff-view";

type WebsiteId = Id<"overseer_websites">;
type InstanceId = Id<"overseer_websiteInstances">;
type OrganizationId = Id<"overseer_organizations">;
type BusinessId = Id<"overseer_businesses">;

export function HandoffPanel({
  open,
  source,
  destination,
  onClose,
}: {
  open: boolean;
  source: {
    websiteId: WebsiteId;
    websiteKey: string;
    websiteTitle: string;
    instanceId: InstanceId;
  } | null;
  destination: {
    organizationId: OrganizationId;
    businessId: BusinessId;
    businessName: string;
  } | null;
  onClose: () => void;
}) {
  const handoffs = useQuery(
    controlApi.handoffs.listForWebsite,
    open && source
      ? { websiteId: source.websiteId, limit: 25 }
      : "skip",
  );
  const exportPackage = useMutation(controlApi.handoffs.exportPackage);
  const importPackage = useMutation(controlApi.handoffs.importPackage);
  const markDownloaded = useMutation(controlApi.handoffs.markDownloaded);
  const revokePackage = useMutation(controlApi.handoffs.revokePackage);

  const [includeSnapshots, setIncludeSnapshots] = useState(false);
  const [includeRunbook, setIncludeRunbook] = useState(true);
  const [expiryDays, setExpiryDays] = useState("7");
  const [packageJson, setPackageJson] = useState("");
  const [activeHandoffId, setActiveHandoffId] = useState<string | null>(null);
  const [activeChecksum, setActiveChecksum] = useState<string | null>(null);
  const [activeEnvironmentCount, setActiveEnvironmentCount] = useState<number | null>(null);
  const [importText, setImportText] = useState("");
  const [importResult, setImportResult] = useState<{
    websiteKey: string;
    environmentCount: number;
    connectionsRequired: number;
    idempotent: boolean;
  } | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revokeConfirmation, setRevokeConfirmation] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const exportIdempotencyKey = useRef<string | null>(null);

  const selectedPackage = useQuery(
    controlApi.handoffs.getPackage,
    open && activeHandoffId && !packageJson
      ? { handoffId: activeHandoffId }
      : "skip",
  );

  useEffect(() => {
    if (!selectedPackage) return;
    setPackageJson(selectedPackage.packageJson);
  }, [selectedPackage]);

  useEffect(() => {
    setPackageJson("");
    setActiveHandoffId(null);
    setActiveChecksum(null);
    setActiveEnvironmentCount(null);
    setRevokeId(null);
    setRevokeConfirmation("");
    setActionError(null);
    setSaveStatus(null);
    exportIdempotencyKey.current = null;
  }, [source?.websiteId]);

  useEffect(() => {
    setImportText("");
    setImportResult(null);
    setActionError(null);
  }, [destination?.businessId]);

  const importPreview = useMemo(() => {
    if (!importText.trim()) return null;
    try {
      return parseHandoffPackageText(importText);
    } catch {
      return null;
    }
  }, [importText]);

  if (!open) return null;

  const runAction = async (label: string, work: () => Promise<void>) => {
    setSubmitting(label);
    setActionError(null);
    try {
      await work();
    } catch (error) {
      setActionError(friendlyHandoffError(error));
    } finally {
      setSubmitting(null);
    }
  };

  const createExport = () => {
    if (!source) return;
    const idempotencyKey =
      exportIdempotencyKey.current ??
      `desktop-handoff-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    exportIdempotencyKey.current = idempotencyKey;
    void runAction("export", async () => {
      const result = await exportPackage({
        instanceId: source.instanceId,
        includeSnapshots,
        includeRunbook,
        expiresInMs: Number(expiryDays) * 24 * 60 * 60_000,
        idempotencyKey,
      });
      exportIdempotencyKey.current = null;
      setActiveHandoffId(result.handoffId);
      setPackageJson(result.packageJson);
      setActiveChecksum(result.manifestSha256);
      setActiveEnvironmentCount(result.environmentCount);
    });
  };

  const downloadPackage = () => {
    if (!source || !activeHandoffId || !packageJson) return;
    void runAction("download", async () => {
      const suggestedFilename = formatHandoffFilename(
        source.websiteKey,
        activeHandoffId,
      );
      const bridge = getElectronBridge();
      if (bridge) {
        const result = await bridge.files.saveHandoffPackage({
          suggestedFilename,
          packageJson,
        });
        if (!result.saved) {
          setSaveStatus("Save cancelled. The verified package remains available.");
          return;
        }
      } else {
        const blob = new Blob([`${packageJson}\n`], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = suggestedFilename;
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      }
      await markDownloaded({ handoffId: activeHandoffId });
      setSaveStatus("Handoff package saved.");
    });
  };

  const copyPackage = () => {
    if (!packageJson) return;
    void runAction("copy", async () => {
      await navigator.clipboard.writeText(packageJson);
    });
  };

  const importHandoff = () => {
    if (!destination) return;
    void runAction("import", async () => {
      const parsed = parseHandoffPackageText(importText);
      const result = await importPackage({
        organizationId: destination.organizationId,
        businessId: destination.businessId,
        packageJson: parsed.packageJson,
      });
      setImportResult({
        websiteKey: result.websiteKey,
        environmentCount: result.environmentCount,
        connectionsRequired: result.connectionsRequired,
        idempotent: result.idempotent,
      });
    });
  };

  return (
    <aside
      aria-label="Website handoff"
      className="absolute inset-y-0 right-0 z-[85] flex w-full max-w-[34rem] flex-col border-l border-slate-300 bg-[#f8fafc] shadow-2xl sm:w-[34rem]"
    >
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-blue-700">
            Portable control authority
          </p>
          <h2 className="mt-1 font-serif text-2xl tracking-tight">Transfer website</h2>
          <p className="mt-1 text-xs text-slate-500">
            {source?.websiteTitle ?? destination?.businessName ?? "No destination selected"}
          </p>
        </div>
        <Button
          aria-label="Close website handoff"
          size="icon"
          variant="ghost"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {actionError ? (
          <p role="alert" className="m-5 border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            {actionError}
          </p>
        ) : null}

        <section aria-labelledby="handoff-export-heading" className="border-b border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 id="handoff-export-heading" className="font-semibold text-slate-950">
                Export this website
              </h3>
              <p className="mt-1 text-sm leading-5 text-slate-600">
                Packages portable website and environment identity for another ConvexPress or Virtual Overseer controller. Deployment keys and private management keys are never included.
              </p>
            </div>
            <FileOutput className="mt-0.5 size-5 shrink-0 text-blue-700" />
          </div>
          <div className="mt-4 grid gap-3 border border-slate-200 bg-slate-50 p-3 text-sm">
            <label className="flex items-start gap-3">
              <input
                checked={includeRunbook}
                className="mt-1"
                type="checkbox"
                onChange={(event) => setIncludeRunbook(event.target.checked)}
              />
              <span>
                <span className="block font-semibold">Include handoff runbook</span>
                <span className="text-xs text-slate-500">Adds the safe receiving-controller sequence.</span>
              </span>
            </label>
            <label className="flex items-start gap-3">
              <input
                checked={includeSnapshots}
                className="mt-1"
                type="checkbox"
                onChange={(event) => setIncludeSnapshots(event.target.checked)}
              />
              <span>
                <span className="block font-semibold">Include verified snapshot references</span>
                <span className="text-xs text-slate-500">Requires a current verified backup for every active environment.</span>
              </span>
            </label>
            <label className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600" htmlFor="handoff-expiry">
              Package expires
              <select
                id="handoff-expiry"
                className="mt-2 w-full border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-slate-950 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-200"
                value={expiryDays}
                onChange={(event) => setExpiryDays(event.target.value)}
              >
                <option value="1">In 1 day</option>
                <option value="7">In 7 days</option>
                <option value="30">In 30 days</option>
              </select>
            </label>
          </div>
          <Button
            className="mt-4 w-full bg-blue-700 text-white hover:bg-blue-800"
            disabled={!source || submitting !== null}
            onClick={createExport}
          >
            {submitting === "export" ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <PackageCheck className="mr-2 size-4" />
            )}
            Create verified handoff package
          </Button>

          {packageJson && activeHandoffId ? (
            <div className="mt-4 border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950">
              <p className="inline-flex items-center gap-2 font-bold uppercase tracking-[0.12em]">
                <ShieldCheck className="size-4" /> Package checksum verified
              </p>
              <p className="mt-2 break-all font-mono">{activeHandoffId}</p>
              {activeChecksum ? <p className="mt-2 break-all font-mono text-[10px]">SHA-256 {activeChecksum}</p> : null}
              {activeEnvironmentCount !== null ? (
                <p className="mt-2">{activeEnvironmentCount} isolated environment{activeEnvironmentCount === 1 ? "" : "s"}</p>
              ) : null}
              <label className="mt-3 block font-bold" htmlFor="handoff-package-output">Portable handoff package</label>
              <textarea
                id="handoff-package-output"
                aria-label="Portable handoff package"
                className="mt-2 h-24 w-full resize-y border border-emerald-300 bg-white p-2 font-mono text-[10px] text-slate-800"
                readOnly
                value={packageJson}
              />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" onClick={copyPackage}>
                  {submitting === "copy" ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <Copy className="mr-2 size-3.5" />}
                  Copy package
                </Button>
                <Button size="sm" className="bg-emerald-700 text-white hover:bg-emerald-800" onClick={downloadPackage}>
                  {submitting === "download" ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <Download className="mr-2 size-3.5" />} Save JSON
                </Button>
              </div>
              {saveStatus ? <p role="status" className="mt-2 font-semibold">{saveStatus}</p> : null}
            </div>
          ) : null}
        </section>

        <section aria-labelledby="handoff-import-heading" className="border-b border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 id="handoff-import-heading" className="font-semibold text-slate-950">
                Import into this business
              </h3>
              <p className="mt-1 text-sm leading-5 text-slate-600">
                Verifies the checksum, then creates the website and environment registry. Each environment remains disconnected until this controller is separately given its deployment admin key.
              </p>
            </div>
            <FileInput className="mt-0.5 size-5 shrink-0 text-blue-700" />
          </div>
          {destination ? (
            <p className="mt-3 border-l-4 border-blue-600 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-950">
              Destination: {destination.businessName}
            </p>
          ) : (
            <p role="alert" className="mt-3 border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              Select an organization and business before importing a website.
            </p>
          )}
          <label className="mt-4 block text-xs font-bold uppercase tracking-[0.12em] text-slate-600" htmlFor="handoff-package-file">
            Handoff JSON file
          </label>
          <input
            id="handoff-package-file"
            accept="application/json,.json"
            className="mt-2 block w-full border border-slate-300 bg-slate-50 p-2 text-xs"
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void file.text().then(setImportText).catch(() => {
                setActionError("The selected handoff file could not be read.");
              });
            }}
          />
          <label className="mt-4 block text-xs font-bold uppercase tracking-[0.12em] text-slate-600" htmlFor="handoff-package-input">
            Or paste package
          </label>
          <textarea
            id="handoff-package-input"
            aria-label="Handoff package to import"
            className="mt-2 h-28 w-full resize-y border border-slate-300 bg-white p-2 font-mono text-[10px] outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-200"
            placeholder='{"format":"convexpress-handoff", ...}'
            spellCheck={false}
            value={importText}
            onChange={(event) => {
              setImportText(event.target.value);
              setImportResult(null);
              setActionError(null);
            }}
          />
          {importText && !importPreview ? (
            <p role="alert" className="mt-2 text-xs font-semibold text-red-700">
              This is not a recognizable ConvexPress handoff package.
            </p>
          ) : importPreview ? (
            <p className="mt-2 text-xs text-slate-600">
              Ready to verify {importPreview.websiteKey ?? importPreview.handoffId} · {importPreview.environmentCount} environment{importPreview.environmentCount === 1 ? "" : "s"}
            </p>
          ) : null}
          <Button
            className="mt-4 w-full bg-blue-700 text-white hover:bg-blue-800"
            disabled={!destination || !importPreview || submitting !== null}
            onClick={importHandoff}
          >
            {submitting === "import" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileInput className="mr-2 size-4" />}
            Verify and import registry
          </Button>
          {importResult ? (
            <div role="status" className="mt-4 border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
              <p className="inline-flex items-center gap-2 font-semibold">
                <Check className="size-4" /> {importResult.idempotent ? "Website already matches this package" : "Website registry imported"}
              </p>
              <p className="mt-2 font-mono text-xs">{importResult.websiteKey}</p>
              <p className="mt-2 text-xs">
                {importResult.environmentCount} environments · {importResult.connectionsRequired} secure connections required
              </p>
            </div>
          ) : null}
        </section>

        <section aria-labelledby="handoff-history-heading" className="p-5">
          <h3 id="handoff-history-heading" className="font-semibold">Handoff history</h3>
          {handoffs === undefined ? (
            <p className="mt-3 inline-flex items-center gap-2 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" /> Loading handoffs</p>
          ) : handoffs.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No handoff packages have been created for this website.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {handoffs.map((handoff) => {
                const available = handoffCanBeDownloaded(handoff.status, handoff.expiresAt, Date.now());
                const confirmation = expectedHandoffRevocation(handoff.handoffId);
                return (
                  <li key={handoff.handoffId} className="border border-slate-200 bg-white p-3 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[10px]">{handoff.handoffId}</span>
                      <span className="font-bold uppercase tracking-[0.1em] text-slate-500">{handoff.status}</span>
                    </div>
                    <p className="mt-2 text-slate-500">Expires {formatTimestamp(handoff.expiresAt)}</p>
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!available}
                        onClick={() => {
                          setActiveHandoffId(handoff.handoffId);
                          setPackageJson("");
                          setActiveChecksum(null);
                          setActiveEnvironmentCount(null);
                        }}
                      >
                        <Download className="mr-2 size-3.5" /> Load package
                      </Button>
                      {handoff.status !== "revoked" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-700"
                          onClick={() => {
                            setRevokeId(handoff.handoffId);
                            setRevokeConfirmation("");
                          }}
                        >
                          <Trash2 className="mr-2 size-3.5" /> Revoke
                        </Button>
                      ) : null}
                    </div>
                    {revokeId === handoff.handoffId ? (
                      <div className="mt-3 border border-red-200 bg-red-50 p-3">
                        <label className="font-semibold text-red-950" htmlFor={`revoke-${handoff.handoffId}`}>
                          Type <code>{confirmation}</code>
                        </label>
                        <input
                          id={`revoke-${handoff.handoffId}`}
                          autoComplete="off"
                          className="mt-2 w-full border border-red-300 bg-white px-2 py-2 font-mono text-[10px]"
                          value={revokeConfirmation}
                          onChange={(event) => setRevokeConfirmation(event.target.value)}
                        />
                        <div className="mt-2 flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => setRevokeId(null)}>Keep package</Button>
                          <Button
                            size="sm"
                            className="bg-red-700 text-white hover:bg-red-800"
                            disabled={revokeConfirmation !== confirmation || submitting !== null}
                            onClick={() => void runAction("revoke", async () => {
                              await revokePackage({ handoffId: handoff.handoffId, confirmation: revokeConfirmation });
                              if (activeHandoffId === handoff.handoffId) {
                                setActiveHandoffId(null);
                                setPackageJson("");
                              }
                              setRevokeId(null);
                            })}
                          >
                            Revoke package
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </aside>
  );
}

function formatTimestamp(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function friendlyHandoffError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("expired")) return "This handoff package has expired.";
  if (message.includes("checksum")) return "The handoff checksum does not match its contents.";
  if (message.includes("current verified snapshot")) {
    return "Create a current verified backup for every active environment, or export without snapshot references.";
  }
  if (message.includes("collides") || message.includes("already exists")) {
    return "This package conflicts with a different website or environment already registered here.";
  }
  if (message.includes("CONTROL_PLANE_ACCESS_DENIED") || message.includes("not authorized")) {
    return "Your operator account is not authorized to transfer this website.";
  }
  return "The handoff could not be completed. No deployment credentials or site data were changed.";
}
