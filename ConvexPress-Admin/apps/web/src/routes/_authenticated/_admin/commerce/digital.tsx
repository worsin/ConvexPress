import { useState, useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { toast } from "sonner";
import {
  Download,
  FileDown,
  Key,
  Upload,
  Trash2,
  Copy,
  ChevronDown,
  ChevronUp,
  Package,
  Search,
  Shield,
  Eye,
  Clock,
  Hash,
  XCircle,
  Plus,
  Import,
} from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import { PluginGuard } from "@/components/plugins/PluginGuard";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/digital",
)({
  component: CommerceDigitalRoute,
});

function CommerceDigitalRoute() {
  return (
    <PluginGuard pluginId="commerceDigital">
      <CommerceDigitalPage />
    </PluginGuard>
  );
}

// ─── Formatters ────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDate(ts: number | undefined) {
  if (!ts) return "--";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Status Badge ─────────────────────────────────────────────────────────

function LicenseStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    available: "bg-blue-100 text-blue-800",
    assigned: "bg-amber-100 text-amber-800",
    active: "bg-emerald-100 text-emerald-800",
    expired: "bg-muted text-muted-foreground",
    revoked: "bg-red-100 text-red-800",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {status}
    </span>
  );
}

// ─── Upload File Form ─────────────────────────────────────────────────────

function UploadFileForm({
  productId,
  onClose,
}: {
  productId: string;
  onClose: () => void;
}) {
  const generateUploadUrl = useMutation(
    (api as any).media.mutations.generateUploadUrl,
  );
  const uploadFile = useMutation(
    (api as any).commerceDigital.mutations.uploadFile,
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [requiresLicense, setRequiresLicense] = useState(false);
  const [isPreviewable, setIsPreviewable] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) {
      toast.error("Please select a file");
      return;
    }
    if (!name.trim()) {
      toast.error("Please enter a file name");
      return;
    }

    setUploading(true);
    try {
      // Step 1: Get upload URL
      const uploadUrl = await generateUploadUrl();

      // Step 2: Upload the file to Convex storage
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": selectedFile.type },
        body: selectedFile,
      });

      if (!result.ok) {
        throw new Error("Failed to upload file to storage");
      }

      const { storageId } = await result.json();

      // Step 3: Create the digital file record
      await uploadFile({
        productId: productId as any,
        name: name.trim(),
        fileName: selectedFile.name,
        storageId,
        fileSize: selectedFile.size,
        mimeType: selectedFile.type || "application/octet-stream",
        version,
        releaseNotes: releaseNotes.trim() || undefined,
        requiresLicense,
        isPreviewable,
      });

      toast.success("File uploaded successfully");
      onClose();
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Upload failed",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Upload Digital File
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
        >
          <XCircle className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Display Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Premium Template Pack"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            required
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Version *
          </label>
          <input
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="1.0.0"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            required
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          File *
        </label>
        <div
          onClick={() => fileInputRef.current?.click()}
          className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 transition-colors hover:bg-muted/50"
        >
          <Upload className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {selectedFile
              ? `${selectedFile.name} (${formatBytes(selectedFile.size)})`
              : "Click to select a file"}
          </span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Release Notes
        </label>
        <textarea
          value={releaseNotes}
          onChange={(e) => setReleaseNotes(e.target.value)}
          rows={2}
          placeholder="What's new in this version..."
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={requiresLicense}
            onChange={(e) => setRequiresLicense(e.target.checked)}
            className="rounded border-border"
          />
          Requires license key
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={isPreviewable}
            onChange={(e) => setIsPreviewable(e.target.checked)}
            className="rounded border-border"
          />
          Previewable
        </label>
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={uploading}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {uploading ? "Uploading..." : "Upload File"}
        </button>
      </div>
    </form>
  );
}

// ─── Generate License Keys Form ───────────────────────────────────────────

