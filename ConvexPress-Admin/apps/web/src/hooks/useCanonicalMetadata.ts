import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";

/** The caller retains its opened revision; never refresh it on submit. */
export function useCanonicalMetadata() {
  const update = useMutation(api.canonicalDocuments.updateMetadata);
  return async (args: Parameters<typeof update>[0]) => {
    try {
      const receipt = await update(args);
      toast.success("Document updated.");
      return receipt;
    } catch (error) {
      const failure = error as {data?: {code?: string; message?: string}; message?: string};
      toast.error(failure.data?.code === "CONFLICT"
        ? "This document changed while Quick Edit was open. Cancel and reopen Quick Edit to review the latest version. Your changes have not been saved."
        : failure.data?.message ?? failure.message ?? "Could not update document.");
      throw error;
    }
  };
}
