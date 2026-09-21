import { createFileRoute } from "@tanstack/react-router";
import { CustomBlockLibrary } from "@/components/custom-blocks/CustomBlockLibrary";
export const Route = createFileRoute("/_authenticated/_admin/pages/custom-blocks")({ component: CustomBlockLibrary });
