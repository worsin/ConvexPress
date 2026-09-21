import { createFileRoute } from "@tanstack/react-router";
import { BlockDiagnostics } from "@/components/blocks/BlockDiagnostics";
export const Route = createFileRoute(
	"/_authenticated/_admin/pages/block-diagnostics",
)({ component: BlockDiagnostics });
