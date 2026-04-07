export interface Theme {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  type: "preset" | "custom";
  headerConfig?: Record<string, unknown>;
  footerConfig?: Record<string, unknown>;
  layoutAssignments?: Record<string, unknown>;
  colorPalette?: Record<string, unknown>;
  thumbnail?: string;
  isActive?: boolean;
  createdAt: number;
  updatedAt: number;
}
