import type { FooterColumn } from "@/lib/layout/types";

const classes = {
  left: "text-left items-start",
  center: "text-center items-center",
  right: "text-right items-end",
};

/** The cell can override its column; absent values inherit the row. */
export function footerCellAlignment(column: FooterColumn): string | undefined {
  const alignment = column.cell.alignment ?? column.alignment;
  return alignment ? classes[alignment] : undefined;
}