function GenerateKeysForm({
  productId,
  onClose,
}: {
  productId: string;
  onClose: () => void;
}) {
  const generateKeys = useMutation(
    (api as any).commerceDigital.mutations.generateLicenseKeys,
  );

  const [count, setCount] = useState(10);
  const [keyType, setKeyType] = useState<
    "single" | "multi" | "unlimited" | "subscription"
  >("single");
  const [maxActivations, setMaxActivations] = useState(1);
  const [prefix, setPrefix] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (count < 1 || count > 1000) {
      toast.error("Count must be between 1 and 1000");
      return;
    }

    setBusy(true);
    try {
      const result = await generateKeys({
        productId: productId as any,
        count,
        keyType,
        maxActivations:
          keyType === "unlimited" ? undefined : maxActivations,
        prefix: prefix.trim() || undefined,
      });

      toast.success(`Generated ${result.length} license keys`);
      onClose();
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to generate keys",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Generate License Keys
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
        >
          <XCircle className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Quantity
          </label>
          <input
            type="number"
            min={1}
            max={1000}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Key Type
          </label>
          <select
            value={keyType}
            onChange={(e) => setKeyType(e.target.value as any)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          >
            <option value="single">Single device</option>
            <option value="multi">Multi device</option>
            <option value="unlimited">Unlimited</option>
            <option value="subscription">Subscription</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Max Activations
          </label>
          <input
            type="number"
            min={1}
            value={maxActivations}
            onChange={(e) => setMaxActivations(Number(e.target.value))}
            disabled={keyType === "unlimited"}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50 focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Key Prefix (optional)
        </label>
        <input
          type="text"
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          placeholder="e.g. PRO"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Generating..." : `Generate ${count} Keys`}
        </button>
      </div>
    </form>
  );
}

// ─── Import License Keys Form ─────────────────────────────────────────────

function ImportKeysForm({
  productId,
  onClose,
}: {
  productId: string;
  onClose: () => void;
}) {
  const importKeys = useMutation(
    (api as any).commerceDigital.mutations.importLicenseKeys,
  );

  const [keysText, setKeysText] = useState("");
  const [keyType, setKeyType] = useState<
    "single" | "multi" | "unlimited" | "subscription"
  >("single");
  const [maxActivations, setMaxActivations] = useState(1);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const keys = keysText
      .split("\n")
      .map((k) => k.trim())
      .filter(Boolean);

    if (keys.length === 0) {
      toast.error("Please enter at least one license key");
      return;
    }

    setBusy(true);
    try {
      const result = await importKeys({
        productId: productId as any,
        keys,
        keyType,
        maxActivations:
          keyType === "unlimited" ? undefined : maxActivations,
      });

      const successful = result.filter((r: any) => r.keyId).length;
      const failed = result.filter((r: any) => r.error).length;

      if (failed > 0) {
        toast.warning(
          `Imported ${successful} keys, ${failed} failed (duplicates)`,
        );
      } else {
        toast.success(`Imported ${successful} license keys`);
      }
      onClose();
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Import failed",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Import License Keys
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
        >
          <XCircle className="h-4 w-4" />
        </button>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          License Keys (one per line)
        </label>
        <textarea
          value={keysText}
          onChange={(e) => setKeysText(e.target.value)}
          rows={6}
          placeholder={"XXXX-XXXX-XXXX-XXXX\nYYYY-YYYY-YYYY-YYYY"}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Key Type
          </label>
          <select
            value={keyType}
            onChange={(e) => setKeyType(e.target.value as any)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          >
            <option value="single">Single device</option>
            <option value="multi">Multi device</option>
            <option value="unlimited">Unlimited</option>
            <option value="subscription">Subscription</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Max Activations
          </label>
          <input
            type="number"
            min={1}
            value={maxActivations}
            onChange={(e) => setMaxActivations(Number(e.target.value))}
            disabled={keyType === "unlimited"}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50 focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Importing..." : "Import Keys"}
        </button>
      </div>
    </form>
  );
}

// ─── Product Files Section ────────────────────────────────────────────────

function ProductFilesSection({ productId }: { productId: string }) {
  const files = useQuery(
    (api as any).commerceDigital.queries.getFilesByProduct,
    { productId, includeAllVersions: true },
  ) as
    | Array<{
        _id: string;
        name: string;
        fileName: string;
        fileSize: number;
        mimeType: string;
        version: string;
        releaseNotes?: string;
        isLatest: boolean;
        isPreviewable: boolean;
        requiresLicense: boolean;
        createdAt: number;
      }>
    | undefined;

  const deleteFile = useMutation(
    (api as any).commerceDigital.mutations.deleteFile,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(fileId: string) {
    try {
      await deleteFile({ fileId: fileId as any });
      toast.success("File deleted");
      setDeletingId(null);
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to delete file",
      );
    }
  }

  if (files === undefined) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <p className="py-3 text-sm text-muted-foreground">
        No digital files attached to this product yet.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border rounded-xl border border-border">
      {files.map((file) => (
        <div
          key={file._id}
          className="flex items-center justify-between gap-4 px-4 py-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <FileDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-foreground">
                  {file.name}
                </span>
                {file.isLatest && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                    Latest
                  </span>
                )}
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                  v{file.version}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                <span>{file.fileName}</span>
                <span>{formatBytes(file.fileSize)}</span>
                {file.requiresLicense && (
                  <span className="flex items-center gap-1">
                    <Shield className="h-3 w-3" /> License required
                  </span>
                )}
                {file.isPreviewable && (
                  <span className="flex items-center gap-1">
                    <Eye className="h-3 w-3" /> Previewable
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {deletingId === file._id ? (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs">
                <span className="text-red-800">Delete?</span>
                <button
                  type="button"
                  onClick={() => void handleDelete(file._id)}
                  className="font-medium text-red-700 underline"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setDeletingId(null)}
                  className="text-red-600"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setDeletingId(file._id)}
                title="Delete file"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-100 hover:text-red-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Product License Keys Section ─────────────────────────────────────────

function ProductLicenseKeysSection({
  productId,
}: {
  productId: string;
}) {
  const licenseKeys = useQuery(
    (api as any).commerceDigital.queries.listLicenseKeysByProduct,
    { productId, limit: 50 },
  ) as
    | Array<{
        _id: string;
        licenseKey: string;
        keyType: string;
        status: string;
        maxActivations?: number;
        expiresAt?: number;
        createdAt: number;
      }>
    | undefined;

  const availableCount = useQuery(
    (api as any).commerceDigital.queries.getAvailableLicenseKeyCount,
    { productId },
  ) as number | undefined;

  const revokeMutation = useMutation(
    (api as any).commerceDigital.mutations.revokeLicenseKey,
  );
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function handleRevoke(keyId: string) {
    try {
      await revokeMutation({ keyId: keyId as any });
      toast.success("License key revoked");
      setRevokingId(null);
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to revoke key",
      );
    }
  }

  function copyKey(key: string) {
    void navigator.clipboard.writeText(key);
    toast.success("License key copied");
  }

  if (licenseKeys === undefined) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <span className="rounded-lg bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800">
          {availableCount ?? "..."} available
        </span>
        <span className="text-xs text-muted-foreground">
          {licenseKeys.length} total keys
        </span>
      </div>

      {licenseKeys.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">
          No license keys generated for this product yet.
        </p>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border">
          {licenseKeys.map((key) => (
            <div
              key={key._id}
              className="flex items-center justify-between gap-4 px-4 py-2.5"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Key className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate font-mono text-xs text-foreground">
                  {key.licenseKey}
                </span>
                <LicenseStatusBadge status={key.status} />
                <span className="text-[10px] text-muted-foreground">
                  {key.keyType}
                  {key.maxActivations
                    ? ` (${key.maxActivations} act.)`
                    : ""}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => copyKey(key.licenseKey)}
                  title="Copy key"
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                {key.status !== "revoked" && (
                  <>
                    {revokingId === key._id ? (
                      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs">
                        <span className="text-red-800">Revoke?</span>
                        <button
                          type="button"
                          onClick={() => void handleRevoke(key._id)}
                          className="font-medium text-red-700 underline"
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setRevokingId(null)}
                          className="text-red-600"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setRevokingId(key._id)}
                        title="Revoke key"
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-100 hover:text-red-700"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Expanded Product Detail ──────────────────────────────────────────────

function ProductDigitalDetail({
  product,
}: {
  product: { _id: string; title: string };
}) {
  const [showUpload, setShowUpload] = useState(false);
  const [showGenerateKeys, setShowGenerateKeys] = useState(false);
  const [showImportKeys, setShowImportKeys] = useState(false);

  return (
    <div className="space-y-6 border-t border-border/50 bg-muted/20 px-5 py-5">
      {/* Digital Files */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <FileDown className="h-3.5 w-3.5" />
            Digital Files
          </h4>
          {!showUpload && (
            <button
              type="button"
              onClick={() => setShowUpload(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload File
            </button>
          )}
        </div>

        {showUpload && (
          <div className="mb-4">
            <UploadFileForm
              productId={product._id}
              onClose={() => setShowUpload(false)}
            />
          </div>
        )}

        <ProductFilesSection productId={product._id} />
      </div>

      {/* License Keys */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <Key className="h-3.5 w-3.5" />
            License Keys
          </h4>
          <div className="flex items-center gap-2">
            {!showImportKeys && !showGenerateKeys && (
              <>
                <button
                  type="button"
                  onClick={() => setShowImportKeys(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <Import className="h-3.5 w-3.5" />
                  Import
                </button>
                <button
                  type="button"
                  onClick={() => setShowGenerateKeys(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Generate
                </button>
              </>
            )}
          </div>
        </div>

        {showGenerateKeys && (
          <div className="mb-4">
            <GenerateKeysForm
              productId={product._id}
              onClose={() => setShowGenerateKeys(false)}
            />
          </div>
        )}

        {showImportKeys && (
          <div className="mb-4">
            <ImportKeysForm
              productId={product._id}
              onClose={() => setShowImportKeys(false)}
            />
          </div>
        )}

        <ProductLicenseKeysSection productId={product._id} />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────

function CommerceDigitalPage() {
  const products = useQuery(
    (api as any).commerce.products.list,
    {},
  ) as
    | Array<{
        _id: string;
        title: string;
        slug: string;
        status: string;
        sku?: string;
        isDownloadable?: boolean;
      }>
    | undefined;

  const [searchTerm, setSearchTerm] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAllProducts, setShowAllProducts] = useState(false);

  // Filter products: by default show only downloadable, unless toggled
  const filteredProducts = products
    ?.filter((p) => {
      if (!showAllProducts && !p.isDownloadable) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return (
          p.title.toLowerCase().includes(term) ||
          p.slug.toLowerCase().includes(term) ||
          p.sku?.toLowerCase().includes(term)
        );
      }
      return true;
    })
    .sort((a, b) => {
      // Downloadable products first
      if (a.isDownloadable && !b.isDownloadable) return -1;
      if (!a.isDownloadable && b.isDownloadable) return 1;
      return a.title.localeCompare(b.title);
    });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Digital Products
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Manage downloadable files, download tokens, and license keys
            for your digital products. Expand a product to upload files
            or generate license keys.
          </p>
        </div>
        <Link
          to="/commerce/products"
          className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/60"
        >
          All Products
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Digital Products
              </p>
              <p className="text-2xl font-bold text-foreground">
                {products?.filter((p) => p.isDownloadable).length ?? "..."}
              </p>
            </div>
            <div className="rounded-xl bg-blue-100 p-2.5 text-blue-700">
              <Download className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Total Products
              </p>
              <p className="text-2xl font-bold text-foreground">
                {products?.length ?? "..."}
              </p>
            </div>
            <div className="rounded-xl bg-muted p-2.5 text-muted-foreground">
              <Package className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                License Keys
              </p>
              <p className="text-2xl font-bold text-foreground">
                <Key className="inline h-5 w-5 text-muted-foreground" />
              </p>
              <p className="text-xs text-muted-foreground">
                Managed per product below
              </p>
            </div>
            <div className="rounded-xl bg-emerald-100 p-2.5 text-emerald-700">
              <Shield className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search products..."
            className="w-full rounded-lg border border-border bg-background py-2 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowAllProducts(!showAllProducts)}
          className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
            showAllProducts
              ? "bg-primary text-primary-foreground"
              : "border border-border text-foreground hover:bg-muted"
          }`}
        >
          {showAllProducts ? "All Products" : "Digital Only"}
        </button>
      </div>

      {/* Products list */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="grid grid-cols-[minmax(0,2fr)_120px_120px_120px] gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <div>Product</div>
          <div>Status</div>
          <div>Type</div>
          <div>Actions</div>
        </div>

        {filteredProducts === undefined ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-xl bg-muted"
              />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-10 text-center">
            <Download className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              {searchTerm
                ? "No products match your search."
                : showAllProducts
                  ? "No products exist yet."
                  : "No digital products yet. Toggle 'All Products' to see all products and attach digital files."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredProducts.map((product) => (
              <div key={product._id}>
                <div className="grid grid-cols-[minmax(0,2fr)_120px_120px_120px] gap-4 px-5 py-4">
                  {/* Product info */}
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(
                          expandedId === product._id
                            ? null
                            : product._id,
                        )
                      }
                      className="flex items-center gap-2 text-left"
                    >
                      {expandedId === product._id ? (
                        <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {product.title}
                        </p>
                        {product.sku && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            SKU: {product.sku}
                          </p>
                        )}
                      </div>
                    </button>
                  </div>

                  {/* Status */}
                  <div className="flex items-center">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        product.status === "publish"
                          ? "bg-emerald-100 text-emerald-800"
                          : product.status === "draft"
                            ? "bg-muted text-muted-foreground"
                            : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {product.status}
                    </span>
                  </div>

                  {/* Type */}
                  <div className="flex items-center">
                    {product.isDownloadable ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                        <Download className="h-3 w-3" />
                        Digital
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Physical
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center">
                    <Link
                      to="/commerce/products/$productId"
                      params={{ productId: product._id }}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Edit Product
                    </Link>
                  </div>
                </div>

                {/* Expanded detail */}
                {expandedId === product._id && (
                  <ProductDigitalDetail product={product} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
