import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Extract an error message from an unknown error.
 * Handles standard Error objects, Convex error objects with data.message,
 * and falls back to a default message.
 */
export function getErrorMessage(error: unknown, fallback = "An error occurred"): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    typeof (error as { data?: { message?: string } }).data?.message === "string"
  ) {
    return (error as { data: { message: string } }).data.message;
  }
  return fallback;
}
